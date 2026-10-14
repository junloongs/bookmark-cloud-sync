/* ============================================================
 * background.js — 后台入口
 * Chromium（MV3）：Service Worker，importScripts 引入 lib.js
 * Firefox：事件页，由 manifest 的 background.scripts 依次加载
 *   shim.js → lib.js → background.js
 * ============================================================ */
'use strict';
if (typeof importScripts === 'function') importScripts('lib.js');

var ALARM_NAME = 'autosync';
var runningPromise = null;

/* 保证同一时刻只有一个同步任务在跑；重复请求复用进行中的任务 */
function runExclusive(mode) {
  if (!runningPromise) {
    runningPromise = (async function () {
      var summary = await runSync(mode);
      await setLocal('lastResult', { time: NOW(), ok: true, summary: summary });
      return summary;
    })()
      .catch(async function (e) {
        await setLocal('lastResult', { time: NOW(), ok: false, error: String((e && e.message) || e) });
        throw e;
      })
      .finally(function () { runningPromise = null; });
  }
  return runningPromise;
}

async function setupAlarm() {
  await CAPI.alarms.clear(ALARM_NAME).catch(function () {});
  var cfg = await getConfig();
  if (cfg.autoSync) {
    var mins = Math.max(1, Math.floor(Number(cfg.intervalMinutes) || 30));
    CAPI.alarms.create(ALARM_NAME, { periodInMinutes: mins });
  }
}

function autoRun() {
  getConfig().then(function (cfg) {
    if (!cfg.autoSync) return;
    return runExclusive(cfg.mode || 'merge');
  }).catch(function () {});
}

function handleMessage(msg) {
  return (async function () {
    if (!msg || !msg.type) return null;
    switch (msg.type) {
      case 'status': {
        var cfg = await getConfig();
        var lastResult = await getLocal('lastResult', null);
        return {
          configured: !!(cfg.url && cfg.username && cfg.password),
          running: !!runningPromise,
          lastResult: lastResult,
          config: {
            url: cfg.url,
            username: cfg.username,
            path: cfg.path,
            mode: cfg.mode,
            autoSync: cfg.autoSync,
            intervalMinutes: cfg.intervalMinutes
          }
        };
      }
      case 'sync':
        return runExclusive(msg.mode === 'upload' ? 'upload' : (msg.mode === 'download' ? 'download' : 'merge'));
      case 'test': {
        var cfg2 = await getConfig();
        var origin = originOf(cfg2.url);
        if (!origin) throw new Error('WebDAV 地址无效，必须以 http(s):// 开头');
        var granted = await CAPI.permissions.contains({ origins: [origin + '/*'] });
        if (!granted) throw new Error('未获得服务器访问权限，请在设置页点击「保存设置」并允许授权');
        var r = await testConnection();
        return r.message;
      }
      default:
        return null;
    }
  })().then(
    function (r) { return { ok: true, result: r }; },
    function (e) { return { ok: false, error: String((e && e.message) || e) }; }
  );
}

if (globalThis.__IS_FIREFOX__) {
  // Firefox：browser.runtime.onMessage 监听器直接返回 Promise
  CAPI.runtime.onMessage.addListener(function (msg) {
    return handleMessage(msg);
  });
} else {
  // Chromium：返回 true 保持消息通道，异步 sendResponse
  CAPI.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    handleMessage(msg).then(sendResponse);
    return true;
  });
}

CAPI.runtime.onInstalled.addListener(function (details) {
  setupAlarm();
  if (details.reason === 'install') CAPI.runtime.openOptionsPage();
});

CAPI.runtime.onStartup.addListener(function () {
  setupAlarm();
  setTimeout(function () {
    getConfig().then(function (cfg) {
      if (cfg.autoSync) runExclusive(cfg.mode || 'merge').catch(function () {});
    });
  }, 8000);
});

CAPI.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === ALARM_NAME) autoRun();
});

CAPI.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.config) setupAlarm();
});

/* 本地书签变化 → 防抖 15 秒后自动同步（仅开启自动同步时） */
var debounceTimer = null;
function scheduleAutoSync() {
  if (isApplying()) return; // 忽略插件自己应用合并结果时触发的事件
  getConfig().then(function (cfg) {
    if (!cfg.autoSync) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      runExclusive(cfg.mode || 'merge').catch(function () {});
    }, 15000);
  });
}
['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].forEach(function (ev) {
  if (CAPI.bookmarks[ev]) CAPI.bookmarks[ev].addListener(scheduleAutoSync);
});

setupAlarm();
