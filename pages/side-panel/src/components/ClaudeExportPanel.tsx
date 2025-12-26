import { claudeExportStorage, downloadSettingsStorage } from '@extension/storage';
import { cn } from '@extension/ui';
import {
  LightningBoltIcon,
  CheckIcon,
  DownloadIcon,
  ClipboardCopyIcon,
  ChevronDownIcon,
  CheckCircledIcon,
  FileTextIcon,
  ChatBubbleIcon,
  CrossCircledIcon,
  RocketIcon,
} from '@radix-ui/react-icons';
import { useState, useEffect, useCallback } from 'react';
import type { ClaudeExportOptions } from '@extension/storage';

// 支持的 AI 平台
type AIPlatform = 'claude' | 'google-ai-studio';

// 统一的消息格式
interface UnifiedMessage {
  role: 'human' | 'assistant';
  text: string;
  thinking?: string;
  toolCalls?: Array<{ name: string; input: unknown }>;
  toolResults?: string[];
}

interface UnifiedChatData {
  platform: AIPlatform;
  id: string;
  title: string;
  model?: string;
  messages: UnifiedMessage[];
  sourceUrl: string;
  exportedAt: string;
}

// Claude API 响应类型
interface ClaudeMessage {
  uuid: string;
  sender: 'human' | 'assistant';
  text: string;
  content: Array<{
    type: string;
    text?: string;
    thinking?: string;
    tool_use?: {
      name: string;
      input: unknown;
    };
    tool_result?: {
      content: string;
    };
  }>;
  created_at: string;
}

interface ClaudeChatResponse {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeMessage[];
}

// Google AI Studio 响应类型（基于实际 JSON 结构）
type GoogleAIStudioResponse = unknown[][];

type ExportStatus = 'idle' | 'detecting' | 'ready' | 'exporting' | 'success' | 'error';

// 平台检测结果
interface PlatformDetection {
  platform: AIPlatform;
  id: string;
  title: string;
}

interface ExportResult {
  filename: string;
  messageCount: number;
  fileSize: string;
}

// 平台名称映射
const PLATFORM_NAMES: Record<AIPlatform, string> = {
  claude: 'Claude',
  'google-ai-studio': 'Google AI Studio',
};

// 解析 Google AI Studio 响应为统一格式
// 数据结构：
// - chunk[0] 是主文本，chunk[8] 是 role (user/model)
// - chunk[19] === 1 表示整条消息是 thinking
// - chunk[29] 包含子 blocks，用于流式显示
function parseGoogleAIStudioResponse(data: GoogleAIStudioResponse, url: string): UnifiedChatData {
  const root = data[0] as unknown[];
  const promptId = (root[0] as string) || '';
  const config = root[3] as unknown[];
  const metadata = root[4] as unknown[];

  const model = config?.[2] as string | undefined;
  const title = (metadata?.[0] as string) || '未命名对话';

  const messages: UnifiedMessage[] = [];
  const conversations = (root[13] as unknown[][]) || (root[11] as unknown[][]) || [];

  for (const turn of conversations) {
    if (!Array.isArray(turn)) continue;

    // 按顺序处理：遇到 user 时先输出之前的 assistant
    let thinkingTexts: string[] = [];
    let responseTexts: string[] = [];

    const flushAssistant = () => {
      if (thinkingTexts.length > 0 || responseTexts.length > 0) {
        messages.push({
          role: 'assistant',
          text: responseTexts.join(''),
          thinking: thinkingTexts.length > 0 ? thinkingTexts.join('\n\n') : undefined,
        });
        thinkingTexts = [];
        responseTexts = [];
      }
    };

    for (const chunk of turn) {
      if (!Array.isArray(chunk)) continue;

      const role = chunk[8] as string;
      if (!role || (role !== 'user' && role !== 'model')) continue;

      const text = (chunk[0] as string) || '';

      if (role === 'user') {
        // 先输出之前收集的 assistant 消息
        flushAssistant();
        // 添加 user 消息（跳过空消息）
        if (text) {
          messages.push({ role: 'human', text });
        }
      } else if (role === 'model') {
        // chunk[19] === 1 表示是 thinking 消息
        const isThinking = chunk[19] === 1;
        if (isThinking) {
          if (text) thinkingTexts.push(text);
        } else {
          if (text) responseTexts.push(text);
        }
      }
    }

    // 处理最后剩余的 assistant 消息
    flushAssistant();
  }

  return {
    platform: 'google-ai-studio',
    id: promptId,
    title,
    model,
    messages,
    sourceUrl: url,
    exportedAt: new Date().toISOString(),
  };
}

