import 'webextension-polyfill';
import { dbManager, safeSendTabMessage } from '@extension/shared';
import { downloadSettingsStorage } from '@extension/storage';

console.log('[Lovsider] Background script loaded');

// 初始化数据库
dbManager
  .initialize()
  .then(() => {
    console.log('[Lovsider] Database initialized');
  })
  .catch(error => {
    console.error('[Lovsider] Database initialization failed:', error);
  });

// 启用侧边面板自动打开
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
}

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Lovsider] Background received message:', request);

  if (request.action === 'convertToMarkdown') {
    sendResponse({ success: true });
  } else if (request.action === 'elementSelected') {
    // 转发消息给侧边栏（如果需要的话）
    sendResponse({ success: true });
  } else if (request.action === 'elementDataUpdate') {
    // 处理实时数据更新
    sendResponse({ success: true });
  } else if (request.action === 'selectionStopped') {
    sendResponse({ success: true });
  } else if (request.action === 'navigationExited') {
    sendResponse({ success: true });
  } else if (request.action === 'openSidePanel') {
    // 处理打开侧边栏的请求
    if (sender.tab?.id) {
      chrome.sidePanel
        .open({ tabId: sender.tab.id })
        .then(() => {
          console.log('[Lovsider] Side panel opened successfully');
          // 通知所有内容脚本更新徽章状态
          if (sender.tab?.id) {
            safeSendTabMessage(sender.tab.id, { action: 'sidebarStateChanged', isOpen: true });
          }
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('[Lovsider] Failed to open side panel:', error);
          sendResponse({ success: false, error: error.message });
        });
    } else {
      console.error('[Lovsider] No tab ID available');
      sendResponse({ success: false, error: 'No tab ID' });
    }
  } else if (request.action === 'closeSidePanel') {
    // 处理关闭侧边栏的请求
    if (sender.tab?.id) {
      const tabId = sender.tab.id;

      // 尝试多种方法关闭侧边栏
      Promise.all([
        // 方法1: 发送消息让侧边栏自行关闭
        chrome.runtime
          .sendMessage({ action: 'closeSidePanelRequest' })
          .catch(err => console.log('[Lovsider] Method 1 failed:', err)),

        // 方法2: 尝试通过 setOptions 禁用侧边栏（然后立即重新启用）
        chrome.sidePanel
          ?.setOptions?.({
            tabId,
            enabled: false,
          })
          .then(() => {
            // 立即重新启用，但不打开
            setTimeout(() => {
              chrome.sidePanel?.setOptions?.({
                tabId,
                enabled: true,
              });
            }, 100);
          })
          .catch(err => console.log('[Lovsider] Method 2 failed:', err)),

        // 方法3: 尝试设置空路径
        chrome.sidePanel
          ?.setOptions?.({
            tabId,
            path: 'about:blank',
          })
          .then(() => {
            // 恢复正常路径
            setTimeout(() => {
              chrome.sidePanel?.setOptions?.({
                tabId,
                path: 'side-panel/index.html',
              });
            }, 100);
          })
          .catch(err => console.log('[Lovsider] Method 3 failed:', err)),
      ])
        .then(() => {
          console.log('[Lovsider] Close panel attempts completed');
          // 通知所有内容脚本更新徽章状态
          if (sender.tab?.id) {
            safeSendTabMessage(sender.tab.id, { action: 'sidebarStateChanged', isOpen: false });
          }
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('[Lovsider] All close methods failed:', error);
          // 即使关闭失败，也要更新徽章状态
          if (sender.tab?.id) {
            safeSendTabMessage(sender.tab.id, { action: 'sidebarStateChanged', isOpen: false });
          }
          sendResponse({ success: false, error: 'Cannot close sidebar programmatically' });
        });
    } else {
      console.error('[Lovsider] No tab ID available');
      sendResponse({ success: false, error: 'No tab ID' });
    }
  } else if (request.action === 'saveFloatingBadgeState') {
    // 保存悬浮徽章状态
    if (sender.tab?.url) {
      const hostname = new URL(sender.tab.url).hostname;
      chrome.storage.local.get('floating-badge-storage-key').then(result => {
        const data = result['floating-badge-storage-key'] || {};
        data.states = data.states || {};
        data.states[hostname] = request.state;
        chrome.storage.local.set({ 'floating-badge-storage-key': data });
      });
    }
    sendResponse({ success: true });
  } else if (request.action === 'getFloatingBadgeState') {
    // 获取悬浮徽章状态
    if (sender.tab?.url) {
      const hostname = new URL(sender.tab.url).hostname;
      chrome.storage.local.get('floating-badge-storage-key').then(result => {
        const data = result['floating-badge-storage-key'];
        const state = data?.states?.[hostname] || null;
        sendResponse({ state });
      });
    } else {
      sendResponse({ state: null });
    }
  } else if (request.action === 'addToFloatingBadgeBlacklist') {
    // 添加网站到黑名单
    const hostname = request.hostname;
    chrome.storage.local.get('floating-badge-storage-key').then(result => {
      const data = result['floating-badge-storage-key'] || { blacklist: [] };
      const blacklist = data.blacklist || [];
      if (!blacklist.includes(hostname)) {
        blacklist.push(hostname);
      }
      data.blacklist = blacklist;
      chrome.storage.local.set({ 'floating-badge-storage-key': data });
      sendResponse({ success: true });
    });
  } else if (request.action === 'disableFloatingBadge') {
    // 全局禁用悬浮徽章
    chrome.storage.local.get('floating-badge-storage-key').then(result => {
      const data = result['floating-badge-storage-key'] || {};
      data.enabled = false;
      chrome.storage.local.set({ 'floating-badge-storage-key': data });
      sendResponse({ success: true });
    });
  } else if (request.action === 'openExtensionPage') {
    // 打开扩展管理页面
    const extensionId = chrome.runtime.id;
    chrome.tabs.create({ url: `chrome://extensions/?id=${extensionId}` });
    sendResponse({ success: true });
  } else if (request.action === 'downloadFile') {
    // 处理文件下载请求（来自 content-ui）
    (async () => {
      try {
        const { content, filename, mimeType } = request;
        const settings = await downloadSettingsStorage.getSettings();

        // 创建数据 URL
        const dataUrl = `data:${mimeType},${encodeURIComponent(content)}`;

        // 构建下载选项
        const downloadOptions: chrome.downloads.DownloadOptions = {
          url: dataUrl,
          filename: settings.lastUsedPath ? `${settings.lastUsedPath}/${filename}` : filename,
          saveAs: true,
        };

        const downloadId = await chrome.downloads.download(downloadOptions);

        // 监听下载完成
        let handled = false;
        const handleComplete = async () => {
          if (handled) return;
          handled = true;
          chrome.downloads.onChanged.removeListener(onDownloadChanged);

          // 获取下载信息
          chrome.downloads.search({ id: downloadId }, async results => {
            if (results.length > 0 && results[0].filename) {
              const filePath = results[0].filename;

              // 更新存储的路径
              const pathParts = filePath.split(/[/\\]/);
              const directoryPath = pathParts.slice(0, -1).join('/');
              const homeDir = pathParts.find(part => part === 'Users' || part === 'home' || part.match(/^[A-Z]:$/))
                ? pathParts.slice(0, 3).join('/')
                : '';

              let relativePath = '';
              if (homeDir && directoryPath.startsWith(homeDir)) {
                const downloadsIndex = pathParts.findIndex(part => part.toLowerCase() === 'downloads');
                if (downloadsIndex !== -1 && downloadsIndex < pathParts.length) {
                  relativePath = pathParts.slice(downloadsIndex, -1).join('/');
                }
              }

              await downloadSettingsStorage.updateSettings({
                lastUsedPath: relativePath,
                lastUsedAbsolutePath: directoryPath,
              });

              sendResponse({ success: true, filePath });
            } else {
              sendResponse({ success: false, error: 'Download completed but no path available' });
            }
          });
        };

        const onDownloadChanged = (delta: chrome.downloads.DownloadDelta) => {
          if (delta.id === downloadId && delta.state?.current === 'complete') {
            handleComplete();
          } else if (delta.id === downloadId && delta.state?.current === 'interrupted') {
            handled = true;
            chrome.downloads.onChanged.removeListener(onDownloadChanged);
            sendResponse({ success: false, error: 'Download was interrupted' });
          }
        };

        chrome.downloads.onChanged.addListener(onDownloadChanged);

        // 立即检查（处理瞬间完成的情况）
        chrome.downloads.search({ id: downloadId }, results => {
          if (results.length > 0 && results[0].state === 'complete') {
            handleComplete();
          }
        });
      } catch (error) {
        sendResponse({ success: false, error: String(error) });
      }
    })();
  }

  return true; // 保持消息通道开放
});

// 监听标签页更新事件，确保内容脚本正常工作
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('[Lovsider] Tab updated:', tab.url);
  }
  // URL 变化时通知 content script
  if (changeInfo.url) {
    safeSendTabMessage(tabId, { action: 'urlChanged', url: changeInfo.url });
  }
});

// 监听窗口焦点变化，检测侧边栏关闭
chrome.windows.onFocusChanged.addListener(async windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  try {
    // 获取当前活动标签
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const tabId = tab.id;
      // 检查侧边栏是否打开
      // 注意：Chrome API 没有直接的方法检查侧边栏状态
      // 这里我们可以尝试发送消息到侧边栏，如果失败则说明已关闭
      chrome.runtime
        .sendMessage({ action: 'ping' })
        .then(() => {
          // 侧边栏响应，说明还开着
          safeSendTabMessage(tabId, { action: 'sidebarStateChanged', isOpen: true });
        })
        .catch(() => {
          // 侧边栏没响应，说明已关闭
          safeSendTabMessage(tabId, { action: 'sidebarStateChanged', isOpen: false });
        });
    }
  } catch (error) {
    console.error('[Lovsider] Error checking sidebar state:', error);
  }
});

console.log('[Lovsider] Background script initialized');
