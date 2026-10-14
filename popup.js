/* popup.js — 弹窗逻辑（Chromium 用 chrome.* 回调，Firefox 用 browser.* Promise） */
'use strict';
var CAPI = globalThis.__IS_FIREFOX__ ? browser : chrome;
var $ = function (id) { return document.getElementById(id); };
var busy = false;

function sendMsg(msg, timeoutMs) {
  var ms = timeoutMs || 30000;
  if (globalThis.__IS_FIREFOX__) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ ok: false, error: '后台无响应（已等待 ' + Math.round(ms / 1000) + ' 秒）。请刷新扩展后再试' });
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
      resolve({ ok: false, error: '后台无响应（已等待 ' + Math.round(ms / 1000) + ' 秒）。请刷新扩展后再试' });
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

function showMsg(text, isError) {
  var el = $('msg');
  el.textContent = text || '';
  el.className = isError ? 'msg error' : 'msg ok';
}

function fmtTime(t) {
  if (!t) return '—';
  var d = new Date(t);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function summarize(r) {
  var s = r.stats || {};
  var parts = [];
  if (r.pushed) parts.push('已上传到服务器');
  if (r.pulled) parts.push('已更新本地书签');
  parts.push('新建 ' + (s.created || 0) + '，更新 ' + (s.updated || 0) +
    '，移动 ' + (s.moved || 0) + '，删除 ' + (s.deleted || 0));
  if (r.serverCount) {
    parts.push('服务器现有 ' + r.serverCount.folders + ' 个文件夹 / ' + r.serverCount.bookmarks + ' 个书签');
  }
  return parts.join('；');
}

async function refreshStatus() {
  var res = await sendMsg({ type: 'status' });
  if (!res.ok) return;
  var st = res.result;
  var dot = $('statusDot');
  if (st.running) dot.className = 'dot running';
  else if (st.lastResult && st.lastResult.ok) dot.className = 'dot good';
  else if (st.lastResult) dot.className = 'dot bad';
  else dot.className = 'dot';
  $('serverInfo').textContent = (st.config && st.config.url)
    ? st.config.url.replace(/\/+$/, '') : '—';
  if (st.lastResult) {
    var lr = st.lastResult;
    $('lastSync').textContent = fmtTime(lr.time) + (lr.ok ? '' : '（失败）');
    var detail = $('lastDetail');
    if (lr.ok && lr.summary) {
      detail.textContent = summarize(lr.summary);
      detail.className = 'row detail ok';
    } else {
      detail.textContent = lr.error || '';
      detail.className = 'row detail err';
    }
  } else {
    $('lastSync').textContent = '尚未同步';
    $('lastDetail').textContent = '';
    $('lastDetail').className = 'row detail';
  }
  if (!st.configured) $('configMissing').classList.remove('hidden');
  else $('configMissing').classList.add('hidden');
}

function setButtons(on) {
  ['btnMerge', 'btnUpload', 'btnDownload'].forEach(function (id) { $(id).disabled = !on; });
}

async function doSync(mode) {
  if (busy) return;
  var warns = {
    upload: '将用本浏览器书签完全覆盖服务器上的书签文件（服务器上的其他修改会丢失）。确定继续？',
    download: '将用服务器上的书签完全覆盖本浏览器书签（本地未同步的修改会丢失）。确定继续？'
  };
  if (warns[mode] && !confirm(warns[mode])) return;
  if (!(await ensurePermission())) {
    showMsg('未获得 WebDAV 服务器访问权限，无法同步', true);
    return;
  }
  busy = true;
  setButtons(false);
  showMsg(mode === 'merge' ? '同步中…' : (mode === 'upload' ? '上传中…' : '下载中…'));
  var res = await sendMsg({ type: 'sync', mode: mode });
  busy = false;
  setButtons(true);
  if (!res.ok) showMsg('同步失败：' + res.error, true);
  else showMsg('同步完成：' + summarize(res.result));
  await refreshStatus();
}

/* 检查并申请 WebDAV 服务器的主机权限（扩展页面有用户手势，可弹授权框） */
async function ensurePermission() {
  var r = await CAPI.storage.local.get('config');
  var cfg = r.config || {};
  if (!cfg.url) return true;
  var m = String(cfg.url).match(/^https?:\/\/[^\/]+/i);
  if (!m) return false;
  var pattern = m[0] + '/*';
  if (await CAPI.permissions.contains({ origins: [pattern] })) return true;
  try { return await CAPI.permissions.request({ origins: [pattern] }); } catch (e) { return false; }
}

function openOptions() { CAPI.runtime.openOptionsPage(); }

$('btnMerge').addEventListener('click', function () { doSync('merge'); });
$('btnUpload').addEventListener('click', function () { doSync('upload'); });
$('btnDownload').addEventListener('click', function () { doSync('download'); });
$('openOptions').addEventListener('click', function (e) { e.preventDefault(); openOptions(); });
$('openOptions1').addEventListener('click', function (e) { e.preventDefault(); openOptions(); });

refreshStatus();