// 解析 Claude 响应为统一格式
function parseClaudeResponse(data: ClaudeChatResponse, url: string): UnifiedChatData {
  const messages: UnifiedMessage[] = [];

  for (const msg of data.chat_messages || []) {
    const unifiedMsg: UnifiedMessage = {
      role: msg.sender,
      text: '',
    };

    if (msg.content && Array.isArray(msg.content)) {
      const textParts: string[] = [];
      const toolCalls: Array<{ name: string; input: unknown }> = [];
      const toolResults: string[] = [];

      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          textParts.push(block.text);
        } else if (block.type === 'thinking' && block.thinking) {
          unifiedMsg.thinking = block.thinking;
        } else if (block.type === 'tool_use' && block.tool_use) {
          toolCalls.push({ name: block.tool_use.name, input: block.tool_use.input });
        } else if (block.type === 'tool_result' && block.tool_result) {
          toolResults.push(block.tool_result.content);
        }
      }

      unifiedMsg.text = textParts.join('\n');
      if (toolCalls.length > 0) unifiedMsg.toolCalls = toolCalls;
      if (toolResults.length > 0) unifiedMsg.toolResults = toolResults;
    } else if (msg.text) {
      unifiedMsg.text = msg.text;
    }

    messages.push(unifiedMsg);
  }

  return {
    platform: 'claude',
    id: data.uuid,
    title: data.name || '未命名对话',
    messages,
    sourceUrl: url,
    exportedAt: new Date().toISOString(),
  };
}

