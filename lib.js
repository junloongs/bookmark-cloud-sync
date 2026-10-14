/* ============================================================
 * lib.js — 书签云同步核心库
 * 由 background.js 通过 importScripts（Chromium MV3 Service Worker）
 * 或 manifest 的 background.scripts（Firefox 事件页）加载，共享全局作用域。
 *
 * 数据模型：
 *   服务器上的快照文件（JSON）：
 *     { schema, updatedAt, device, roots: [guid...], nodes: { guid: node } }
 *   node = { type: 'folder'|'bookmark', title, url?, parent, children?,
 *            updatedAt, deleted?, deletedAt? }
 *   guid 是跨浏览器稳定的节点身份标识；chromeId 与 guid 的映射保存在 guidMap。
 *   lastState 记录每个 guid 上一次同步时的本地状态，用于检测本地修改。
 *
 * 同步策略（merge 模式）：
 *   每个节点独立按“最后修改时间（LWW）”合并；删除用墓碑（30 天）。
 *   首次同步（guidMap 为空）时按 URL/标题启发式配对，避免重复导入。
 * ============================================================ */
'use strict';

var IS_FF = typeof navigator !== 'undefined' && /Firefox/.test(navigator.userAgent);
var CAPI = IS_FF && typeof browser !== 'undefined' && browser.storage ? browser : chrome;

/* ---------------- 常量与工具 ---------------- */
var TOMBSTONE_TTL = 30 * 24 * 3600 * 1000; // 删除墓碑保留 30 天
var BAR_ID = '1';    // 书签栏
var OTHER_ID = '2';  // 其他书签
var MAX_CONFLICT_RETRY = 2;

function NOW() { return Date.now(); }

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function deviceName() {
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  var browser = 'Chrome';
  if (ua.indexOf('Edg/') >= 0) browser = 'Edge';
  else if (ua.indexOf('OPR') >= 0) browser = 'Opera';
  else if (ua.indexOf('Firefox/') >= 0) browser = 'Firefox';
  var os = '';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/Android/.test(ua)) os = 'Android';
  return browser + (os ? ' · ' + os : '');
}

function countNodes(nodes) {
  var folders = 0, bookmarks = 0;
  for (var g in nodes) {
    var n = nodes[g];
    if (!n || n.deleted) continue;
    if (n.type === 'folder') folders++; else bookmarks++;
  }
  return { folders: folders, bookmarks: bookmarks };
}

/* ---------------- 配置与本地存储 ---------------- */
var DEFAULT_CONFIG = {
  url: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
  path: 'bookmark-sync/bookmarks.json',
  mode: 'merge',          // 自动同步方式：merge | upload | download
  autoSync: false,
  intervalMinutes: 30
};

async function getConfig() {
  var r = await CAPI.storage.local.get('config');
  return Object.assign({}, DEFAULT_CONFIG, r.config || {});
}

async function saveConfig(c) { await CAPI.storage.local.set({ config: c }); }

async function getLocal(key, def) {
  var r = await CAPI.storage.local.get(key);
  return (key in r) ? r[key] : def;
}

async function setLocal(key, v) {
  var o = {};
  o[key] = v;
  await CAPI.storage.local.set(o);
}

/* ---------------- WebDAV 客户端 ---------------- */
function DavError(message, status) {
  this.message = message;
  this.status = status || 0;
}
DavError.prototype = Object.create(Error.prototype);
DavError.prototype.constructor = DavError;
DavError.prototype.name = 'DavError';

function basicAuth(u, p) {
  return 'Basic ' + btoa(unescape(encodeURIComponent(u + ':' + p)));
}

function joinUrl(cfg, path) {
  var base = String(cfg.url || '').replace(/\/+$/, '');
  var p = String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return base + '/' + p;
}

/* 带超时的 fetch：到时间后 abort，避免永远挂起。
 * timeoutMs 默认 20 秒；网络好时 1-2 秒，慢时 5-10 秒。
 * 显式设置 credentials: 'omit'：避免某些国产浏览器看到跨域 fetch
 * 收到 401 + WWW-Authenticate 时弹原生认证框（这些浏览器有自己的内置
 * 「网盘助手」对坚果云做探测，与扩展无关；omit 让浏览器明确不走 cookie
 * 鉴权通道）。 */
