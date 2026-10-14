/* options.js — 设置页逻辑 */
'use strict';
var CAPI = globalThis.__IS_FIREFOX__ ? browser : chrome;
var $ = function (id) { return document.getElementById(id); };

var DEFAULTS = {
  url: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
  path: 'bookmark-sync/bookmarks.json',
  mode: 'merge',
  autoSync: false,
  intervalMinutes: 30
};

function sendMsg(msg, timeoutMs) {
  var ms = timeoutMs || 30000;
  if (globalThis.__IS_FIREFOX__) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ ok: false, error: '后台无响应（已等待 ' + Math.round(ms / 1000) + ' 秒）。\n\n可能原因：\n• 后台脚本未启动（刷新扩展后再试）\n• 浏览器版本过旧\n建议：到扩展管理页点击「重新加载」' });
      }, ms);
      browser.runtime.sendMessage(msg).then(
        function (r) {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve(r || { ok: false, error: '后台无响应' });
        },
        function (e) {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve({ ok: false, error: String((e && e.message) || e) });
        }
      );
    });
  }
  return new Promise(function (resolve) {
    var done = false;
    var t = setTimeout(function () {
      if (done) return;
      done = true;
      resolve({ ok: false, error: '后台无响应（已等待 ' + Math.round(ms / 1000) + ' 秒）。\n\n可能原因：\n• 后台脚本未启动（刷新扩展后再试）\n• Service Worker 被浏览器回收\n• 浏览器版本过旧\n建议：到 chrome://extensions 点击扩展的「重新加载」按钮后再试' });
    }, ms);
    CAPI.runtime.sendMessage(msg, function (r) {
      if (done) return;
      done = true;
      clearTimeout(t);
      if (CAPI.runtime.lastError) resolve({ ok: false, error: CAPI.runtime.lastError.message });
      else resolve(r || { ok: false, error: '后台无响应' });
    });
  });
}

function setMsg(elId, text, isError) {
  var el = $(elId);
  el.textContent = text || '';
  el.className = isError ? 'msg error' : 'msg ok';
}

async function load() {
  var r = await CAPI.storage.local.get('config');
  var cfg = Object.assign({}, DEFAULTS, r.config || {});
  $('url').value = cfg.url || '';
  $('username').value = cfg.username || '';
  $('password').value = cfg.password || '';
  $('path').value = cfg.path || '';
  $('mode').value = cfg.mode || 'merge';
  $('autoSync').checked = !!cfg.autoSync;
  $('interval').value = cfg.intervalMinutes || 30;
}

