/* ============================================================
 * shim.js — 浏览器兼容层
 * Chrome/Edge：仅标记 __IS_FIREFOX__ = false，后续代码使用 chrome.* 命名空间。
 * Firefox：标记 __IS_FIREFOX__ = true，后续代码使用 browser.*（Promise 风格）命名空间。
 * 所有页面（popup/options）与 Firefox 后台脚本都最先加载本文件。
 * ============================================================ */
(function () {
  var ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  globalThis.__IS_FIREFOX__ = /Firefox/.test(ua);
})();