function fetchWithTimeout(url, opts, timeoutMs) {
  opts = opts || {};
  var ms = timeoutMs || 20000;
  if (typeof AbortController === 'undefined') {
    // 老浏览器没有 AbortController：只能等 fetch 自己解决（兜底）
    return fetch(url, Object.assign({ credentials: 'omit' }, opts));
  }
  var controller = new AbortController();
  var timer = setTimeout(function () {
    try { controller.abort(); } catch (e) {}
  }, ms);
  return fetch(url, Object.assign({ credentials: 'omit' }, opts, { signal: controller.signal }))
    .then(
      function (resp) { clearTimeout(timer); return resp; },
      function (err) {
        clearTimeout(timer);
        if (err && (err.name === 'AbortError' || err.code === 20)) {
          throw new Error('请求超时（' + Math.round(ms / 1000) + ' 秒）');
        }
        throw err;
      }
    );
}

async function davRequest(method, path, opts) {
  opts = opts || {};
  var cfg = await getConfig();
  if (!cfg.url) throw new DavError('未配置 WebDAV 地址');
  var headers = { Authorization: basicAuth(cfg.username || '', cfg.password || '') };
  if (opts.body !== null && opts.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  if (opts.etag) headers['If-Match'] = opts.etag;
  var resp;
  try {
    resp = await fetchWithTimeout(joinUrl(cfg, path), {
      method: method,
      headers: headers,
      body: opts.body !== undefined ? opts.body : null
    }, 20000);
  } catch (e) {
    var msg = (e && e.message) || String(e);
    if (msg.indexOf('超时') >= 0) {
      throw new DavError('请求超时（20 秒）。可能原因：\n• 扩展未获得该域名的访问权限（请重新「保存设置」并允许授权）\n• 网络断开 / 代理拦截\n• 服务器响应太慢', 0);
    }
    if (msg.indexOf('Failed to fetch') >= 0 || msg.indexOf('NetworkError') >= 0) {
      throw new DavError('网络请求失败。可能原因：\n• 扩展未获得 ' + (cfg.url || '') + ' 的访问权限（请重新「保存设置」并允许授权）\n• 网络断开 / 代理 / VPN 拦截\n• 该 WebDAV 服务不可达', 0);
    }
    throw new DavError('网络请求失败：' + msg, 0);
  }
  if (resp.status === 401) throw new DavError('认证失败（401）：请检查用户名与密码。坚果云必须使用「应用密码」而非登录密码。', 401);
  if (resp.status === 403) throw new DavError('没有权限（403）：账号可能被锁定，请到坚果云官网检查，或改用「应用密码」。', 403);
  if (resp.status === 507) throw new DavError('空间不足（507）：请清理网盘空间后重试。', 507);
  return resp;
}

async function davGet(path, etag) {
  var resp = await davRequest('GET', path, { etag: etag });
  if (resp.status === 304) return { notModified: true };
  if (resp.status === 404) return null;
  if (!resp.ok) throw new DavError('下载失败（HTTP ' + resp.status + '）', resp.status);
  return { etag: resp.headers.get('etag') || null, text: await resp.text() };
}

async function davPut(path, text, etag) {
  var resp = await davRequest('PUT', path, { body: text, etag: etag || undefined });
  if (resp.status === 412) throw new DavError('服务器上的书签文件刚被其他浏览器修改（冲突），请重新同步一次', 412);
  if (!resp.ok) throw new DavError('上传失败（HTTP ' + resp.status + '）', resp.status);
  return resp.headers.get('etag') || null;
}

async function davMkcol(path) {
  var resp = await davRequest('MKCOL', path);
  if (resp.ok || resp.status === 405) return;
  throw new DavError('创建目录失败（HTTP ' + resp.status + '）', resp.status);
}

async function ensureParentDir(path) {
  var segs = String(path).split('/').filter(Boolean).slice(0, -1);
  var cur = '';
  for (var i = 0; i < segs.length; i++) {
    cur = cur ? cur + '/' + segs[i] : segs[i];
    await davMkcol(cur);
  }
}

async function testConnection(cfgOverride) {
  var cfg = cfgOverride || await getConfig();
  var dir = String(cfg.path).split('/').filter(Boolean).slice(0, -1).join('/');
  var steps = [];
  try {
    await ensureParentDir(cfg.path);
    steps.push('建目录');
    var testPath = (dir ? dir + '/' : '') + '.bookmark-sync-test-' + Date.now() + '.json';
    await davPut(testPath, '{"ok":true}');
    steps.push('上传');
    var got = await davGet(testPath);
    if (!got) throw new DavError('下载失败：服务器返回 404（刚上传的文件读不到，可能是路径权限或大小写问题）', 404);
    if (got.text.indexOf('"ok"') < 0) {
      throw new DavError('下载校验失败：读到内容与上传不一致（返回了 HTML 错误页？），可能账号对该路径没有写权限', 403);
    }
    steps.push('下载');
    await davRequest('DELETE', testPath);
    steps.push('删除');
  } catch (e) {
    if (e instanceof DavError) {
      e.message = '连接测试在「' + steps.join(' → ') + '」之后失败：' + e.message;
    }
    throw e;
  }
  return { ok: true, message: '连接成功（已验证：建目录 / 上传 / 下载 / 删除 全部通过）' };
}

/* 把 DavError 转成对用户友好、可自助排查的中文提示。
 * cfg 可选，用于在错误信息里显示服务器地址 / 用户名。 */
function friendlyDavError(e, cfg) {
  var msg = (e && e.message) ? e.message : String(e);
  if (!(e instanceof DavError)) {
    return '未知错误：' + msg;
  }
  var s = e.status;
  if (s === 401) {
    return '认证失败（HTTP 401）\n\n' +
      '可能原因：\n' +
      '• 密码错误：坚果云 WebDAV 必须使用【应用专用密码】，不是登录密码\n' +
      '• 生成路径：登录坚果云网页版 → 右上角头像 → 账号信息 → 安全选项 → 「应用密码管理」\n' +
      '• 用户名应填注册邮箱（当前填的：' + (cfg && cfg.username ? cfg.username : '未填') + '）';
  }
  if (s === 403) {
    return '没有权限（HTTP 403）\n\n' +
      '可能原因：\n' +
      '• 账号被锁定（连续多次错误密码会触发，请到坚果云网页版确认账号正常）\n' +
      '• 坚果云对 WebDAV 有限制或该路径无写权限\n' +
      '• 应用密码已被单独撤销（重新生成一个试试）';
  }
  if (s === 404) {
    return '路径不存在或文件读不到（HTTP 404）\n\n' +
      '可能原因：\n' +
      '• 「书签文件路径」拼写错误或父目录未建（已自动尝试建目录仍失败）\n' +
      '• 路径区分大小写：坚果云大小写敏感\n' +
      '• 服务器地址末尾是否带 / 也会影响拼接结果';
  }
  if (s === 405) return msg; // MKCOL 已存在
  if (s === 412) return '并发冲突（HTTP 412）：' + msg + '\n\n请稍等几秒重试';
  if (s === 507) return '网盘空间不足（HTTP 507）：请清理后重试';
  if (s === 0) {
    return '网络请求失败（未连接到服务器）\n\n' +
      '可能原因：\n' +
      '• 网络断开 / 代理 / VPN 拦截\n' +
      '• 服务器地址拼写错误（注意是 https://，不是 http://）\n' +
      '• 浏览器扩展未获得该域名的访问权限（请重新「保存设置」并允许授权）\n' +
      '• 该 WebDAV 服务已停用或迁移';
  }
  return msg + '（HTTP ' + s + '）';
}

function originOf(url) {
  var m = String(url || '').match(/^https?:\/\/[^\/]+/i);
  return m ? m[0] : null;
}

/* 在扩展页面（popup/options，存在用户手势）中调用：检查并申请主机权限 */
async function ensureHostPermission(url) {
  var origin = originOf(url);
  if (!origin) return false;
  var pattern = origin + '/*';
  var has = await CAPI.permissions.contains({ origins: [pattern] });
  if (has) return true;
  try { return await CAPI.permissions.request({ origins: [pattern] }); } catch (e) { return false; }
}

/* ---------------- 本地快照 ---------------- */

/* 将本地书签树（书签栏 + 其他书签）导出为快照，同时：
 *   - 为新的 chromeId 分配 guid（写入 guidMap）
 *   - 与 lastState 对比检测“本地修改”（修改时间取当前时间）
 *   - 把本地已删除的节点输出为墓碑 */
async function buildLocalSnapshot(guidMap, lastState) {
  var tree = (await CAPI.bookmarks.getTree())[0];
  var nodes = {};
  var roots = [];
  var seen = new Set();

  function walk(node, parentGuid) {
    if (!node || !node.id) return null;
    var guid = guidMap[node.id];
    if (!guid) { guid = uuid(); guidMap[node.id] = guid; }
    seen.add(guid);
    var ls = lastState[guid];
    var changed = !ls || ls.deleted || ls.title !== node.title ||
      (node.url ? ls.url !== node.url : ls.url !== undefined) ||
      ls.parentGuid !== parentGuid;
    var ts = changed ? NOW() : ls.updatedAt;
    var n;
    if (node.url) {
      n = { type: 'bookmark', title: node.title, url: node.url, parent: parentGuid, updatedAt: ts };
    } else {
      n = { type: 'folder', title: node.title, parent: parentGuid, children: [], updatedAt: ts };
      var kids = node.children || [];
      for (var i = 0; i < kids.length; i++) {
        var subGuid = walk(kids[i], guid);
        if (subGuid) n.children.push(subGuid);
      }
    }
    nodes[guid] = n;
    return guid;
  }

  [BAR_ID, OTHER_ID].forEach(function (id) {
    var f = tree.children.find(function (c) { return c && c.id === id; });
    if (!f) return;
    var guid = guidMap[f.id];
    if (!guid) { guid = uuid(); guidMap[f.id] = guid; }
    seen.add(guid);
    var ls = lastState[guid];
    var changed = !ls || ls.deleted || ls.title !== f.title;
    var n = { type: 'folder', title: f.title, parent: null, children: [], updatedAt: changed ? NOW() : ls.updatedAt };
    for (var i = 0; i < (f.children || []).length; i++) {
      n.children.push(walk(f.children[i], guid));
    }
    nodes[guid] = n;
    roots.push(guid);
  });

  // 本地删除检测：lastState 中存在但当前树中不存在 → 墓碑
  for (var g in lastState) {
    if (seen.has(g)) continue;
    var ls2 = lastState[g];
    var deletedAt = ls2.deleted ? ls2.deletedAt : NOW();
    nodes[g] = {
      type: ls2.type || 'bookmark',
      title: ls2.title || '',
      url: ls2.url || undefined,
      parent: ls2.parentGuid || null,
      deleted: true,
      deletedAt: deletedAt
    };
  }
  return { nodes: nodes, roots: roots };
}

/* ---------------- 合并 ---------------- */

/* force: null（双向 LWW）| 'server'（服务器全赢，用于下载覆盖） */
function mergeSnapshots(server, local, force) {
  var nodes = {};
  var gs = Object.keys(server.nodes);
  var gl = Object.keys(local.nodes);
  var all = new Set(gs.concat(gl));
  all.forEach(function (g) {
    var s = server.nodes[g];
    var l = local.nodes[g];
    if (force === 'server') {
      nodes[g] = s ? s : {
        type: l.type, title: l.title, url: l.url, parent: l.parent,
        deleted: true, deletedAt: NOW()
      };
      return;
    }
    if (!s) { nodes[g] = l; return; }
    if (!l) { nodes[g] = s; return; }
    var sTs = (s.deleted ? s.deletedAt : s.updatedAt) || 0;
    var lTs = (l.deleted ? l.deletedAt : l.updatedAt) || 0;
    if (s.deleted && l.deleted) nodes[g] = sTs >= lTs ? s : l;
    else if (s.deleted) nodes[g] = sTs >= lTs ? s : l;
    else if (l.deleted) nodes[g] = lTs >= sTs ? l : s;
    else nodes[g] = lTs > sTs ? l : s; // 时间相同 → 服务器优先
  });
  return { roots: server.roots.length ? server.roots : local.roots, nodes: nodes };
}

function pruneTombstones(snapshot) {
  var cutoff = NOW() - TOMBSTONE_TTL;
  var nodes = {};
  for (var g in snapshot.nodes) {
    var n = snapshot.nodes[g];
    if (n.deleted && n.deletedAt && n.deletedAt < cutoff) continue;
    nodes[g] = n;
  }
  return { roots: snapshot.roots, nodes: nodes };
}

/* ---------------- 首次同步配对 ---------------- */

/* 服务器与本地都有内容、且本浏览器从未同步过（guidMap 为空）时：
 * 把本地临时 guid 重映射到服务器 guid（根文件夹按顺序一一对应；
 * 文件夹按“父目录+标题”配对；书签按 URL（优先标题相同）配对）。
 * 返回 { 本地临时guid: 服务器guid } */
function firstTimeMatch(server, local) {
  var remap = {};
  var taken = new Set();
  var rev = {}; // 服务器 guid -> 已配对的本地 guid
  var n = Math.min(server.roots.length, local.roots.length);
  for (var i = 0; i < n; i++) {
    remap[local.roots[i]] = server.roots[i];
    taken.add(local.roots[i]);
    rev[server.roots[i]] = local.roots[i];
  }

  var depth = {};
  function bfs(guid, d) {
    if (depth[guid] !== undefined) return;
    depth[guid] = d;
    var node = server.nodes[guid];
    if (node && node.children) for (var i = 0; i < node.children.length; i++) bfs(node.children[i], d + 1);
  }
  for (var r = 0; r < server.roots.length; r++) bfs(server.roots[r], 0);

  var serverList = Object.keys(server.nodes).sort(function (a, b) { return depth[a] - depth[b]; });

  // 文件夹：标题相同且父目录配对一致
  serverList.forEach(function (sg) {
    var s = server.nodes[sg];
    if (s.deleted || s.type !== 'folder') return;
    var lpid = rev[s.parent];
    var cands = [];
    for (var lg in local.nodes) {
      var l = local.nodes[lg];
      if (taken.has(lg) || l.deleted || l.type !== 'folder') continue;
      if (l.title !== s.title) continue;
      if (lpid !== undefined && l.parent !== lpid) continue;
      cands.push(lg);
    }
    if (cands.length === 1) { remap[cands[0]] = sg; taken.add(cands[0]); rev[sg] = cands[0]; }
  });

  // 书签：URL 相同（优先标题也相同）
  serverList.forEach(function (sg) {
    var s = server.nodes[sg];
    if (s.deleted || s.type !== 'bookmark') return;
    var lpid = rev[s.parent];
    var cands = [];
    for (var lg in local.nodes) {
      var l = local.nodes[lg];
      if (taken.has(lg) || l.deleted || l.type !== 'bookmark') continue;
      if (l.url !== s.url) continue;
      if (lpid !== undefined && l.parent !== lpid) continue;
      cands.push(lg);
    }
    if (!cands.length) return;
    var exact = cands.find(function (lg) { return local.nodes[lg].title === s.title; });
    var pick = exact || cands[0];
    remap[pick] = sg;
    taken.add(pick);
    rev[sg] = pick;
  });
  return remap;
}

function remapLocalSnapshot(local, remap) {
  var to = function (g) { return remap[g] || g; };
  var nodes = {};
  for (var g in local.nodes) {
    var n = local.nodes[g];
    nodes[to(g)] = Object.assign({}, n, {
      parent: n.parent ? to(n.parent) : null,
      children: (n.children || []).map(to)
    });
  }
  return { roots: local.roots.map(to), nodes: nodes };
}

/* 把配对结果写入 guidMap，并为配对节点初始化 lastState（时间取服务器时间，
 * 使“两边都没改”时服务器内容优先，而不是把本地内容误判为新修改） */
function adoptMatches(guidMap, lastState, remap, server, local) {
  for (var id in guidMap) {
    if (remap[guidMap[id]]) guidMap[id] = remap[guidMap[id]];
  }
  for (var t in remap) {
    var sg = remap[t];
    var s = server.nodes[sg];
    var l = local.nodes[sg];
    if (!s || s.deleted) continue;
    if (!l || l.deleted) continue;
    lastState[sg] = {
      type: l.type,
      title: l.title,
      url: l.url || undefined,
      parentGuid: l.parent,
      updatedAt: s.updatedAt || NOW(),
      deleted: false
    };
  }
}

function calmMatchedLocal(local, remap, server) {
  for (var t in remap) {
    var sg = remap[t];
    var s = server.nodes[sg];
    var l = local.nodes[sg];
    if (s && l && !s.deleted && !l.deleted) l.updatedAt = s.updatedAt || l.updatedAt;
  }
}

/* ---------------- 应用到本地书签 ---------------- */
var __applying = false;
function isApplying() { return __applying; }

async function applyMergedToChrome(merged, guidMap) {
  __applying = true;
  var stats = { created: 0, updated: 0, moved: 0, deleted: 0 };
  try {
    var tree = (await CAPI.bookmarks.getTree())[0];
    var nodeById = {};  // chromeId -> { title, url, parentId, children: [chromeId] }
    var idByGuid = {};  // guid -> chromeId

    (function walk(node, parentId) {
      if (!node || !node.id) return;
      nodeById[node.id] = {
        title: node.title,
        url: node.url || null,
        parentId: parentId,
        children: (node.children || []).map(function (c) { return c && c.id; }).filter(Boolean)
      };
      var kids = node.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i], node.id);
    })(tree, null);

    for (var id in guidMap) idByGuid[guidMap[id]] = id;

    var rootIds = merged.roots.map(function (g) { return idByGuid[g]; }).filter(Boolean);

    // BFS：按深度排序，保证父节点先于子节点处理
    var list = [];
    function collect(guid, depth) {
      var n = merged.nodes[guid];
      if (!n || n.deleted) return;
      list.push({ guid: guid, depth: depth, node: n });
      for (var i = 0; i < (n.children || []).length; i++) collect(n.children[i], depth + 1);
    }
    for (var r = 0; r < merged.roots.length; r++) collect(merged.roots[r], 0);
    list.sort(function (a, b) { return a.depth - b.depth; });

    // 创建 / 更新 / 移动
    for (var li = 0; li < list.length; li++) {
      var item = list[li];
      var guid = item.guid;
      var n = item.node;
      if (merged.roots.indexOf(guid) >= 0) continue; // 顶级文件夹不创建/改标题/移动
      var parentGuid = n.parent;
      if (!parentGuid) continue;
      var parentId = idByGuid[parentGuid];
      if (!parentId) continue;
      var nid = idByGuid[guid];
      if (!nid || !nodeById[nid]) {
        // 清理 guid 与旧 chromeId 的重复映射后创建
        for (var cid in guidMap) {
          if (guidMap[cid] === guid && cid !== nid) delete guidMap[cid];
        }
        var created = n.type === 'folder'
          ? await CAPI.bookmarks.create({ parentId: parentId, title: n.title })
          : await CAPI.bookmarks.create({ parentId: parentId, title: n.title, url: n.url });
        nid = created.id;
        guidMap[nid] = guid;
        idByGuid[guid] = nid;
        nodeById[nid] = { title: created.title, url: created.url || null, parentId: parentId, children: [] };
        nodeById[parentId].children.push(nid);
        stats.created++;
      } else {
        var cur = nodeById[nid];
        if (n.type === 'folder') {
          if (cur.title !== n.title) {
            await CAPI.bookmarks.update(nid, { title: n.title });
            cur.title = n.title;
            stats.updated++;
          }
        } else {
          var upd = {};
          if (cur.title !== n.title) upd.title = n.title;
          if (cur.url !== n.url) upd.url = n.url;
          if (Object.keys(upd).length) {
            await CAPI.bookmarks.update(nid, upd);
            if (upd.title !== undefined) cur.title = upd.title;
            if (upd.url !== undefined) cur.url = upd.url;
            stats.updated++;
          }
        }
        if (cur.parentId !== parentId) {
          await CAPI.bookmarks.move(nid, { parentId: parentId });
          var oldArr = nodeById[cur.parentId].children;
          var oi = oldArr.indexOf(nid);
          if (oi >= 0) oldArr.splice(oi, 1);
          cur.parentId = parentId;
          nodeById[parentId].children.push(nid);
          stats.moved++;
        }
      }
    }

    // 子节点排序（含顶级文件夹的子节点）
    for (var si = 0; si < list.length; si++) {
      var sitem = list[si];
      var sid = idByGuid[sitem.guid];
      if (!sid || !nodeById[sid]) continue;
      var target = (sitem.node.children || []).map(function (c) { return idByGuid[c]; }).filter(Boolean);
      var curArr = nodeById[sid].children;
      if (!target.length || arraysEqual(target, curArr)) continue;
      for (var ti = 0; ti < target.length; ti++) {
        if (curArr[ti] === target[ti]) continue;
        var pos = curArr.indexOf(target[ti]);
        if (pos < 0) continue;
        await CAPI.bookmarks.move(target[ti], { parentId: sid, index: ti });
        curArr.splice(pos, 1);
        curArr.splice(ti, 0, target[ti]);
        stats.moved++;
      }
    }

    // 删除（墓碑）
    var toRemove = [];
    for (var dg in merged.nodes) {
      var dn = merged.nodes[dg];
      if (!dn.deleted) continue;
      var did = idByGuid[dg];
      if (!did || rootIds.indexOf(did) >= 0) continue;
      toRemove.push(did);
    }
    for (var ri = 0; ri < toRemove.length; ri++) {
      var rid = toRemove[ri];
      if (!nodeById[rid]) continue;
      try {
        await CAPI.bookmarks.remove(rid);
        stats.deleted++;
      } catch (e) { /* 可能已被父目录级联删除 */ }
      // 清理内存模型与映射（包括级联删除的子树）
      var subs = [];
      (function sub(pid) {
        var cs = nodeById[pid] ? nodeById[pid].children : [];
        for (var i = 0; i < cs.length; i++) { subs.push(cs[i]); sub(cs[i]); }
      })(rid);
      subs.push(rid);
      for (var ui = 0; ui < subs.length; ui++) {
        var uid = subs[ui];
        var ug = idByGuid[uid];
        if (ug) delete idByGuid[ug];
        if (nodeById[uid]) {
          var p = nodeById[uid].parentId;
          if (p && nodeById[p]) {
            var pi = nodeById[p].children.indexOf(uid);
            if (pi >= 0) nodeById[p].children.splice(pi, 1);
          }
          delete nodeById[uid];
        }
        delete guidMap[uid];
      }
    }
  } finally {
    __applying = false;
  }
  return stats;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* 用当前 chrome 书签树刷新 lastState（时间戳取自 merged 节点）；
 * base 可传入内存中已更新的 lastState（例如刚做完首次配对） */
