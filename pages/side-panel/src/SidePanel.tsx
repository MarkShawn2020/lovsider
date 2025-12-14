import '@src/SidePanel.css';
import { EdgeSnappingPanel } from './components/EdgeSnappingPanel';
import { FloatingBadgePanel } from './components/FloatingBadgePanel';
import { SitePresetsPanel } from './components/SitePresetsPanel';
import { useStorage, withErrorBoundary, withSuspense, commandProcessor } from '@extension/shared';
import {
  exampleThemeStorage,
  domPathStorage,
  downloadSettingsStorage,
  copyFormatStorage,
  sitePresetsStorage,
  edgeSnappingStorage,
  floatingBadgeStorage,
} from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, Select } from '@extension/ui';
import { useState, useEffect } from 'react';
import type { CommandResult } from '@extension/shared';

// 下载设置面板组件
const DownloadSettingsPanel = ({ onClose }: { onClose: () => void }) => {
  const [settings, setSettings] = useState({
    askForLocation: true,
    useDefaultPath: false,
    defaultPath: 'Downloads',
    lastUsedPath: 'Downloads',
  });

  useEffect(() => {
    // 加载当前设置
    const loadSettings = async () => {
      try {
        const currentSettings = await downloadSettingsStorage.getSettings();
        setSettings(currentSettings);
      } catch (error) {
        console.error('加载设置失败:', error);
      }
    };

    loadSettings();

    // 监听存储变化以实时更新
    const handleStorageChange = () => {
      loadSettings();
    };

    // 添加存储变化监听器
    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const updateSetting = async (key: string, value: any) => {
    try {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      await downloadSettingsStorage.updateSettings({ [key]: value });
    } catch (error) {
      console.error('更新设置失败:', error);
    }
  };

  return (
    <div className="border-border-default bg-background-main mb-3 rounded border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">下载设置</h4>
        <button
          onClick={onClose}
          className="bg-background-ivory-medium text-text-faded hover:bg-swatch-cloud-light rounded px-2 py-1 text-xs">
          ✕
        </button>
      </div>

      <div className="space-y-3">
        {/* 是否询问位置 */}
        <div className="flex items-center justify-between">
          <label className="text-text-main text-sm">每次询问保存位置</label>
          <input
            type="checkbox"
            checked={settings.askForLocation}
            onChange={e => updateSetting('askForLocation', e.target.checked)}
            className="rounded"
          />
        </div>

        {/* 使用默认路径 */}
        <div className="flex items-center justify-between">
          <label className="text-text-main text-sm">使用默认路径</label>
          <input
            type="checkbox"
            checked={settings.useDefaultPath}
            disabled={settings.askForLocation}
            onChange={e => updateSetting('useDefaultPath', e.target.checked)}
            className="rounded disabled:opacity-50"
          />
        </div>

        {/* 默认路径输入 */}
        {settings.useDefaultPath && !settings.askForLocation && (
          <div>
            <label className="text-text-faded mb-1 block text-xs">默认下载路径</label>
            <input
              type="text"
              value={settings.defaultPath}
              onChange={e => updateSetting('defaultPath', e.target.value)}
              placeholder="Downloads"
              className="border-border-default bg-background-main w-full rounded border px-2 py-1 text-xs"
            />
          </div>
        )}

        {/* 最后使用的路径显示 */}
        {settings.lastUsedPath && settings.lastUsedPath !== 'Downloads' && (
          <div>
            <label className="text-text-faded mb-1 block text-xs">最后使用的路径</label>
            <div className="bg-background-ivory-medium text-text-main rounded px-2 py-1 text-xs">
              {settings.lastUsedPath}
            </div>
          </div>
        )}

        {/* 下载说明 */}
        {!settings.askForLocation && (
          <div className="bg-background-oat text-text-main mt-2 rounded p-2 text-xs">
            <div className="mb-1 font-medium">⚠️ 注意</div>
            <div>
              如果Chrome浏览器设置中开启了"下载前询问每个文件的保存位置"，仍然会显示保存对话框。这是浏览器级别的限制，扩展无法绕过。
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 先创建一个简单的测试版本
const SimpleCaptureModule = () => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [markdownOutput, setMarkdownOutput] = useState('');
  const [domPath, setDomPath] = useState('');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [editPathValue, setEditPathValue] = useState('');
  const [pathError, setPathError] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [showDownloadSettings, setShowDownloadSettings] = useState(false);
  const [showPresetsPanel, setShowPresetsPanel] = useState(false);
  const [domPathCopied, setDomPathCopied] = useState(false);
  const [markdownCopied, setMarkdownCopied] = useState(false);

  // 初始化和URL监听
  useEffect(() => {
    const initializeWithCurrentTab = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.url) {
          setCurrentUrl(tab.url);
          // 尝试加载已保存的DOM路径
          const savedPath = await domPathStorage.loadPath(tab.url);
          if (savedPath) {
            setDomPath(savedPath);
            // 如果有保存的路径，自动应用
            await applyDomPath(savedPath);
          }
        }
      } catch (error) {
        console.error('初始化失败:', error);
      }
    };

    initializeWithCurrentTab();

    // 监听标签页变化
    const tabUpdateListener = async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (changeInfo.url && tab.active) {
        setCurrentUrl(changeInfo.url);
        // 当URL变化时，加载新的DOM路径
        try {
          const savedPath = await domPathStorage.loadPath(changeInfo.url);
          if (savedPath) {
            setDomPath(savedPath);
            // 等待页面加载完成后再应用DOM路径
            setTimeout(async () => {
              await applyDomPath(savedPath);
            }, 1000); // 给页面一些时间加载
          } else {
            setDomPath('');
            setMarkdownOutput('');
          }
        } catch (error) {
          console.error('处理URL变化失败:', error);
          setDomPath('');
          setMarkdownOutput('');
        }
      }
    };

    // 监听标签页激活
    const tabActivatedListener = async (activeInfo: chrome.tabs.TabActiveInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
          setCurrentUrl(tab.url);
          const savedPath = await domPathStorage.loadPath(tab.url);
          if (savedPath) {
            setDomPath(savedPath);
            // 延迟应用，确保content script已加载
            setTimeout(async () => {
              await applyDomPath(savedPath);
            }, 500);
          } else {
            setDomPath('');
            setMarkdownOutput('');
          }
        }
      } catch (error) {
        console.error('处理标签页切换失败:', error);
      }
    };

    chrome.tabs.onUpdated.addListener(tabUpdateListener);
    chrome.tabs.onActivated.addListener(tabActivatedListener);

    return () => {
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
    };
  }, []);

  useEffect(() => {
    // 监听来自内容脚本的消息
    const messageListener = (request: unknown, _sender: unknown, sendResponse: (response?: unknown) => void) => {
      if (!request || typeof request !== 'object') return;

      const msg = request as { action?: string; markdown?: string; domPath?: string };
      if (msg.action === 'elementSelected') {
        const newPath = msg.domPath || '';
        const newMarkdown = msg.markdown || '';

        setMarkdownOutput(newMarkdown);
        setDomPath(newPath);
        setIsSelecting(false);

        // 保存DOM路径
        if (newPath && currentUrl) {
          domPathStorage.savePath(currentUrl, newPath);
        }

        sendResponse({ success: true });
      } else if (msg.action === 'elementDataUpdate') {
        const newPath = msg.domPath || '';
        const newMarkdown = msg.markdown || '';

        setMarkdownOutput(newMarkdown);
        setDomPath(newPath);

        // 保存DOM路径
        if (newPath && currentUrl) {
          domPathStorage.savePath(currentUrl, newPath);
        }

        sendResponse({ success: true });
      } else if (msg.action === 'selectionStopped') {
        setIsSelecting(false);
        sendResponse({ success: true });
      } else if (msg.action === 'navigationExited') {
        setIsSelecting(false);
        sendResponse({ success: true });
      } else if (msg.action === 'closeSidePanelRequest') {
        // 尝试关闭侧边栏
        console.log('[SidePanel] Received close request');

        // 方案1: 尝试 window.close()
        try {
          window.close();
          sendResponse({ success: true, method: 'window.close' });
        } catch (error) {
          console.error('[SidePanel] window.close() failed:', error);

          // 方案2: 尝试通过设置空内容来"隐藏"
          document.body.style.display = 'none';
          sendResponse({ success: false, error: 'Cannot close programmatically' });
        }
      } else if (msg.action === 'ping') {
        // 响应 ping 请求，表示侧边栏还活着
        sendResponse({ success: true, alive: true });
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [currentUrl]);

  const startSelection = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id!, { action: 'startSelection' });
      setIsSelecting(true);
    } catch (error) {
      console.error('启动选择模式失败:', error);
    }
  };

  const stopSelection = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id!, { action: 'stopSelection' });
      setIsSelecting(false);
    } catch (error) {
      console.error('停止选择模式失败:', error);
    }
  };

  const smartSelect = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id!, { action: 'smartSelect' });
      setIsSelecting(false);
    } catch (error) {
      console.error('智能选择失败:', error);
    }
  };

  const copyToClipboard = async () => {
    if (!markdownOutput) return;

    try {
      await navigator.clipboard.writeText(markdownOutput);
      setMarkdownCopied(true);
      setTimeout(() => setMarkdownCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  const downloadMarkdown = async () => {
    if (!markdownOutput) return;

    try {
      // 从 markdown 内容中提取 title
      const title = extractTitleFromMarkdown(markdownOutput);
      const filename = `${title}.md`;

      // 获取下载设置
      const settings = await downloadSettingsStorage.getSettings();

      // 统一使用 Chrome downloads API
      await downloadWithChromeAPI(filename, settings);
    } catch (error) {
      console.error('下载失败:', error);
      // 最终回退方案
      fallbackDownload();
    }
  };

  const downloadWithChromeAPI = async (filename: string, settings: any) => {
    // 创建数据URL
    const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdownOutput)}`;

    // 根据设置决定下载行为
    const downloadOptions: chrome.downloads.DownloadOptions = {
      url: dataUrl,
      filename: filename,
    };

    // 始终显示保存对话框，使用记忆的路径作为默认位置
    downloadOptions.saveAs = true;
    if (settings.lastUsedPath && settings.lastUsedPath !== 'Downloads') {
      downloadOptions.filename = `${settings.lastUsedPath}/${filename}`;
    }

    // 使用 Chrome downloads API
    const downloadId = await chrome.downloads.download(downloadOptions);

    // 监听下载完成事件以更新最后使用的路径
    const onDownloadChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === downloadId && delta.state?.current === 'complete') {
        chrome.downloads.search({ id: downloadId }, async results => {
          if (results.length > 0) {
            const downloadedFile = results[0];
            if (downloadedFile.filename) {
              // 提取相对于 Downloads 文件夹的路径
              const absolutePath = downloadedFile.filename;
              const pathParts = absolutePath.split(/[/\\]/);
              pathParts.pop(); // 移除文件名

              // 查找 Downloads 文件夹在路径中的位置
              const downloadsIndex = pathParts.findIndex(part => part.toLowerCase() === 'downloads' || part === '下载');

              let relativePath = '';
              if (downloadsIndex !== -1 && downloadsIndex < pathParts.length - 1) {
                // 提取 Downloads 之后的路径部分
                relativePath = pathParts.slice(downloadsIndex + 1).join('/');
              }

              // 只有当有有效的相对路径时才保存
              if (relativePath) {
                await downloadSettingsStorage.setLastUsedPath(relativePath);
              }
            }
          }
        });

        // 移除监听器
        chrome.downloads.onChanged.removeListener(onDownloadChanged);
      }
    };

    chrome.downloads.onChanged.addListener(onDownloadChanged);
  };

  const fallbackDownload = () => {
    if (!markdownOutput) return;

    try {
      const title = extractTitleFromMarkdown(markdownOutput);
      const filename = `${title}.md`;

      const blob = new Blob([markdownOutput], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;

      document.body.appendChild(a);
      a.click();

      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('回退下载失败:', error);
    }
  };

  const extractTitleFromMarkdown = (markdown: string): string => {
    try {
      // 匹配 frontmatter 中的 title
      const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
        if (titleMatch && titleMatch[1]) {
          // 移除可能的引号
          return titleMatch[1].trim().replace(/^["']|["']$/g, '');
        }
      }

      // 如果没有找到 title，使用时间戳作为默认值
      const timestamp = new Date().getTime();
      return `content-${timestamp}`;
    } catch (error) {
      console.error('提取 title 失败:', error);
      const timestamp = new Date().getTime();
      return `content-${timestamp}`;
    }
  };

  const clearContent = () => {
    setMarkdownOutput('');
    setDomPath('');
  };

  const copyDomPath = async () => {
    if (!domPath) return;

    try {
      await navigator.clipboard.writeText(domPath);
      setDomPathCopied(true);
      setTimeout(() => setDomPathCopied(false), 2000);
    } catch (error) {
      console.error('复制DOM路径失败:', error);
    }
  };

  // 应用DOM路径到页面
  const applyDomPath = async (path: string, retryCount = 0) => {
    if (!path) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        console.error('无法获取标签页ID');
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'applyDomPath', domPath: path });

      if (!response || !response.success) {
        console.error('应用DOM路径失败:', response?.error || '未知错误');
        // 如果应用失败，清空markdown
        setMarkdownOutput('');
      }
    } catch (error) {
      console.error('应用DOM路径失败:', error);
      // 网络错误或content script未准备好时，最多重试2次
      if (retryCount < 2) {
        setTimeout(() => {
          applyDomPath(path, retryCount + 1);
        }, 2000);
      } else {
        console.error('重试次数已达上限，停止尝试应用DOM路径');
        setMarkdownOutput('');
      }
    }
  };

  // 验证DOM路径格式
  const validateDomPath = (path: string): string => {
    if (!path.trim()) {
      return '路径不能为空';
    }

    // 简单验证CSS选择器格式
    try {
      document.querySelector(path);
      return '';
    } catch (error) {
      return '无效的CSS选择器格式';
    }
  };

  // 开始编辑DOM路径
  const startEditPath = () => {
    setEditPathValue(domPath);
    setIsEditingPath(true);
    setPathError('');
  };

  // 保存编辑的DOM路径
  const saveEditPath = async () => {
    const error = validateDomPath(editPathValue);
    if (error) {
      setPathError(error);
      return;
    }

    setDomPath(editPathValue);
    setIsEditingPath(false);
    setPathError('');

    // 保存到存储
    if (currentUrl) {
      await domPathStorage.savePath(currentUrl, editPathValue);
    }

    // 应用新路径
    await applyDomPath(editPathValue);
  };

  // 取消编辑
  const cancelEditPath = () => {
    setIsEditingPath(false);
    setEditPathValue('');
    setPathError('');
  };

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="theme-text-main mb-4 text-lg font-semibold">页面捕获</h2>

      <div className="mb-4">
        <div className="flex gap-2">
          {!isSelecting ? (
            <button
              onClick={startSelection}
              className="bg-primary hover:bg-background-clay theme-btn-primary flex-1 rounded px-3 py-2 text-sm text-white">
              🎯 开始选择元素
            </button>
          ) : (
            <button
              onClick={stopSelection}
              className="bg-background-clay hover:bg-primary theme-btn-clay flex-1 rounded px-3 py-2 text-sm text-white">
              ⏹️ 停止选择
            </button>
          )}
          <button
            onClick={smartSelect}
            className="bg-swatch-cactus hover:bg-swatch-olive theme-btn-cactus flex-1 rounded px-3 py-2 text-sm text-white">
            🤖 智能选择
          </button>
          <button
            onClick={() => setShowPresetsPanel(!showPresetsPanel)}
            className="bg-background-ivory-medium hover:bg-swatch-cloud-light text-text-main flex-shrink-0 rounded p-2 text-sm"
            title="预设配置">
            ⚙️
          </button>
        </div>
      </div>

      {/* 预设配置面板 */}
      {showPresetsPanel && <SitePresetsPanel onClose={() => setShowPresetsPanel(false)} />}

      {/* DOM路径显示 */}
      {domPath && (
        <div className="border-border-default mb-4 overflow-hidden rounded border p-3">
          <div className="mb-2 flex items-start justify-between">
            <h3 className="text-sm font-medium">DOM路径</h3>
            <div className="flex flex-shrink-0 space-x-1">
              <button
                onClick={copyDomPath}
                className={`rounded p-1.5 transition-all duration-200 ${
                  domPathCopied
                    ? 'bg-green-500 text-white'
                    : 'bg-background-ivory-medium text-text-main hover:bg-swatch-cloud-light'
                }`}
                title={domPathCopied ? '已复制!' : '复制路径'}>
                {domPathCopied ? '✓' : '📋'}
              </button>
              <button
                onClick={startEditPath}
                className="text-background-clay bg-background-oat hover:bg-swatch-cloud-light rounded p-1.5"
                title="编辑路径">
                ✏️
              </button>
            </div>
          </div>

          {!isEditingPath ? (
            <code className="bg-background-ivory-medium text-text-main block break-all rounded p-2 font-mono text-xs">
              {domPath}
            </code>
          ) : (
            <div className="space-y-2">
              <textarea
                value={editPathValue}
                onChange={e => setEditPathValue(e.target.value)}
                className="border-border-default bg-background-main w-full rounded border p-2 font-mono text-xs"
                rows={3}
                placeholder="输入CSS选择器路径..."
              />
              {pathError && <p className="text-background-clay text-xs">{pathError}</p>}
              <div className="flex space-x-2">
                <button
                  onClick={saveEditPath}
                  className="bg-swatch-cactus hover:bg-swatch-olive rounded px-3 py-1 text-xs text-white">
                  ✓ 保存
                </button>
                <button
                  onClick={cancelEditPath}
                  className="bg-background-faded rounded px-3 py-1 text-xs text-white hover:bg-gray-600">
                  ✗ 取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {markdownOutput ? (
          <div className="flex h-full flex-col">
            <div className="mb-2 flex items-start justify-between">
              <h3 className="text-sm font-medium">Markdown内容</h3>
              <div className="flex flex-shrink-0 gap-1">
                <button
                  onClick={downloadMarkdown}
                  className="bg-swatch-cactus/20 text-swatch-cactus hover:bg-swatch-cactus/30 rounded p-1.5"
                  title="下载">
                  📥
                </button>
                <button
                  onClick={() => setShowDownloadSettings(!showDownloadSettings)}
                  className="text-background-clay bg-background-oat hover:bg-swatch-cloud-light rounded p-1.5"
                  title="下载设置">
                  ⚙️
                </button>
                <button
                  onClick={copyToClipboard}
                  className={`rounded p-1.5 transition-all duration-200 ${
                    markdownCopied
                      ? 'bg-green-500 text-white'
                      : 'bg-background-ivory-medium text-text-main hover:bg-swatch-cloud-light'
                  }`}
                  title={markdownCopied ? '已复制!' : '复制'}>
                  {markdownCopied ? '✓' : '📋'}
                </button>
                <button
                  onClick={clearContent}
                  className="bg-background-clay/20 text-background-clay hover:bg-background-clay/30 rounded p-1.5"
                  title="清空">
                  🗑️
                </button>
              </div>
            </div>

            {/* 下载设置面板 */}
            {showDownloadSettings && <DownloadSettingsPanel onClose={() => setShowDownloadSettings(false)} />}

            <pre className="bg-background-ivory-medium flex-1 overflow-auto whitespace-pre-wrap break-words rounded p-4 font-mono text-xs">
              {markdownOutput}
            </pre>
          </div>
        ) : (
          <div className="text-text-faded py-8 text-center">
            <div className="mb-2 text-4xl">📄</div>
            <p>选择网页元素来捕获内容</p>
          </div>
        )}
      </div>
    </div>
  );
};

// 简单的文本处理模块
const SimpleTextModule = () => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [selectedTool, setSelectedTool] = useState<string>('');

  const tools = [
    { id: 'format', name: '格式化', icon: '📝', desc: '清理和格式化文本' },
    { id: 'case', name: '大小写', icon: '🔤', desc: '转换文本大小写' },
    { id: 'translate', name: '翻译', icon: '🌐', desc: '文本翻译(即将上线)' },
    { id: 'summary', name: '摘要', icon: '📋', desc: '生成摘要(即将上线)' },
  ];

  const processText = () => {
    if (!inputText.trim() || !selectedTool) return;

    let result = '';
    switch (selectedTool) {
      case 'format':
        result = inputText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line)
          .join('\n');
        break;
      case 'case':
        result = `大写：${inputText.toUpperCase()}\n小写：${inputText.toLowerCase()}\n首字母大写：${inputText.charAt(0).toUpperCase() + inputText.slice(1).toLowerCase()}`;
        break;
      case 'translate':
      case 'summary':
        result = `${tools.find(t => t.id === selectedTool)?.name}功能即将上线，敬请期待！\n\n输入文本：\n${inputText}`;
        break;
      default:
        result = inputText;
    }
    setOutputText(result);
  };

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="theme-text-main mb-4 text-lg font-semibold">文本处理</h2>

      {/* 工具选择 */}
      <div className="mb-4">
        <h3 className="theme-text-main mb-2 text-sm font-medium">选择工具</h3>
        <div className="grid grid-cols-2 gap-2">
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => setSelectedTool(tool.id)}
              className={cn(
                'rounded border p-2 text-left transition-colors',
                selectedTool === tool.id
                  ? 'border-primary bg-background-oat'
                  : 'border-border-default hover:border-border-default',
              )}
              title={tool.desc}>
              <span className="text-sm">
                {tool.icon} {tool.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 输入区域 */}
      <div className="mb-4">
        <label htmlFor="input-text" className="mb-2 block text-sm font-medium">
          输入文本
        </label>
        <textarea
          id="input-text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="在此输入或粘贴文本..."
          className="border-border-default bg-background-main h-20 w-full resize-none rounded border p-2"
        />
        <button
          onClick={processText}
          disabled={!inputText.trim() || !selectedTool}
          className="bg-primary hover:bg-background-clay theme-btn-primary mt-2 w-full rounded px-4 py-2 text-white disabled:bg-gray-400">
          开始处理
        </button>
      </div>

      {/* 输出区域 */}
      <div className="flex-1 overflow-auto">
        {outputText ? (
          <div className="flex h-full flex-col">
            <h3 className="theme-text-main mb-2 text-sm font-medium">处理结果</h3>
            <pre className="bg-background-ivory-medium flex-1 overflow-auto rounded p-3 text-sm">{outputText}</pre>
          </div>
        ) : (
          <div className="text-text-faded py-8 text-center">
            <div className="mb-2 text-4xl">📝</div>
            <p>选择工具并输入文本开始处理</p>
          </div>
        )}
      </div>
    </div>
  );
};

// 复制标题模块
const CopyTitleModule = () => {
  const [currentTitle, setCurrentTitle] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');
  const [customFormat, setCustomFormat] = useState('{title} - {url}');
  const [selectedFormat, setSelectedFormat] = useState('markdown');
  const [showCustomFormat, setShowCustomFormat] = useState(false);
  const [shortcuts, setShortcuts] = useState<{
    [key: string]: {
      enabled: boolean;
      command: string;
      description: string;
    };
  }>({});

  // 预设格式配置
  const formats = [
    { id: 'url', name: '纯网址', icon: '🔗', template: '{url}' },
    { id: 'title', name: '纯标题', icon: '📝', template: '{title}' },
    { id: 'title_url', name: '标题, 网址', icon: '📋', template: '{title}, {url}' },
    { id: 'markdown', name: 'Markdown', icon: '📄', template: '[{title}]({url})' },
    { id: 'custom', name: '自定义', icon: '⚙️', template: customFormat },
  ];

  // 初始化和监听当前标签页
  useEffect(() => {
    const getCurrentTabInfo = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.title && tab.url) {
          setCurrentTitle(tab.title);
          setCurrentUrl(tab.url);
        }
      } catch (error) {
        console.error('获取标签页信息失败:', error);
      }
    };

    const loadCopyFormatSettings = async () => {
      try {
        const settings = await copyFormatStorage.getSettings();
        setCustomFormat(settings.customFormat || '{title} - {url}');
        setSelectedFormat(settings.selectedFormat || 'markdown');
        if (settings.shortcuts) {
          setShortcuts(settings.shortcuts);
        }
      } catch (error) {
        console.error('加载复制格式设置失败:', error);
      }
    };

    getCurrentTabInfo();
    loadCopyFormatSettings();

    // 监听标签页变化
    const tabUpdateListener = async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (changeInfo.title || changeInfo.url)) {
        if (changeInfo.title) setCurrentTitle(changeInfo.title);
        if (changeInfo.url) setCurrentUrl(changeInfo.url);
      }
    };

    const tabActivatedListener = async (activeInfo: chrome.tabs.TabActiveInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.title && tab.url) {
          setCurrentTitle(tab.title);
          setCurrentUrl(tab.url);
        }
      } catch (error) {
        console.error('获取激活标签页信息失败:', error);
      }
    };

    chrome.tabs.onUpdated.addListener(tabUpdateListener);
    chrome.tabs.onActivated.addListener(tabActivatedListener);

    return () => {
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
    };
  }, []);

  // 生成格式化文本
  const generateFormattedText = (template: string) =>
    template.replace(/{title}/g, currentTitle).replace(/{url}/g, currentUrl);

  // 复制选中格式
  const copySelectedFormat = async () => {
    const format = formats.find(f => f.id === selectedFormat);
    if (!format) return;

    const template = selectedFormat === 'custom' ? customFormat : format.template;
    const text = generateFormattedText(template);

    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(`✅ 已复制：${format.name}`);

      // 将格式添加到历史记录
      await copyFormatStorage.addFormatToHistory(template);

      setTimeout(() => setCopyFeedback(''), 2000);
    } catch (error) {
      console.error('复制失败:', error);
      setCopyFeedback('❌ 复制失败');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  // 预览格式化文本
  const previewText = (template: string) => {
    if (!currentTitle || !currentUrl) return '等待页面加载...';
    return generateFormattedText(template);
  };

  // 保存自定义格式
  const saveCustomFormat = async () => {
    try {
      await copyFormatStorage.setCustomFormat(customFormat);
      setCopyFeedback('✅ 自定义格式已保存');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch (error) {
      console.error('保存自定义格式失败:', error);
      setCopyFeedback('❌ 保存失败');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  // 设置选中格式
  const handleFormatChange = async (formatId: string) => {
    setSelectedFormat(formatId);
    try {
      await copyFormatStorage.setSelectedFormat(formatId);
    } catch (error) {
      console.error('保存选中格式失败:', error);
    }
  };

  // 切换快捷键启用状态
  const toggleShortcut = async (command: string, enabled: boolean) => {
    try {
      await copyFormatStorage.toggleShortcut(command, enabled);
      setShortcuts(prev => ({
        ...prev,
        [command]: {
          ...(prev[command] || {}),
          enabled,
          command,
          description: prev[command]?.description || '',
        },
      }));
      setCopyFeedback(`✅ 快捷键已${enabled ? '启用' : '禁用'}`);
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch (error) {
      console.error('切换快捷键失败:', error);
      setCopyFeedback('❌ 操作失败');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  // 获取快捷键显示文本
  const getShortcutText = (command: string) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const shortcutMap: { [key: string]: { mac: string; windows: string } } = {
      'copy-title-selected': { mac: '⌘⇧K', windows: 'Ctrl+Shift+K' },
    };
    return isMac ? shortcutMap[command]?.mac : shortcutMap[command]?.windows;
  };

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="theme-text-main mb-4 text-lg font-semibold">复制标题</h2>

      {/* 当前页面信息 */}
      <div className="border-border-default bg-background-ivory-medium mb-4 rounded border p-3">
        <div className="mb-2">
          <label className="text-text-faded block text-xs">当前标题</label>
          <p className="text-sm font-medium">{currentTitle || '加载中...'}</p>
        </div>
        <div>
          <label className="text-text-faded block text-xs">当前网址</label>
          <p className="text-text-main text-sm">{currentUrl || '加载中...'}</p>
        </div>
      </div>

      {/* 复制反馈 */}
      {copyFeedback && (
        <div className="bg-swatch-cactus/10 text-swatch-cactus mb-4 rounded p-2 text-sm">{copyFeedback}</div>
      )}

      {/* 格式选择和复制 */}
      <div className="mb-4">
        <h3 className="theme-text-main mb-2 text-sm font-medium">选择复制格式</h3>
        <div className="space-y-3">
          {/* 格式选择器 */}
          <div>
            <Select
              value={selectedFormat}
              onValueChange={handleFormatChange}
              options={formats.map(f => ({
                value: f.id,
                label: f.name,
                icon: f.icon,
              }))}
              placeholder="选择格式"
              className="w-full"
            />
          </div>

          {/* 预览 */}
          <div className="bg-background-ivory-medium rounded p-3">
            <label className="text-text-faded mb-1 block text-xs">预览</label>
            <p className="text-text-main text-sm">
              {previewText(
                selectedFormat === 'custom' ? customFormat : formats.find(f => f.id === selectedFormat)?.template || '',
              )}
            </p>
          </div>

          {/* 复制按钮 */}
          <button
            onClick={copySelectedFormat}
            disabled={!currentTitle || !currentUrl}
            className="bg-primary hover:bg-background-clay theme-btn-primary w-full rounded px-4 py-2 text-white disabled:bg-gray-400">
            📋 复制选中格式
          </button>
        </div>
      </div>

      {/* 快捷键说明 */}
      <div className="mb-4">
        <div className="bg-background-oat text-text-main rounded p-3 text-sm">
          <div className="mb-1 font-medium">💡 使用说明</div>
          <div>
            • 使用上方下拉菜单选择复制格式
            <br />
            • 按 ⌘⇧K 快捷键复制选中格式
            <br />• 如需修改快捷键，
            <button
              onClick={() => chrome.tabs.create({ url: 'chrome://extensions/configureCommands' })}
              className="text-primary hover:text-background-clay underline">
              点此打开设置页面
            </button>
          </div>
        </div>
      </div>

      {/* 快捷键开关 */}
      {Object.entries(shortcuts || {}).map(([command, config]) => (
        <div key={command} className="border-border-default mb-4 flex items-center justify-between rounded border p-3">
          <div className="flex items-center space-x-2">
            <span className="text-sm">{config.description}</span>
            <span className="text-primary bg-background-oat rounded px-2 py-1 text-xs">{getShortcutText(command)}</span>
          </div>
          <label className="flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => toggleShortcut(command, e.target.checked)}
              className="mr-2"
            />
            <span className="text-text-faded text-xs">启用</span>
          </label>
        </div>
      ))}

      {/* 自定义格式设置 */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">自定义格式</h3>
          <button
            onClick={() => setShowCustomFormat(!showCustomFormat)}
            className="bg-background-ivory-medium text-text-faded hover:bg-swatch-cloud-light rounded px-2 py-1 text-xs">
            {showCustomFormat ? '隐藏' : '设置'}
          </button>
        </div>
        {showCustomFormat && (
          <div className="mt-2 space-y-2">
            <textarea
              value={customFormat}
              onChange={e => setCustomFormat(e.target.value)}
              placeholder="输入自定义格式，使用 {title} 和 {url} 作为占位符"
              className="border-border-default bg-background-main w-full rounded border p-2 text-sm"
              rows={3}
            />
            <button
              onClick={saveCustomFormat}
              className="bg-swatch-cactus hover:bg-swatch-olive w-full rounded px-3 py-1 text-sm text-white">
              💾 保存格式
            </button>
            <div className="text-text-faded text-xs">
              <p>
                <strong>可用占位符:</strong>
              </p>
              <p>• {'{title}'} - 页面标题</p>
              <p>• {'{url}'} - 页面网址</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 开发者工具模块
// 工具模块
const ToolsModule = () => {
  const [showFloatingBadgePanel, setShowFloatingBadgePanel] = useState(false);
  const [showEdgeSnappingPanel, setShowEdgeSnappingPanel] = useState(false);

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="theme-text-main mb-4 text-lg font-semibold">工具箱</h2>

      {/* 悬浮徽章设置 */}
      <div className="mb-3">
        <button
          onClick={() => setShowFloatingBadgePanel(!showFloatingBadgePanel)}
          className="bg-background-ivory-medium hover:bg-swatch-cloud-light text-text-main mb-2 w-full rounded px-3 py-2 text-left text-sm">
          <span className="mr-2">🎯</span>
          悬浮徽章设置
        </button>
        {showFloatingBadgePanel && <FloatingBadgePanel onClose={() => setShowFloatingBadgePanel(false)} />}
      </div>

      {/* 边缘吸附设置 */}
      <div className="mb-3">
        <button
          onClick={() => setShowEdgeSnappingPanel(!showEdgeSnappingPanel)}
          className="bg-background-ivory-medium hover:bg-swatch-cloud-light text-text-main mb-2 w-full rounded px-3 py-2 text-left text-sm">
          <span className="mr-2">🧲</span>
          边缘吸附设置
        </button>
        {showEdgeSnappingPanel && <EdgeSnappingPanel onClose={() => setShowEdgeSnappingPanel(false)} />}
      </div>

      {/* 更多工具 */}
      <div className="bg-background-oat text-text-main rounded p-3 text-sm">
        <div className="mb-1 font-medium">💡 提示</div>
        <div>
          • 悬浮徽章可以让您在任何页面快速打开侧边栏
          <br />
          • 边缘吸附功能让浮动元素自动贴合浏览器边缘
          <br />• 更多工具功能正在开发中...
        </div>
      </div>
    </div>
  );
};

const DeveloperModule = () => {
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<{ input: string; result: CommandResult; timestamp: string }[]>(
    [],
  );
  const [isExecuting, setIsExecuting] = useState(false);
  const [showEdgeSnappingPanel, setShowEdgeSnappingPanel] = useState(false);

  // 执行命令
  const executeCommand = async () => {
    if (!commandInput.trim() || isExecuting) return;

    setIsExecuting(true);
    const timestamp = new Date().toLocaleTimeString();

    try {
      // 获取当前标签页信息作为命令上下文
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const context = {
        currentUrl: tab.url,
        tabId: tab.id,
        timestamp: new Date().toISOString(),
      };

      // 如果是需要与页面交互的命令，需要通过消息传递到content script
      if (
        commandInput.startsWith('/detectForms') ||
        commandInput.startsWith('/fillForm') ||
        commandInput.startsWith('/clearForm') ||
        commandInput.startsWith('/validateForm') ||
        commandInput.startsWith('/clearHighlights') ||
        commandInput.startsWith('/highlightForm') ||
        commandInput.startsWith('/debugForms') ||
        commandInput.startsWith('/markAllElements') ||
        commandInput.startsWith('/markInputs') ||
        commandInput.startsWith('/markContainers') ||
        commandInput.startsWith('/clearAllMarks') ||
        commandInput.startsWith('/fillAllTextInputs')
      ) {
        const parts = commandInput.trim().split(/\s+/);
        const commandName = parts[0].substring(1);
        const args = parts.slice(1);

        let result: CommandResult;

        if (commandName === 'detectForms') {
          const response = await chrome.tabs.sendMessage(tab.id!, { action: 'detectForms' });
          result = {
            success: response.success,
            message: response.message || (response.success ? '表单检测完成' : '表单检测失败'),
            data: response.data,
          };
        } else if (commandName === 'fillForm') {
          if (args.length === 0) {
            result = {
              success: false,
              message: '请指定模板名称。用法: /fillForm <模板名称> [表单选择器]',
            };
          } else {
            // 使用默认示例数据
            const defaultData = {
              name: '张三',
              email: 'zhangsan@example.com',
              phone: '13800138000',
              address: '北京市朝阳区',
            };

            const response = await chrome.tabs.sendMessage(tab.id!, {
              action: 'fillForm',
              data: {
                formSelector: args[1] || 'form:first-of-type',
                data: defaultData,
                options: {
                  simulateTyping: true,
                  typingDelay: 50,
                  triggerEvents: true,
                  scrollToField: true,
                },
              },
            });
            result = {
              success: response.success,
              message: response.message || (response.success ? '表单填写完成' : '表单填写失败'),
              data: response.data,
            };
          }
        } else if (commandName === 'clearForm') {
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'clearForm',
            data: { formSelector: args[0] || 'form:first-of-type' },
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '表单清空完成' : '表单清空失败'),
            data: response.data,
          };
        } else if (commandName === 'validateForm') {
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'validateForm',
            data: { formSelector: args[0] || 'form:first-of-type' },
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '表单验证完成' : '表单验证失败'),
            data: response.data,
          };
        } else if (commandName === 'clearHighlights') {
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'clearHighlights',
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '清除标记完成' : '清除标记失败'),
            data: response.data,
          };
        } else if (commandName === 'highlightForm') {
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'highlightForm',
            data: { formSelector: args[0] || 'form:first-of-type' },
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '标记表单完成' : '标记表单失败'),
            data: response.data,
          };
        } else if (commandName === 'debugForms') {
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'debugForms',
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '调试信息已输出到控制台' : '调试失败'),
            data: response.data,
          };
        } else if (commandName === 'markAllElements') {
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'markAllElements',
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '已标记所有元素' : '标记失败'),
            data: response.data,
          };
        } else if (commandName === 'markInputs') {
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'markInputs',
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '已标记输入元素' : '标记失败'),
            data: response.data,
          };
        } else if (commandName === 'markContainers') {
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'markContainers',
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '已标记容器元素' : '标记失败'),
            data: response.data,
          };
        } else if (commandName === 'clearAllMarks') {
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'clearAllMarks',
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '已清除所有标记' : '清除失败'),
            data: response.data,
          };
        } else if (commandName === 'fillAllTextInputs') {
          const text = args[0] || '111';
          const response = await chrome.tabs.sendMessage(tab.id!, {
            action: 'fillAllTextInputs',
            data: { text },
          });
          result = {
            success: response.success,
            message: response.message || (response.success ? '已填充所有文本输入框' : '填充失败'),
            data: response.data,
          };
        } else {
          result = {
            success: false,
            message: `未知命令: /${commandName}`,
          };
        }

        // 添加到历史记录
        setCommandHistory(prev => [
          { input: commandInput, result, timestamp },
          ...prev.slice(0, 19), // 保留最近20条记录
        ]);
      } else {
        // 其他命令通过命令处理器执行
        const result = await commandProcessor.executeCommand(commandInput, context);
        setCommandHistory(prev => [{ input: commandInput, result, timestamp }, ...prev.slice(0, 19)]);
      }

      setCommandInput('');
    } catch (error) {
      const result: CommandResult = {
        success: false,
        message: `命令执行失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };

      setCommandHistory(prev => [{ input: commandInput, result, timestamp }, ...prev.slice(0, 19)]);
    } finally {
      setIsExecuting(false);
    }
  };

  // 处理键盘事件
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    }
  };

  // 清空历史记录
  const clearHistory = () => {
    setCommandHistory([]);
  };

  // 快速插入示例命令
  const insertExampleCommand = (command: string) => {
    setCommandInput(command);
  };

  const exampleCommands = [
    { command: '/help', description: '显示所有可用命令' },
    { command: '/markAllElements', description: '标记页面所有有意义的元素' },
    { command: '/markInputs', description: '只标记输入相关元素' },
    { command: '/markContainers', description: '只标记容器元素' },
    { command: '/clearAllMarks', description: '清除所有元素标记' },
    { command: '/detectForms', description: '检测并标记页面表单字段' },
    { command: '/fillForm 个人信息', description: '使用个人信息模板填写表单' },
    { command: '/fillAllTextInputs', description: '在所有文本输入框中填充"111"' },
    { command: '/clearHighlights', description: '清除表单字段标记' },
    { command: '/debugForms', description: '调试表单检测（查看控制台）' },
  ];

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="theme-text-main text-lg font-semibold">开发者工具</h2>
        <button
          onClick={() => setShowEdgeSnappingPanel(!showEdgeSnappingPanel)}
          className="bg-background-ivory-medium hover:bg-swatch-cloud-light text-text-main rounded px-3 py-1.5 text-sm"
          title="边缘吸附设置">
          🧲 边缘吸附
        </button>
      </div>

      {/* 边缘吸附设置面板 */}
      {showEdgeSnappingPanel && <EdgeSnappingPanel onClose={() => setShowEdgeSnappingPanel(false)} />}

      {/* 命令输入区域 */}
      <div className="mb-4">
        <label htmlFor="command-input" className="mb-2 block text-sm font-medium">
          命令输入
        </label>
        <div className="flex space-x-2">
          <input
            id="command-input"
            type="text"
            value={commandInput}
            onChange={e => setCommandInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入命令，例如: /help 或 /detectForms"
            className="border-border-default bg-background-main flex-1 rounded border px-3 py-2 text-sm"
            disabled={isExecuting}
          />
          <button
            onClick={executeCommand}
            disabled={!commandInput.trim() || isExecuting}
            className="bg-primary hover:bg-background-clay theme-btn-primary rounded px-4 py-2 text-sm text-white disabled:bg-gray-400">
            {isExecuting ? '执行中...' : '执行'}
          </button>
        </div>
        <p className="text-text-faded mt-1 text-xs">按 Enter 键快速执行命令</p>
      </div>

      {/* 示例命令 */}
      <div className="mb-4">
        <h3 className="theme-text-main mb-2 text-sm font-medium">示例命令</h3>
        <div className="grid grid-cols-1 gap-2">
          {exampleCommands.map((example, index) => (
            <button
              key={index}
              onClick={() => insertExampleCommand(example.command)}
              className="border-border-default hover:bg-background-ivory-medium rounded border p-2 text-left text-xs">
              <code className="text-primary font-mono">{example.command}</code>
              <p className="text-text-faded mt-1">{example.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 命令历史 */}
      <div className="flex-1 overflow-auto">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">命令历史</h3>
          {commandHistory.length > 0 && (
            <button
              onClick={clearHistory}
              className="bg-background-clay/20 text-background-clay hover:bg-background-clay/30 rounded px-2 py-1 text-xs">
              清空
            </button>
          )}
        </div>

        {commandHistory.length === 0 ? (
          <div className="text-text-faded py-8 text-center">
            <div className="mb-2 text-4xl">⌨️</div>
            <p>输入命令开始使用开发者工具</p>
          </div>
        ) : (
          <div className="space-y-3">
            {commandHistory.map((entry, index) => (
              <div key={index} className="border-border-default rounded border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <code className="text-primary font-mono text-sm">{entry.input}</code>
                  <span className="text-text-faded text-xs">{entry.timestamp}</span>
                </div>
                <div
                  className={cn(
                    'rounded p-2 text-sm',
                    entry.result.success
                      ? 'bg-swatch-cactus/10 text-swatch-cactus'
                      : 'bg-background-clay/10 text-background-clay',
                  )}>
                  <div className="flex items-start">
                    <span className="mr-2 text-lg">{entry.result.success ? '✅' : '❌'}</span>
                    <div className="flex-1">
                      <p className="whitespace-pre-wrap">{entry.result.message}</p>
                      {entry.result.data ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs opacity-75">查看详细数据</summary>
                          <pre className="mt-1 overflow-auto rounded bg-black/10 p-2 text-xs">
                            {JSON.stringify(entry.result.data, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const SidePanel = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const [activeTab, setActiveTab] = useState('capture');

  const tabs = [
    { id: 'capture', name: '捕获', icon: '🎯' },
    { id: 'copy', name: '复制', icon: '📋' },
    { id: 'text', name: '文本', icon: '📝' },
    { id: 'dev', name: '开发', icon: '🛠️' },
    { id: 'tools', name: '工具', icon: '⚡' },
    { id: 'profile', name: '我的', icon: '👤' },
  ];

  return (
    <div
      className={cn(
        'theme-bg-main theme-text-main flex h-screen w-full flex-col',
        isLight
          ? 'bg-background-main text-text-main theme-bg-main theme-text-main'
          : 'bg-background-dark text-background-main theme-bg-dark theme-text-main',
      )}>
      {/* 导航标签 */}
      <nav className="border-border-default bg-background-main flex border-b">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex min-h-[60px] flex-1 flex-col items-center justify-center px-1 py-2 text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'border-primary bg-background-oat text-primary border-b-2'
                : 'text-text-faded hover:text-text-main',
            )}>
            <span className="mb-1 text-xl">{tab.icon}</span>
            <span className="text-xs leading-tight">{tab.name}</span>
          </button>
        ))}
      </nav>

      {/* 内容区域 */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'capture' && <SimpleCaptureModule />}
        {activeTab === 'copy' && <CopyTitleModule />}
        {activeTab === 'text' && <SimpleTextModule />}
        {activeTab === 'dev' && <DeveloperModule />}
        {activeTab === 'tools' && <ToolsModule />}
        {activeTab !== 'capture' &&
          activeTab !== 'copy' &&
          activeTab !== 'text' &&
          activeTab !== 'dev' &&
          activeTab !== 'tools' && (
            <div className="p-4 text-center">
              <div className="mb-4 text-4xl">🚧</div>
              <h3 className="mb-2 text-lg font-medium">{tabs.find(t => t.id === activeTab)?.name}</h3>
              <p className="text-text-faded">功能开发中...</p>
            </div>
          )}
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(SidePanel, <LoadingSpinner />), ErrorDisplay);
