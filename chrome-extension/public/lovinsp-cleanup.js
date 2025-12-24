/* global document, console */
// lovinsp 清理脚本 - 在 document_start 运行
// 仅移除页面加载时已存在的第三方 lovinsp-component 元素
// 注意：不使用 MutationObserver，因为我们自己的 lovinsp-component 在 connectedCallback
// 之前也没有 shadowRoot，会被误删
(function () {
  'use strict';

  function removeExisting() {
    var el = document.documentElement && document.documentElement.querySelector('lovinsp-component');
    if (el) {
      // 在 document_start 阶段，任何存在的 lovinsp-component 都是第三方的
      // 因为我们的脚本还没有运行
      el.remove();
      console.log('[Lovsider] Removed pre-existing lovinsp-component');
    }
  }

  // 立即执行一次即可
  removeExisting();
})();