async function refreshLocalState(guidMap, merged, base) {
  var lastState = base || await getLocal('lastState', {});
  var tree = (await CAPI.bookmarks.getTree())[0];
  var alive = new Set();

(function walk(node, parentGuid) {
      if (!node || !node.id) return;
      var guid = guidMap[node.id];
      if (guid) {
        alive.add(guid);
        var m = merged.nodes[guid];
        var prev = lastState[guid];
        lastState[guid] = {
          type: node.url ? 'bookmark' : 'folder',
          title: node.title,
          url: node.url || undefined,
          parentGuid: parentGuid,
          updatedAt: (m && !m.deleted) ? m.updatedAt : (prev && !prev.deleted ? prev.updatedAt : NOW()),
          deleted: false
        };
      }
      var kids = node.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i], guid);
    })(tree, null);

  // 墓碑更新与过期清理
  var cutoff = NOW() - TOMBSTONE_TTL;
  for (var g in lastState) {
    if (alive.has(g)) continue;
    var m = merged.nodes[g];
    if (m && m.deleted) {
      lastState[g] = {
        type: m.type, title: m.title, url: m.url, parentGuid: m.parent,
        updatedAt: m.deletedAt, deletedAt: m.deletedAt, deleted: true
      };
    } else if (lastState[g].deleted && lastState[g].deletedAt &&
               lastState[g].deletedAt < cutoff && !(g in merged.nodes)) {
      delete lastState[g];
    }
  }
  await setLocal('lastState', lastState);
  return lastState;
}

