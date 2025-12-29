/* global window, console, XMLHttpRequest */
// Gmail API Hook - 在页面主世界中运行，拦截 Gmail sync API 响应
// 此脚本通过 manifest 在 document_start 时注入到 MAIN world

(function () {
  'use strict';

  // 防止重复注入
  if (window._lovsiderGmailHookInjected) return;
  window._lovsiderGmailHookInjected = true;

  // 缓存最近的 Gmail 响应
  window._lovsiderGmailData = [];

  // 从请求体中提取 thread ID
  function extractThreadId(body) {
    if (!body || typeof body !== 'string') return null;
    // 匹配 "thread-f:1234567890" 格式
    const match = body.match(/thread-f:(\d+)/);
    return match ? match[1] : null;
  }

  // Hook fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    // 检查是否是 Gmail sync API (c=0 的线程请求)
    const url = args[0]?.toString?.() || args[0];
    const body = args[1]?.body;

    // 只拦截 /sync/.../i/fd?...c=0 的请求（单线程请求）
    if (url && url.includes('/sync/') && url.includes('/i/fd') && url.includes('c=0')) {
      const requestedThreadId = extractThreadId(body);

      // 只处理包含 thread-f: 的请求
      if (requestedThreadId) {
        try {
          const cloned = response.clone();
          const data = await cloned.json();

          // 保存到全局缓存
          window._lovsiderGmailData.push({
            url: url,
            requestedThreadId: requestedThreadId,
            data: data,
            timestamp: Date.now(),
          });

          // 只保留最近 5 条
          if (window._lovsiderGmailData.length > 5) {
            window._lovsiderGmailData.shift();
          }

          window.postMessage(
            {
              type: 'lovsider-gmail-api-response',
              data: data,
              requestedThreadId: requestedThreadId,
              url: url,
            },
            '*',
          );

          console.log('[Lovsider] Gmail 线程请求拦截:', 'threadId:', requestedThreadId);
        } catch {
          // 忽略解析错误
        }
      }
    }

    return response;
  };

  // Hook XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._lovsiderUrl = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._lovsiderUrl;
    // 只拦截 c=0 的线程请求
    if (url && url.includes('/sync/') && url.includes('/i/fd') && url.includes('c=0')) {
      const requestedThreadId = extractThreadId(body);
      this._lovsiderRequestedThreadId = requestedThreadId;

      // 只处理包含 thread-f: 的请求
      if (requestedThreadId) {
        this.addEventListener('load', function () {
          try {
            const data = JSON.parse(this.responseText);
            const threadId = this._lovsiderRequestedThreadId;

            window._lovsiderGmailData.push({
              url: url,
              requestedThreadId: threadId,
              data: data,
              timestamp: Date.now(),
            });

            if (window._lovsiderGmailData.length > 5) {
              window._lovsiderGmailData.shift();
            }

            window.postMessage(
              {
                type: 'lovsider-gmail-api-response',
                data: data,
                requestedThreadId: threadId,
                url: url,
              },
              '*',
            );

            console.log('[Lovsider] Gmail XHR 线程请求拦截:', 'threadId:', threadId);
          } catch {
            // 忽略解析错误
          }
        });
      }
    }
    return originalXHRSend.call(this, body);
  };

  console.log('[Lovsider] Gmail API hook injected (MAIN world)');
})();
