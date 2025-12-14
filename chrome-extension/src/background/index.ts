import 'webextension-polyfill';
import { dbManager, safeSendTabMessage } from '@extension/shared';

console.log('[LovpenSider] Background script loaded');

// 初始化数据库
dbManager
  .initialize()
  .then(() => {
    console.log('[LovpenSider] Database initialized');
  })
  .catch(error => {
    console.error('[LovpenSider] Database initialization failed:', error);
  });

// 启用侧边面板自动打开
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
}

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[LovpenSider] Background received message:', request);

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
          console.log('[LovpenSider] Side panel opened successfully');
          // 通知所有内容脚本更新徽章状态
          if (sender.tab?.id) {
            safeSendTabMessage(sender.tab.id, { action: 'sidebarStateChanged', isOpen: true });
          }
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('[LovpenSider] Failed to open side panel:', error);
          sendResponse({ success: false, error: error.message });
        });
    } else {
      console.error('[LovpenSider] No tab ID available');
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
          .catch(err => console.log('[LovpenSider] Method 1 failed:', err)),

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
          .catch(err => console.log('[LovpenSider] Method 2 failed:', err)),

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
          .catch(err => console.log('[LovpenSider] Method 3 failed:', err)),
      ])
        .then(() => {
          console.log('[LovpenSider] Close panel attempts completed');
          // 通知所有内容脚本更新徽章状态
          if (sender.tab?.id) {
            safeSendTabMessage(sender.tab.id, { action: 'sidebarStateChanged', isOpen: false });
          }
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('[LovpenSider] All close methods failed:', error);
          // 即使关闭失败，也要更新徽章状态
          if (sender.tab?.id) {
            safeSendTabMessage(sender.tab.id, { action: 'sidebarStateChanged', isOpen: false });
          }
          sendResponse({ success: false, error: 'Cannot close sidebar programmatically' });
        });
    } else {
      console.error('[LovpenSider] No tab ID available');
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
  }

  return true; // 保持消息通道开放
});

// 监听标签页更新事件，确保内容脚本正常工作
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 可以在这里注入内容脚本或进行其他初始化操作
    console.log('[LovpenSider] Tab updated:', tab.url);
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
    console.error('[LovpenSider] Error checking sidebar state:', error);
  }
});

console.log('[LovpenSider] Background script initialized');