/* ---------------- 同步主流程 ---------------- */
async function runSync(mode, opts) {
  opts = opts || {};
  var cfg = await getConfig();
  if (!cfg.url) throw new Error('请先在设置页填写 WebDAV 地址');
  if (!cfg.username || !cfg.password) throw new Error('请先在设置页填写 WebDAV 用户名与密码');
  var path = String(cfg.path || 'bookmark-sync/bookmarks.json');

  /* --- 上传覆盖模式：无条件覆盖服务器文件 --- */
  if (mode === 'upload') {
    await ensureParentDir(path);
    var uGuidMap = await getLocal('guidMap', {});
    var uLastState = await getLocal('lastState', {});
    var uLocal = await buildLocalSnapshot(uGuidMap, uLastState);
    var uSnapshot = pruneTombstones({ roots: uLocal.roots, nodes: uLocal.nodes });
    uSnapshot.schema = 1;
    uSnapshot.updatedAt = NOW();
    uSnapshot.device = deviceName();
    var uEtag = await davPut(path, JSON.stringify(uSnapshot));
    await refreshLocalState(uGuidMap, uSnapshot, uLastState);
    await setLocal('guidMap', uGuidMap);
    await setLocal('lastEtag', uEtag);
    await setLocal('lastServer', uSnapshot);
    return {
      mode: 'upload', pushed: true, pulled: false,
      stats: { created: 0, updated: 0, moved: 0, deleted: 0 },
      serverCount: countNodes(uSnapshot.nodes)
    };
  }

  /* --- 下载服务器文件 --- */
  var etag = await getLocal('lastEtag', null);
  var serverRaw = await davGet(path, etag || undefined);
  var server = null;
  var serverEtag = null;
  if (serverRaw && serverRaw.notModified) {
    server = await getLocal('lastServer', null);
    serverEtag = etag;
    if (!server) {
      // 本地缓存丢失：重新完整下载
      serverRaw = await davGet(path);
      if (serverRaw && !serverRaw.notModified) {
        try { server = JSON.parse(serverRaw.text); } catch (e) { throw new Error('服务器上的书签文件不是有效的 JSON'); }
        serverEtag = serverRaw.etag;
      }
    }
  } else if (serverRaw) {
    try { server = JSON.parse(serverRaw.text); } catch (e) { throw new Error('服务器上的书签文件不是有效的 JSON，请检查「书签文件路径」是否正确'); }
    serverEtag = serverRaw.etag;
    await setLocal('lastServer', server);
    await setLocal('lastEtag', serverEtag);
  }
  if (server && (!server.nodes || !server.roots)) {
    throw new Error('服务器上的书签文件格式不正确');
  }

  var guidMap = await getLocal('guidMap', {});
  var lastState = await getLocal('lastState', {});
  var wasEmpty = Object.keys(guidMap).length === 0;
  var local = await buildLocalSnapshot(guidMap, lastState);

  // 首次同步配对（根文件夹 + 内容启发式匹配）
  if (server && wasEmpty) {
    var remap = firstTimeMatch(server, local);
    local = remapLocalSnapshot(local, remap);
    adoptMatches(guidMap, lastState, remap, server, local);
    calmMatchedLocal(local, remap, server);
  }

  /* --- 服务器上还没有书签文件：以本地为准首次上传 --- */
  if (!server) {
    var snapshot = pruneTombstones({ roots: local.roots, nodes: local.nodes });
    snapshot.schema = 1;
    snapshot.updatedAt = NOW();
    snapshot.device = deviceName();
    await ensureParentDir(path);
    var newEtag = await davPut(path, JSON.stringify(snapshot));
    await refreshLocalState(guidMap, snapshot, lastState);
    await setLocal('guidMap', guidMap);
    await setLocal('lastEtag', newEtag);
    await setLocal('lastServer', snapshot);
    return {
      mode: mode, pushed: true, pulled: false,
      stats: { created: 0, updated: 0, moved: 0, deleted: 0 },
      serverCount: countNodes(snapshot.nodes)
    };
  }

  /* --- 下载覆盖模式：服务器全赢，本地多余节点删除，不上传 --- */
  if (mode === 'download') {
    var dMerged = mergeSnapshots(server, local, 'server');
    var dStats = await applyMergedToChrome(dMerged, guidMap);
    await refreshLocalState(guidMap, dMerged, lastState);
    await setLocal('guidMap', guidMap);
    await setLocal('lastEtag', serverEtag);
    return { mode: 'download', pushed: false, pulled: true, stats: dStats, serverCount: countNodes(server.nodes) };
  }

  /* --- 双向合并 --- */
  var merged = mergeSnapshots(server, local, null);
  var pruned = pruneTombstones(merged);
  var stats = await applyMergedToChrome(pruned, guidMap);
  await refreshLocalState(guidMap, pruned, lastState);
  await setLocal('guidMap', guidMap);

  var snapshot2 = { schema: 1, updatedAt: NOW(), device: deviceName(), roots: pruned.roots, nodes: pruned.nodes };
  var changed = !deepEqual(snapshot2.roots, server.roots) || !deepEqual(snapshot2.nodes, server.nodes);
  var outEtag = serverEtag;
  if (changed) {
    await ensureParentDir(path);
    try {
      outEtag = await davPut(path, JSON.stringify(snapshot2), serverEtag || undefined);
    } catch (e) {
      if (e instanceof DavError && e.status === 412 && (opts.retries || 0) < MAX_CONFLICT_RETRY) {
        // 其他浏览器刚写入：以最新服务器内容重新合并一次
        return runSync(mode, { retries: (opts.retries || 0) + 1 });
      }
      throw e;
    }
    await setLocal('lastServer', snapshot2);
  }
  await setLocal('lastEtag', outEtag);
  return {
    mode: 'merge',
    pushed: changed,
    pulled: (stats.created + stats.updated + stats.moved + stats.deleted) > 0,
    stats: stats,
    serverCount: countNodes(pruned.nodes)
  };
}