export const ClaudeExportPanel = () => {
  const [status, setStatus] = useState<ExportStatus>('detecting');
  const [platform, setPlatform] = useState<PlatformDetection | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null); // Claude 专用
  const [error, setError] = useState<string>('');
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState<ClaudeExportOptions>({
    includeThinking: true,
    includeToolCalls: true,
    textOnly: false,
  });
  const [progress, setProgress] = useState(0);

  // 检测当前页面是否是支持的 AI 聊天页面
  const detectAIPage = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url) {
        setStatus('idle');
        return;
      }

      // 匹配 claude.ai/chat/{chatId}
      const claudeMatch = tab.url.match(/^https:\/\/claude\.ai\/chat\/([a-f0-9-]+)/);
      if (claudeMatch) {
        const chatId = claudeMatch[1];
        setPlatform({ platform: 'claude', id: chatId, title: '' });

        // 尝试获取 Claude orgId
        try {
          const response = await chrome.tabs.sendMessage(tab.id!, { action: 'getClaudeOrgId' });
          if (response?.orgId) {
            setOrgId(response.orgId);
            await claudeExportStorage.setLastOrgId(response.orgId);
          } else {
            const cachedOrgId = await claudeExportStorage.getLastOrgId();
            if (cachedOrgId) setOrgId(cachedOrgId);
          }
        } catch {
          const cachedOrgId = await claudeExportStorage.getLastOrgId();
          if (cachedOrgId) setOrgId(cachedOrgId);
        }

        const title = tab.title?.replace(' - Claude', '').trim() || '未命名对话';
        setPlatform({ platform: 'claude', id: chatId, title });
        setStatus('ready');
        return;
      }

      // 匹配 aistudio.google.com/prompts/{promptId}
      const googleMatch = tab.url.match(/^https:\/\/aistudio\.google\.com\/prompts\/([a-zA-Z0-9_-]+)/);
      if (googleMatch) {
        const promptId = googleMatch[1];
        // 先用浏览器标题，然后异步获取真正的标题
        const tempTitle = tab.title?.replace(' - Google AI Studio', '').trim() || '未命名对话';
        setPlatform({ platform: 'google-ai-studio', id: promptId, title: tempTitle });
        setStatus('ready');

        // 异步获取真正的标题
        chrome.tabs
          .sendMessage(tab.id!, { action: 'fetchGoogleAIStudioChat', promptId })
          .then(response => {
            if (response?.success && response.data) {
              const root = response.data[0] as unknown[];
              const metadata = root?.[4] as unknown[];
              const realTitle = (metadata?.[0] as string) || tempTitle;
              if (realTitle !== tempTitle) {
                setPlatform({ platform: 'google-ai-studio', id: promptId, title: realTitle });
              }
            }
          })
          .catch(() => {
            // 忽略错误，保持临时标题
          });
        return;
      }

      setStatus('idle');
    } catch (err) {
      console.error('检测 AI 页面失败:', err);
      setStatus('idle');
    }
  }, []);

  // 初始化
  useEffect(() => {
    detectAIPage();

    // 加载保存的选项
    claudeExportStorage.getOptions().then(setOptions);

    // 监听标签页变化
    const handleTabUpdate = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.url || changeInfo.title) {
        detectAIPage();
      }
    };

    const handleTabActivated = () => {
      detectAIPage();
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    chrome.tabs.onActivated.addListener(handleTabActivated);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, [detectAIPage]);

  // 更新选项
  const updateOption = async (key: keyof ClaudeExportOptions, value: boolean) => {
    const newOptions = { ...options, [key]: value };
    setOptions(newOptions);
    await claudeExportStorage.updateOptions({ [key]: value });
  };

  // 获取聊天数据（统一格式）
  const fetchChatData = async (): Promise<UnifiedChatData | null> => {
    if (!platform) throw new Error('未检测到 AI 平台');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id || !tab.url) throw new Error('无法获取当前标签页');

    if (platform.platform === 'claude') {
      if (!orgId) throw new Error('缺少必要的 orgId');

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'fetchClaudeChat',
        chatId: platform.id,
        orgId,
      });

      if (!response.success) {
        throw new Error(response.error || '获取聊天数据失败');
      }

      return parseClaudeResponse(response.data, tab.url);
    }

    if (platform.platform === 'google-ai-studio') {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'fetchGoogleAIStudioChat',
        promptId: platform.id,
      });

      if (!response.success) {
        throw new Error(response.error || '获取聊天数据失败');
      }

      return parseGoogleAIStudioResponse(response.data, tab.url);
    }

    throw new Error('不支持的平台');
  };

  // 转换为 Markdown（统一格式）
  const convertToMarkdown = (data: UnifiedChatData): string => {
    const platformName = PLATFORM_NAMES[data.platform];

    let markdown = `---
title: ${data.title}
platform: ${platformName}
${data.model ? `model: ${data.model}\n` : ''}source: ${data.sourceUrl}
exported: ${data.exportedAt}
messages: ${data.messages.length}
---

`;

    for (const msg of data.messages) {
      const role = msg.role === 'human' ? 'Human' : 'Assistant';
      markdown += `## ${role}\n\n`;

      // 添加 thinking
      if (msg.thinking && options.includeThinking) {
        markdown += `<thinking>\n${msg.thinking}\n</thinking>\n\n`;
      }

      // 添加正文
      if (msg.text) {
        markdown += `${msg.text}\n\n`;
      }

      // 添加工具调用
      if (msg.toolCalls && options.includeToolCalls) {
        for (const tool of msg.toolCalls) {
          markdown += `**Tool Call: ${tool.name}**\n\`\`\`json\n${JSON.stringify(tool.input, null, 2)}\n\`\`\`\n\n`;
        }
      }

      // 添加工具结果
      if (msg.toolResults && options.includeToolCalls) {
        for (const result of msg.toolResults) {
          const truncated = result.length > 500 ? result.slice(0, 500) + '...(truncated)' : result;
          markdown += `**Tool Result:**\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
        }
      }
    }

    // 如果只要纯文本，去除代码块
    if (options.textOnly) {
      markdown = markdown.replace(/```[\s\S]*?```/g, '[代码块已省略]');
    }

    return markdown;
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 清理文件名
  const sanitizeFilename = (name: string): string => name.replace(/[/\\:*?"<>|]/g, '-').slice(0, 100);

  // 导出 Markdown
  const exportMarkdown = async () => {
    setStatus('exporting');
    setProgress(10);
    setError('');

    try {
      setProgress(30);
      const data = await fetchChatData();
      if (!data) throw new Error('无法获取聊天数据');

      setProgress(60);
      const markdown = convertToMarkdown(data);

      setProgress(80);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `${sanitizeFilename(data.title)}-${dateStr}.md`;

      // 下载文件
      await downloadFile(filename, markdown, 'text/markdown');

      setProgress(100);
      setExportResult({
        filename,
        messageCount: data.messages.length,
        fileSize: formatFileSize(new Blob([markdown]).size),
      });
      setStatus('success');
    } catch (err) {
      console.error('导出失败:', err);
      setError(err instanceof Error ? err.message : '导出失败');
      setStatus('error');
    }
  };

  // 导出 JSON
  const exportJSON = async () => {
    setStatus('exporting');
    setProgress(10);
    setError('');

    try {
      setProgress(30);
      const data = await fetchChatData();
      if (!data) throw new Error('无法获取聊天数据');

      setProgress(70);
      const jsonStr = JSON.stringify(data, null, 2);
      const prefix = platform?.platform === 'claude' ? 'claude-chat' : 'gemini-chat';
      const filename = `${prefix}-${platform?.id?.slice(0, 8)}.json`;

      await downloadFile(filename, jsonStr, 'application/json');

      setProgress(100);
      setExportResult({
        filename,
        messageCount: data.messages.length,
        fileSize: formatFileSize(new Blob([jsonStr]).size),
      });
      setStatus('success');
    } catch (err) {
      console.error('导出失败:', err);
      setError(err instanceof Error ? err.message : '导出失败');
      setStatus('error');
    }
  };

  // 下载文件
  const downloadFile = async (filename: string, content: string, mimeType: string) => {
    const settings = await downloadSettingsStorage.getSettings();
    const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;

    const downloadOptions: chrome.downloads.DownloadOptions = {
      url: dataUrl,
      filename: filename,
      saveAs: true,
    };

    // 只有在 Downloads 子目录时才设置路径
    if (settings.lastUsedPath) {
      downloadOptions.filename = `${settings.lastUsedPath}/${filename}`;
    }

    const downloadId = await chrome.downloads.download(downloadOptions);

    // 监听下载完成，复制路径到剪贴板
    return new Promise<void>((resolve, reject) => {
      let handled = false;

      const handleComplete = async () => {
        if (handled) return;
        handled = true;
        chrome.downloads.onChanged.removeListener(onChanged);

        chrome.downloads.search({ id: downloadId }, async results => {
          if (results.length > 0 && results[0].filename) {
            const path = results[0].filename;
            const formattedPath = path.includes(' ') ? `'${path}'` : path;
            navigator.clipboard.writeText(formattedPath).catch(console.error);

            // 更新最后使用的路径
            const pathParts = path.split(/[/\\]/);
            pathParts.pop();
            const separator = path.includes('\\') ? '\\' : '/';
            let directoryPath = pathParts.join(separator);
            if (!directoryPath && path.startsWith('/')) {
              directoryPath = '/';
            } else if (/^[A-Za-z]:$/.test(directoryPath)) {
              directoryPath = `${directoryPath}${separator}`;
            }
            // 计算相对于用户家目录的路径
            // 支持: macOS (/Users/xxx), Linux (/home/xxx), Windows (C:\Users\xxx)
            const homeDirMatch = directoryPath.match(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Z]:\\Users\\[^\\]+)/i);
            const homeDir = homeDirMatch ? homeDirMatch[0] : '';

            // 计算相对于家目录的路径，这样无论浏览器默认下载位置是 ~ 还是 ~/Downloads 都能工作
            let relativePath = '';
            if (homeDir && directoryPath.startsWith(homeDir)) {
              const pathFromHome = directoryPath.slice(homeDir.length + 1);
              // 如果路径包含 Downloads，从 Downloads 开始（兼容大多数场景）
              const downloadsIndex = pathParts.findIndex(part => part.toLowerCase() === 'downloads');
              if (downloadsIndex !== -1 && downloadsIndex < pathParts.length) {
                // 包含 Downloads 及其后的所有子目录
                relativePath = pathParts.slice(downloadsIndex).join('/');
              } else {
                // 不包含 Downloads，使用完整的相对路径（如 Documents/work）
                relativePath = pathFromHome;
              }
            }
            await downloadSettingsStorage.updateSettings({
              lastUsedPath: relativePath,
              lastUsedAbsolutePath: directoryPath,
            });
          }
          resolve();
        });
      };

      const handleInterrupted = () => {
        if (handled) return;
        handled = true;
        chrome.downloads.onChanged.removeListener(onChanged);
        reject(new Error('下载被中断'));
      };

      const onChanged = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id === downloadId) {
          if (delta.state?.current === 'complete') {
            handleComplete();
          } else if (delta.state?.current === 'interrupted') {
            handleInterrupted();
          }
        }
      };

      chrome.downloads.onChanged.addListener(onChanged);

      // 立即检查下载状态，处理 data URL 瞬间完成的情况（竞态条件修复）
      chrome.downloads.search({ id: downloadId }, results => {
        if (results.length > 0) {
          const state = results[0].state;
          if (state === 'complete') {
            handleComplete();
          } else if (state === 'interrupted') {
            handleInterrupted();
          }
        }
      });
    });
  };

  // 重置状态
  const reset = () => {
    setStatus('ready');
    setExportResult(null);
    setProgress(0);
    setError('');
  };

  // Toggle 组件
  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-foreground text-sm">{label}</span>
      <button
        onClick={onChange}
        className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-input')}>
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </div>
  );

  // 非 AI 页面时显示提示
  if (status === 'idle') {
    return (
      <div className="bg-muted/50 rounded-xl p-3">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <LightningBoltIcon className="h-4 w-4" />
          <span>访问 claude.ai 或 aistudio.google.com 可导出聊天记录</span>
        </div>
      </div>
    );
  }

  // 检测中
  if (status === 'detecting') {
    return (
      <div className="border-border bg-card rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          <span className="text-foreground text-sm">检测 AI 页面...</span>
        </div>
      </div>
    );
  }

  const platformName = platform ? PLATFORM_NAMES[platform.platform] : 'AI';

  return (
    <div className="border-border bg-card rounded-xl border p-4">
      {/* 标题 */}
      <div className="mb-3 flex items-center gap-2">
        <RocketIcon className="text-primary h-5 w-5" />
        <h3 className="text-foreground font-medium">{platformName} 对话</h3>
      </div>

      {/* 就绪状态 */}
      {status === 'ready' && (
        <>
          <div className="bg-muted mb-3 rounded-lg p-2">
            <div className="text-foreground flex items-center gap-2 text-sm">
              <CheckIcon className="h-4 w-4 text-green-600" />
              <span className="truncate">{platform?.title || '已检测到对话'}</span>
            </div>
          </div>

          {/* 导出按钮 */}
          <div className="mb-3 flex gap-2">
            <button
              onClick={exportMarkdown}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium">
              <DownloadIcon className="h-4 w-4" />
              <span>Markdown</span>
            </button>
            <button
              onClick={exportJSON}
              className="border-border bg-card text-foreground hover:bg-accent flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium">
              <ClipboardCopyIcon className="h-4 w-4" />
              <span>JSON</span>
            </button>
          </div>

          {/* 导出选项 */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between text-sm">
            <span>导出选项</span>
            <ChevronDownIcon className={cn('h-4 w-4 transition-transform', showOptions && 'rotate-180')} />
          </button>

          {showOptions && (
            <div className="border-border mt-2 space-y-1 border-t pt-2">
              <Toggle
                checked={options.includeThinking}
                onChange={() => updateOption('includeThinking', !options.includeThinking)}
                label="包含思考过程"
              />
              <Toggle
                checked={options.includeToolCalls}
                onChange={() => updateOption('includeToolCalls', !options.includeToolCalls)}
                label="包含工具调用"
              />
              <Toggle
                checked={options.textOnly}
                onChange={() => updateOption('textOnly', !options.textOnly)}
                label="仅导出文本"
              />
            </div>
          )}
        </>
      )}

      {/* 导出中 */}
      {status === 'exporting' && (
        <div className="space-y-2">
          <div className="text-foreground flex items-center gap-2 text-sm">
            <div className="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
            <span>正在导出...</span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* 导出成功 */}
      {status === 'success' && exportResult && (
        <div className="space-y-3">
          <div className="text-foreground flex items-center gap-2 text-sm">
            <CheckCircledIcon className="h-4 w-4 text-green-600" />
            <span>导出成功!</span>
          </div>

          <div className="bg-muted rounded-lg p-3">
            <div className="text-foreground mb-1 flex items-center gap-1.5 truncate text-sm font-medium">
              <FileTextIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{exportResult.filename}</span>
            </div>
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <ChatBubbleIcon className="h-3 w-3" />
              <span>
                {exportResult.messageCount} 条消息 · {exportResult.fileSize}
              </span>
            </div>
          </div>

          <div className="text-muted-foreground text-xs">路径已复制到剪贴板</div>

          <button
            onClick={reset}
            className="border-border text-foreground hover:bg-accent w-full rounded-lg border py-2 text-sm">
            再次导出
          </button>
        </div>
      )}

      {/* 错误状态 */}
      {status === 'error' && (
        <div className="space-y-3">
          <div className="text-destructive flex items-center gap-2 text-sm">
            <CrossCircledIcon className="h-4 w-4" />
            <span>{error}</span>
          </div>

          {platform?.platform === 'claude' && !orgId && (
            <div className="bg-muted rounded-lg p-3 text-xs">
              <p className="text-foreground mb-1 font-medium">提示：</p>
              <p className="text-muted-foreground">请确保已登录 Claude，并刷新页面后重试。</p>
            </div>
          )}
          {platform?.platform === 'google-ai-studio' && (
            <div className="bg-muted rounded-lg p-3 text-xs">
              <p className="text-foreground mb-1 font-medium">提示：</p>
              <p className="text-muted-foreground">请确保已登录 Google AI Studio，并刷新页面后重试。</p>
            </div>
          )}

          <button
            onClick={reset}
            className="border-border text-foreground hover:bg-accent w-full rounded-lg border py-2 text-sm">
            重试
          </button>
        </div>
      )}
    </div>
  );
};
