import '@src/SidePanel.css';
import { ClaudeExportPanel } from './components/ClaudeExportPanel';
import { FloatingBadgePanel } from './components/FloatingBadgePanel';
import { SitePresetsPanel } from './components/SitePresetsPanel';
import { useStorage, withErrorBoundary, withSuspense, commandProcessor } from '@extension/shared';
import {
  exampleThemeStorage,
  domPathStorage,
  downloadSettingsStorage,
  sitePresetsStorage,
  floatingBadgeStorage,
} from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, Select } from '@extension/ui';
import {
  Cross2Icon,
  ExclamationTriangleIcon,
  MagicWandIcon,
  TargetIcon,
  StopIcon,
  ClipboardCopyIcon,
  Pencil2Icon,
  CheckIcon,
  DownloadIcon,
  ChevronDownIcon,
  FileTextIcon,
  GearIcon,
  LightningBoltIcon,
  MixerHorizontalIcon,
  PersonIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  KeyboardIcon,
} from '@radix-ui/react-icons';
import { useState, useEffect } from 'react';
import type { CommandResult } from '@extension/shared';

// 下载设置面板组件
const DownloadSettingsPanel = ({ onClose }: { onClose: () => void }) => {
  const [settings, setSettings] = useState({
    askForLocation: true,
    useDefaultPath: false,
    defaultPath: 'Downloads',
    lastUsedPath: '',
    lastUsedAbsolutePath: '',
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await downloadSettingsStorage.getSettings();
        setSettings(currentSettings);
      } catch (error) {
        console.error('加载设置失败:', error);
      }
    };

    loadSettings();
    chrome.storage.onChanged.addListener(loadSettings);
    return () => chrome.storage.onChanged.removeListener(loadSettings);
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

  // Toggle 组件
  const Toggle = ({
    checked,
    onChange,
    label,
    disabled = false,
  }: {
    checked: boolean;
    onChange: () => void;
    label: string;
    disabled?: boolean;
  }) => (
    <div className="flex items-center justify-between py-2">
      <span className={cn('text-sm', disabled ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
      <button
        onClick={onChange}
        disabled={disabled}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-input',
          disabled && 'cursor-not-allowed opacity-50',
        )}>
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-foreground font-medium">下载设置</h4>
        <button onClick={onClose} className="bg-secondary text-muted-foreground hover:bg-secondary/80 rounded-lg p-1.5">
          <Cross2Icon className="h-4 w-4" />
        </button>
      </div>

      <Toggle
        checked={settings.askForLocation}
        onChange={() => updateSetting('askForLocation', !settings.askForLocation)}
        label="每次询问保存位置"
      />

      <Toggle
        checked={settings.useDefaultPath}
        onChange={() => updateSetting('useDefaultPath', !settings.useDefaultPath)}
        label="使用默认路径"
        disabled={settings.askForLocation}
      />

      {settings.useDefaultPath && !settings.askForLocation && (
        <div>
          <label className="text-muted-foreground mb-1.5 block text-sm">默认下载路径</label>
          <input
            type="text"
            value={settings.defaultPath}
            onChange={e => updateSetting('defaultPath', e.target.value)}
            placeholder="Downloads"
            className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
          />
        </div>
      )}

      {Boolean(settings.lastUsedAbsolutePath || settings.lastUsedPath) && (
        <div>
          <label className="text-muted-foreground mb-1.5 block text-sm">最后使用的路径</label>
          <div className="bg-muted text-foreground rounded-lg px-3 py-2 text-sm">
            {settings.lastUsedAbsolutePath || settings.lastUsedPath}
          </div>
        </div>
      )}

      {!settings.askForLocation && (
        <div className="bg-muted rounded-xl p-3">
          <div className="mb-1 flex items-center gap-2">
            <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
            <span className="text-foreground text-sm font-medium">注意</span>
          </div>
          <p className="text-muted-foreground text-xs">
            如果 Chrome 浏览器设置中开启了"下载前询问每个文件的保存位置"，仍然会显示保存对话框。这是浏览器级别的限制。
          </p>
        </div>
      )}
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
  const [showPresetsPanel, setShowPresetsPanel] = useState(false);
  const [domPathCopied, setDomPathCopied] = useState(false);
  const [markdownCopied, setMarkdownCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportAction, setExportAction] = useState<'download' | 'copy'>('download');

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
          }
        } catch (error) {
          console.error('处理URL变化失败:', error);
          setDomPath('');
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

  // 选择模式下的退出检测（仅在标签页切换或切换 app 时退出）
  useEffect(() => {
    if (!isSelecting) return;

    const exitSelectionMode = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { action: 'stopSelection' });
        }
      } catch {
        // 静默处理
      }
      setIsSelecting(false);
    };

    // 1. 标签页切换时退出
    const handleTabActivated = () => exitSelectionMode();
    chrome.tabs.onActivated.addListener(handleTabActivated);

    // 2. 窗口焦点变化时退出（切换 app）
    const handleWindowFocusChanged = (windowId: number) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        exitSelectionMode();
      }
    };
    chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.windows.onFocusChanged.removeListener(handleWindowFocusChanged);
    };
  }, [isSelecting]);

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
      setIsSelecting(true);
    } catch (error) {
      console.error('智能选择失败:', error);
    }
  };

  const reselectFromPath = async () => {
    if (!domPath) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id!, { action: 'reselectFromPath', domPath });
      setIsSelecting(true);
    } catch (error) {
      console.error('重新选择失败:', error);
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

  const hasFrontmatter = (text: string): boolean => /^---\n[\s\S]*?\n---/.test(text);

  const parseFrontmatter = (text: string): { frontmatter: Record<string, string>; content: string } => {
    const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, content: text };

    const frontmatterStr = match[1];
    const content = match[2] || '';
    const frontmatter: Record<string, string> = {};

    frontmatterStr.split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).replace(/^ /, ''); // 只去掉冒号后的一个空格
        frontmatter[key] = value;
      }
    });

    return { frontmatter, content };
  };

  const buildMarkdown = (frontmatter: Record<string, string>, content: string): string => {
    const fm = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    const trimmedContent = content.replace(/^\n+/, '');
    return `---\n${fm}\n---\n\n${trimmedContent}`;
  };

  const updateFrontmatterField = (key: string, value: string) => {
    const { frontmatter, content } = parseFrontmatter(markdownOutput);
    frontmatter[key] = value;
    setMarkdownOutput(buildMarkdown(frontmatter, content));
  };

  const updateContent = (newContent: string) => {
    const { frontmatter } = parseFrontmatter(markdownOutput);
    setMarkdownOutput(buildMarkdown(frontmatter, newContent));
  };

  const generateFrontmatter = (title: string, source: string): string => {
    const datetime = new Date().toISOString();
    const slug = `content-${Date.now()}`;
    return `---
title: ${title}
slug: ${slug}
source: ${source}
datetime: ${datetime}
---

`;
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      if (hasFrontmatter(text)) {
        setMarkdownOutput(text);
      } else {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const title = tab.title || 'Pasted Content';
        const source = tab.url || '';
        setMarkdownOutput(generateFrontmatter(title, source) + text);
      }
    } catch (error) {
      console.error('从剪切板读取失败:', error);
    }
  };

  const sanitizeFilename = (name: string): string =>
    // 替换文件名中的非法字符: / \ : * ? " < > |
    name.replace(/[/\\:*?"<>|]/g, '-');
  const downloadMarkdown = async () => {
    if (!markdownOutput) return;

    try {
      // 从 markdown 内容中提取 title
      const title = extractTitleFromMarkdown(markdownOutput);
      const filename = `${sanitizeFilename(title)}.md`;

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

    // 始终显示保存对话框
    downloadOptions.saveAs = true;
    // 只有在 Downloads 子目录时才设置路径，让 Chrome 打开到该子目录
    if (settings.lastUsedPath) {
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
              // 提取目录路径并计算 Downloads 下的相对路径
              const absolutePath = downloadedFile.filename;

              // 复制文件路径到剪贴板，有空格时用单引号包裹
              const formattedPath = absolutePath.includes(' ') ? `'${absolutePath}'` : absolutePath;
              navigator.clipboard.writeText(formattedPath).catch(console.error);

              const pathParts = absolutePath.split(/[/\\]/);
              pathParts.pop(); // 移除文件名
              const separator = absolutePath.includes('\\') ? '\\' : '/';
              let directoryPath = pathParts.join(separator);
              if (!directoryPath && absolutePath.startsWith('/')) {
                directoryPath = '/';
              } else if (/^[A-Za-z]:$/.test(directoryPath)) {
                directoryPath = `${directoryPath}${separator}`;
              }

              // 查找 Downloads 文件夹在路径中的位置
              const downloadsIndex = pathParts.findIndex(part => part.toLowerCase() === 'downloads' || part === '下载');

              const relativePath =
                downloadsIndex !== -1 && downloadsIndex < pathParts.length - 1
                  ? pathParts.slice(downloadsIndex + 1).join('/')
                  : '';

              await downloadSettingsStorage.updateSettings({
                lastUsedPath: relativePath,
                lastUsedAbsolutePath: directoryPath,
              });
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
    <div className="bg-background flex h-full flex-col overflow-hidden p-4">
      {/* 页面标题栏 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-foreground font-serif text-xl font-semibold">页面捕获</h2>
        <button
          onClick={() => setShowPresetsPanel(!showPresetsPanel)}
          className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg p-2 transition-colors"
          title="预设配置">
          <GearIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Claude 导出面板 */}
      <div className="mb-4">
        <ClaudeExportPanel />
      </div>

      {/* 操作按钮区域 */}
      <div className="mb-4 space-y-3">
        {/* 主按钮组 - 单行响应式 */}
        <div className="flex gap-2">
          <button
            onClick={smartSelect}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium">
            <MagicWandIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">智能选择</span>
          </button>
          {!isSelecting ? (
            <button
              onClick={startSelection}
              className="border-border bg-card text-card-foreground hover:bg-accent flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-sm font-medium">
              <TargetIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">手动选择</span>
            </button>
          ) : (
            <button
              onClick={stopSelection}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium">
              <StopIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">停止选择</span>
            </button>
          )}
          <button
            onClick={pasteFromClipboard}
            className="border-border bg-card text-card-foreground hover:bg-accent flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-sm font-medium">
            <ClipboardCopyIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">粘贴</span>
          </button>
        </div>

        {/* 预设配置面板 */}
        {showPresetsPanel && (
          <div className="border-border bg-card rounded-xl border p-4">
            <SitePresetsPanel onClose={() => setShowPresetsPanel(false)} />
          </div>
        )}
      </div>

      {/* DOM路径卡片 */}
      {domPath && (
        <div className="border-border bg-card mb-4 rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-card-foreground text-sm font-medium">DOM 路径</h3>
            <div className="flex gap-1">
              <button
                onClick={reselectFromPath}
                className="bg-secondary text-foreground hover:bg-secondary/80 rounded-lg p-2 text-sm"
                title="重新选择">
                <TargetIcon className="h-4 w-4" />
              </button>
              <button
                onClick={startEditPath}
                className="bg-secondary text-foreground hover:bg-secondary/80 rounded-lg p-2 text-sm"
                title="编辑路径">
                <Pencil2Icon className="h-4 w-4" />
              </button>
              <button
                onClick={copyDomPath}
                className={cn(
                  'rounded-lg p-2 text-sm transition-colors',
                  domPathCopied
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-foreground hover:bg-secondary/80',
                )}
                title={domPathCopied ? '已复制!' : '复制路径'}>
                {domPathCopied ? <CheckIcon className="h-4 w-4" /> : <ClipboardCopyIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {!isEditingPath ? (
            <code className="bg-muted text-foreground block max-h-24 overflow-auto break-all rounded-lg p-3 font-mono text-xs">
              {domPath}
            </code>
          ) : (
            <div className="space-y-3">
              <textarea
                value={editPathValue}
                onChange={e => setEditPathValue(e.target.value)}
                className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-ring w-full rounded-lg border p-3 font-mono text-xs focus:outline-none focus:ring-1"
                rows={3}
                placeholder="输入CSS选择器路径..."
              />
              {pathError && <p className="text-destructive text-xs">{pathError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={saveEditPath}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-xs">
                  保存
                </button>
                <button
                  onClick={cancelEditPath}
                  className="bg-secondary text-foreground hover:bg-secondary/80 rounded-lg px-4 py-2 text-xs">
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 内容区域 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {markdownOutput ? (
          <div className="border-border bg-card flex h-full flex-col rounded-xl border">
            {/* 标题栏 */}
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-card-foreground text-sm font-medium">Markdown 内容</h3>
              {/* Split Button */}
              <div className="relative">
                <div className="flex">
                  <button
                    onClick={exportAction === 'download' ? downloadMarkdown : copyToClipboard}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-sm font-medium">
                    {exportAction === 'download' ? (
                      <DownloadIcon className="h-4 w-4" />
                    ) : markdownCopied ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      <ClipboardCopyIcon className="h-4 w-4" />
                    )}
                    <span>{exportAction === 'download' ? '下载' : markdownCopied ? '已复制' : '复制'}</span>
                  </button>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 border-primary-foreground/20 rounded-r-lg border-l px-2 py-1.5">
                    <ChevronDownIcon className={cn('h-4 w-4 transition-transform', showExportMenu && 'rotate-180')} />
                  </button>
                </div>
                {showExportMenu && (
                  <div className="border-border bg-card absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-lg border py-1 shadow-lg">
                    <button
                      onClick={() => {
                        setExportAction('download');
                        setShowExportMenu(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-sm',
                        exportAction === 'download' ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}>
                      <DownloadIcon className="h-4 w-4" />
                      <span>下载</span>
                    </button>
                    <button
                      onClick={() => {
                        setExportAction('copy');
                        setShowExportMenu(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-sm',
                        exportAction === 'copy' ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}>
                      <ClipboardCopyIcon className="h-4 w-4" />
                      <span>复制</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Frontmatter 表单 */}
            {(() => {
              const { frontmatter, content } = parseFrontmatter(markdownOutput);
              return (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="border-border space-y-2 border-b p-3">
                    <div className="flex items-center gap-2">
                      <label className="text-muted-foreground w-16 shrink-0 text-xs">标题</label>
                      <input
                        type="text"
                        value={frontmatter.title || ''}
                        onChange={e => updateFrontmatterField('title', e.target.value)}
                        className="border-input bg-background text-foreground flex-1 rounded border px-2 py-1 text-xs focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-muted-foreground w-16 shrink-0 text-xs">来源</label>
                      <input
                        type="text"
                        value={frontmatter.source || ''}
                        onChange={e => updateFrontmatterField('source', e.target.value)}
                        className="border-input bg-background text-foreground flex-1 rounded border px-2 py-1 text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                  {/* 正文编辑 */}
                  <textarea
                    value={content}
                    onChange={e => updateContent(e.target.value)}
                    className="bg-muted text-foreground flex-1 resize-none overflow-auto p-4 font-mono text-xs focus:outline-none"
                  />
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="bg-muted flex h-full flex-col items-center justify-center rounded-xl py-12">
            <FileTextIcon className="text-muted-foreground mb-3 h-12 w-12" />
            <p className="text-foreground mb-1 font-medium">准备捕获内容</p>
            <p className="text-muted-foreground text-sm">点击上方按钮选择网页元素</p>
          </div>
        )}
      </div>
    </div>
  );
};

// 设置模块
const ToolsModule = () => {
  const [showFloatingBadgePanel, setShowFloatingBadgePanel] = useState(false);
  const [showDownloadSettingsPanel, setShowDownloadSettingsPanel] = useState(false);

  return (
    <div className="bg-background flex h-full flex-col overflow-y-auto p-4">
      {/* 页面标题 - 衬线体 */}
      <h2 className="text-foreground mb-6 font-serif text-xl font-semibold">设置</h2>

      {/* 设置卡片区域 */}
      <div className="space-y-4">
        {/* 悬浮徽章设置卡片 */}
        <div className="border-border bg-card rounded-xl border p-4">
          <button
            onClick={() => setShowFloatingBadgePanel(!showFloatingBadgePanel)}
            className="flex w-full items-center justify-between text-left">
            <div className="flex items-center gap-3">
              <span className="bg-secondary flex h-10 w-10 items-center justify-center rounded-lg">
                <TargetIcon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-card-foreground font-medium">悬浮徽章</h3>
                <p className="text-muted-foreground text-sm">配置页面悬浮按钮</p>
              </div>
            </div>
            <ChevronDownIcon
              className={cn(
                'text-muted-foreground h-5 w-5 transition-transform',
                showFloatingBadgePanel && 'rotate-180',
              )}
            />
          </button>

          {/* 展开的设置面板 */}
          {showFloatingBadgePanel && (
            <div className="border-border mt-4 border-t pt-4">
              <FloatingBadgePanel onClose={() => setShowFloatingBadgePanel(false)} />
            </div>
          )}
        </div>

        {/* 下载设置卡片 */}
        <div className="border-border bg-card rounded-xl border p-4">
          <button
            onClick={() => setShowDownloadSettingsPanel(!showDownloadSettingsPanel)}
            className="flex w-full items-center justify-between text-left">
            <div className="flex items-center gap-3">
              <span className="bg-secondary flex h-10 w-10 items-center justify-center rounded-lg">
                <DownloadIcon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-card-foreground font-medium">下载设置</h3>
                <p className="text-muted-foreground text-sm">配置文件下载行为</p>
              </div>
            </div>
            <ChevronDownIcon
              className={cn(
                'text-muted-foreground h-5 w-5 transition-transform',
                showDownloadSettingsPanel && 'rotate-180',
              )}
            />
          </button>

          {/* 展开的设置面板 */}
          {showDownloadSettingsPanel && (
            <div className="border-border mt-4 border-t pt-4">
              <DownloadSettingsPanel onClose={() => setShowDownloadSettingsPanel(false)} />
            </div>
          )}
        </div>

        {/* 提示信息卡片 */}
        <div className="bg-muted rounded-xl p-4">
          <div className="mb-2 flex items-center gap-2">
            <LightningBoltIcon className="h-5 w-5 text-amber-500" />
            <span className="text-foreground font-medium">使用提示</span>
          </div>
          <ul className="text-muted-foreground space-y-1 text-sm">
            <li>• 悬浮徽章可在任何页面快速打开侧边栏</li>
            <li>• 下载设置可控制文件保存位置</li>
          </ul>
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
      <h2 className="theme-text-main mb-4 text-lg font-semibold">开发者工具</h2>

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
            <KeyboardIcon className="mx-auto mb-2 h-10 w-10" />
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
                    {entry.result.success ? (
                      <CheckCircledIcon className="mr-2 h-5 w-5 shrink-0" />
                    ) : (
                      <CrossCircledIcon className="mr-2 h-5 w-5 shrink-0" />
                    )}
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
    { id: 'capture', name: '捕获', icon: <TargetIcon className="h-5 w-5" /> },
    { id: 'dev', name: '开发', icon: <MixerHorizontalIcon className="h-5 w-5" /> },
    { id: 'tools', name: '设置', icon: <GearIcon className="h-5 w-5" /> },
    { id: 'profile', name: '我的', icon: <PersonIcon className="h-5 w-5" /> },
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
            <span className="mb-1">{tab.icon}</span>
            <span className="text-xs leading-tight">{tab.name}</span>
          </button>
        ))}
      </nav>

      {/* 内容区域 */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'capture' && <SimpleCaptureModule />}
        {activeTab === 'dev' && <DeveloperModule />}
        {activeTab === 'tools' && <ToolsModule />}
        {activeTab !== 'capture' && activeTab !== 'dev' && activeTab !== 'tools' && (
          <div className="p-4 text-center">
            <ExclamationTriangleIcon className="text-muted-foreground mx-auto mb-4 h-10 w-10" />
            <h3 className="mb-2 text-lg font-medium">{tabs.find(t => t.id === activeTab)?.name}</h3>
            <p className="text-text-faded">功能开发中...</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(SidePanel, <LoadingSpinner />), ErrorDisplay);
