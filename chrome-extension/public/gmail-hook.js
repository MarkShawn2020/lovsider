/* global window, console, XMLHttpRequest */
// Gmail API Hook - 拦截 Gmail sync API 响应
(function () {
  // 缓存最近的 Gmail 响应
  window._lovsiderGmailData = [];

  // Hook fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    // 检查是否是 Gmail sync API
    const url = args[0]?.toString?.() || args[0];
    const body = args[1]?.body;

    if (url && url.includes('/sync/') && url.includes('/i/fd')) {
      // 检查请求体是否包含 msg-f (邮件内容请求)
      const hasMessageId = body && body.includes && body.includes('msg-f:');

      try {
        const cloned = response.clone();
        const data = await cloned.json();

        // 保存到全局缓存
        window._lovsiderGmailData.push({
          url: url,
          hasMessageId: hasMessageId,
          data: data,
          timestamp: Date.now(),
        });

        // 只保留最近 10 条
        if (window._lovsiderGmailData.length > 10) {
          window._lovsiderGmailData.shift();
        }

        window.postMessage(
          {
            type: 'lovsider-gmail-api-response',
            data: data,
            hasMessageId: hasMessageId,
            url: url,
          },
          '*',
        );

        console.log('[Lovsider] Gmail API intercepted:', url.substring(0, 80), 'hasMessageId:', hasMessageId);
      } catch (e) {
        console.log('[Lovsider] Gmail API parse error:', e);
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
    if (url && url.includes('/sync/') && url.includes('/i/fd')) {
      const hasMessageId = body && typeof body === 'string' && body.includes('msg-f:');

      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);

          window._lovsiderGmailData.push({
            url: url,
            hasMessageId: hasMessageId,
            data: data,
            timestamp: Date.now(),
          });

          if (window._lovsiderGmailData.length > 10) {
            window._lovsiderGmailData.shift();
          }

          window.postMessage(
            {
              type: 'lovsider-gmail-api-response',
              data: data,
              hasMessageId: hasMessageId,
              url: url,
            },
            '*',
          );

          console.log('[Lovsider] Gmail XHR intercepted:', url.substring(0, 80), 'hasMessageId:', hasMessageId);
        } catch {
          /* ignore */
        }
      });
    }
    return originalXHRSend.call(this, body);
  };

  console.log('[Lovsider] Gmail API hook injected');
})();