async function readForm() {
  var cfg = {
    url: ($('url').value || '').trim(),
    username: ($('username').value || '').trim(),
    password: $('password').value,
    path: ($('path').value || '').trim().replace(/^\/+/, ''),
    mode: $('mode').value,
    autoSync: $('autoSync').checked,
    intervalMinutes: Math.max(1, Math.floor(Number($('interval').value) || 30))
  };
  if (!/^https?:\/\//i.test(cfg.url)) throw new Error('服务器地址必须以 http(s):// 开头');
  if (!cfg.username || !cfg.password) throw new Error('请填写用户名与密码');
  if (!cfg.path) throw new Error('请填写书签文件路径');
  return cfg;
}

/* 申请 host 权限。Chrome 在「已授权」时会立刻返回 true 不弹框；
 * 在「未授权」时会弹出授权框等待用户操作。
 * ★ 必须在 click handler 的「第一个 await」直接调用本函数，
 *   不能先 contains（contains 本身会跨微任务边界，把用户手势丢掉）。 */
async function requestHostPermission(url) {
  var m = String(url).match(/^https?:\/\/[^\/]+/i);
  if (!m) return { ok: false, reason: '服务器地址格式不正确（必须以 http(s):// 开头）' };
  var pattern = m[0] + '/*';
  try {
    var granted = await CAPI.permissions.request({ origins: [pattern] });
    if (granted) return { ok: true, alreadyGranted: false };
    return { ok: false, reason: '用户拒绝了授权' };
  } catch (e) {
    return { ok: false, reason: '请求授权异常：' + ((e && e.message) || e) };
  }
}

/* 查询当前已授权的 host 权限（用于诊断面板） */
async function getGrantedHosts() {
  try {
    var all = await CAPI.permissions.getAll();
    return (all && all.origins) ? all.origins.slice() : [];
  } catch (e) { return []; }
}

/* 探测 site access 是否真的生效：发送一次轻量级 OPTIONS 请求。
 * 关键场景：API 层面权限已授权（permissions.contains=true），
 * 但 Edge 的「自动允许在以下站点上访问」总开关关闭时，fetch 仍被拦截。
 * 本函数返回 {ok, reason}，失败时给出针对性提示。 */
async function probeSiteAccess(url) {
  var m = String(url).match(/^https?:\/\/[^\/]+/i);
  if (!m) return { ok: false, reason: '地址格式错误' };
  var probeUrl = m[0] + '/';
  try {
    var resp = await fetchWithTimeout(probeUrl, { method: 'OPTIONS' }, 6000);
    if (typeof resp.status === 'number' && resp.status >= 0) return { ok: true };
    return { ok: false, reason: '服务器返回异常状态' };
  } catch (e) {
    var msg = (e && e.message) || String(e);
    if (msg.indexOf('超时') >= 0) {
      return { ok: false, reason: '请求超时（6 秒）。可能是网络问题或服务器无响应' };
    }
    // Failed to fetch / NetworkError → 几乎都是 CORS 或 site access 被浏览器拦截
    return {
      ok: false,
      reason: 'fetch 被浏览器拦截。' + msg
    };
  }
}

/* 给一段「host 权限 API 已授权但 fetch 失败」场景的针对性提示 */
function siteAccessHint(url) {
  return '\n\n排查步骤：\n' +
    '1. 如果你用的是 Edge：打开 edge://extensions → 本扩展的「详细信息」\n' +
    '   • 把「自动允许在以下站点上访问」打开\n' +
    '   • 找到「' + (function () { var m = String(url).match(/^https?:\/\/[^\/]+/i); return m ? m[0] + '/*' : url; })() + '」并打开\n' +
    '2. 如果你用的是 Chrome：打开 chrome://extensions → 本扩展的「详细信息」→ 「网站访问」处检查\n' +
    '3. 重新打开本设置页并点「测试连接」';
}

async function save() {
  // ★ 第一个 await：紧贴 click handler，申请 host 权限
  var url = ($('url').value || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    setMsg('cfgMsg', '保存失败：服务器地址必须以 http(s):// 开头', true);
    return;
  }
  var perm = await requestHostPermission(url);
  if (!perm.ok) {
    setMsg('cfgMsg',
      '✘ ' + (perm.reason || '未获得 ' + url + ' 的访问权限') + '\n\n' +
      '常见原因：\n' +
      '• 浏览器拦截了授权弹窗（看地址栏右侧是否有弹窗拦截图标）\n' +
      '• 之前点过「拒绝」：到 chrome://extensions → 本扩展的「详细信息」→「网站访问」→ 把 ' + url + ' 改成「在特定网站上允许」\n' +
      '• 公司/学校电脑策略禁止此域名',
      true);
    return;
  }
  var cfg;
  try { cfg = await readForm(); } catch (e) {
    setMsg('cfgMsg', '保存失败：' + e.message, true);
    return;
  }
  var old = ((await CAPI.storage.local.get('config')).config) || {};
  if (old.url !== cfg.url || old.path !== cfg.path) {
    // 服务器或路径变了，旧缓存作废
    await CAPI.storage.local.remove(['lastEtag', 'lastServer']);
  }
  await CAPI.storage.local.set({ config: cfg });
  var savedMsg = '✔ 已保存';
  // 检测夸克浏览器：它对 401 认证弹窗加了约 30 秒超时，用户需要心理准备
  if (/Quark/i.test((typeof navigator !== 'undefined' && navigator.userAgent) || '')) {
    savedMsg += '\n\n⚠ 你正在使用夸克浏览器：下次点「测试连接」时，' +
      '如果你看到浏览器弹出账号密码框，请立即填写坚果云账号密码并点确认；' +
      '夸克会自动关闭停留时间过长的弹窗。';
  }
  setMsg('cfgMsg', savedMsg, false);
  refreshDiag();
}

async function test() {
  // ★ 第一个 await：紧贴 click handler，申请 host 权限
  var url = ($('url').value || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    setMsg('cfgMsg', '保存失败：服务器地址必须以 http(s):// 开头', true);
    return;
  }
  var perm = await requestHostPermission(url);
  if (!perm.ok) {
    setMsg('cfgMsg',
      '✘ ' + (perm.reason || '未获得 ' + url + ' 的访问权限') + '\n\n' +
      '常见原因：\n' +
      '• 之前点过「拒绝」：到 chrome://extensions → 本扩展的「详细信息」→「网站访问」→ 把 ' + url + ' 改成「在特定网站上允许」',
      true);
    return;
  }
  // 权限 API 已通过，探测 site access 是否真的生效（Edge 特有场景）
  setMsg('cfgMsg', '正在探测 site access…');
  var probe = await probeSiteAccess(url);
  if (!probe.ok) {
    setMsg('cfgMsg', '✘ host 权限已申请，但浏览器仍拦截了请求：' + probe.reason + siteAccessHint(url), true);
    return;
  }
  var cfg;
  try { cfg = await readForm(); } catch (e) {
    setMsg('cfgMsg', '✘ ' + e.message, true);
    return;
  }
  await CAPI.storage.local.set({ config: cfg });
  setMsg('cfgMsg', '正在测试连接（建目录 / 上传 / 下载 / 删除，约 2-10 秒）…');
  try {
    // 直接在本页面调 lib.js 的 testConnection，绕开 Service Worker 消息链路
    var r = await testConnection(cfg);
    setMsg('cfgMsg', '✔ ' + r.message, false);
  } catch (e) {
    var msg = friendlyDavError(e, cfg);
    // 失败时如果看起来是 site access 问题，附上 Edge 特定提示
    if (e instanceof DavError && (e.status === 0)) {
      msg += siteAccessHint(url);
    }
    setMsg('cfgMsg', '✘ ' + msg, true);
  }
}

var syncing = false;
async function doSync(mode) {
  if (syncing) return;
  var warns = {
    upload: '将用本浏览器书签完全覆盖服务器上的书签文件（服务器上的其他修改会丢失）。确定继续？',
    download: '将用服务器上的书签完全覆盖本浏览器书签（本地未同步的修改会丢失）。确定继续？'
  };
  if (warns[mode] && !confirm(warns[mode])) return;
  // ★ 第一个 await：紧贴 click handler，申请 host 权限
  var url = ($('url').value || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    setMsg('syncMsg', '服务器地址必须以 http(s):// 开头', true);
    return;
  }
  var perm = await requestHostPermission(url);
  if (!perm.ok) {
    setMsg('syncMsg',
      '✘ ' + (perm.reason || '未获得 ' + url + ' 的访问权限') + '\n\n' +
      '到 chrome://extensions → 本扩展的「详细信息」→「网站访问」处检查授权状态。',
      true);
    return;
  }
  var cfg;
  try { cfg = await readForm(); } catch (e) {
    setMsg('syncMsg', e.message, true);
    return;
  }
  await CAPI.storage.local.set({ config: cfg });
  syncing = true;
  setMsg('syncMsg', mode === 'merge' ? '同步中…' : (mode === 'upload' ? '上传中…' : '下载中…'));
  var res = await sendMsg({ type: 'sync', mode: mode });
  syncing = false;
  if (!res.ok) setMsg('syncMsg', '✘ ' + res.error, true);
  else {
    var s = res.result.stats || {};
    setMsg('syncMsg', '同步完成 ✔（新建 ' + (s.created || 0) + '，更新 ' + (s.updated || 0) +
      '，移动 ' + (s.moved || 0) + '，删除 ' + (s.deleted || 0) + '）', false);
  }
}

/* 诊断面板：显示当前已授权的 host 权限 + site access 实际是否生效 */
async function refreshDiag() {
  var el = $('diagInfo');
  if (!el) return;
  try {
    var all = await CAPI.permissions.getAll();
    var origins = (all && all.origins) ? all.origins : [];
    var r = await CAPI.storage.local.get('config');
    var cfg = r.config || {};
    var target = '';
    if (cfg.url) {
      var m = String(cfg.url).match(/^https?:\/\/[^\/]+/i);
      if (m) target = m[0] + '/*';
    }
    var apiGranted = origins.indexOf(target) >= 0;
    var lines = [];
    lines.push('① API 层 host 权限（permissions.getAll）');
    if (!origins.length) lines.push('  （无）');
    else origins.forEach(function (o) { lines.push('  • ' + o); });
    lines.push('');
    lines.push('② 当前服务器期望的权限：' + (target || '（未配置）'));
    lines.push('   匹配状态：' + (apiGranted ? '✔ 已授权' : '✘ 未授权'));
    lines.push('');
    if (apiGranted && target) {
      lines.push('③ 探测 site access 实际是否生效…');
      var probe = await probeSiteAccess(cfg.url);
      lines.push('   ' + (probe.ok ? '✔ fetch 可用' : '✘ fetch 仍被拦截：' + probe.reason));
      if (!probe.ok) lines.push('   → 多见于 Edge 浏览器，需要在 edge://extensions → 详细信息里' +
        '\n     打开「自动允许在以下站点上访问」总开关' +
        '\n     和「' + target + '」具体站点开关');
    } else {
      lines.push('③ site access 探测：跳过（API 权限未授予）');
    }
    el.textContent = lines.join('\n');
  } catch (e) {
    el.textContent = '查询权限失败：' + (e && e.message ? e.message : e);
  }
}

$('btnSave').addEventListener('click', save);
$('btnTest').addEventListener('click', test);
$('btnMerge').addEventListener('click', function () { doSync('merge'); });
$('btnUpload').addEventListener('click', function () { doSync('upload'); });
$('btnDownload').addEventListener('click', function () { doSync('download'); });
$('btnReset').addEventListener('click', async function () {
  if (!confirm('清除本地同步状态（guid 映射 / 时间戳 / 缓存）后，下次合并同步会重新与服务器书签自动配对。确定？')) return;
  await CAPI.storage.local.remove(['guidMap', 'lastState', 'lastEtag', 'lastServer', 'lastResult']);
  setMsg('syncMsg', '已清除本地同步状态', false);
});
$('btnDiag').addEventListener('click', refreshDiag);

load();
refreshDiag();
