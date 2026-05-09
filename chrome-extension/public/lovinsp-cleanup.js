/* global document, console */
// lovinsp 清理脚本 - 不再主动移除页面的 lovinsp-component
// 页面自身的 lovinsp（通过 Vite 插件注入）应该保持不动，
// Lovsider 的 inspector 和页面的 inspector 可以共存。
(function () {
  'use strict';
  // noop — 保留文件避免 manifest 引用报错
})();
