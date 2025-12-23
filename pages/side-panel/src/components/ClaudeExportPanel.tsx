import { claudeExportStorage, downloadSettingsStorage } from '@extension/storage';
import { cn } from '@extension/ui';
import { useState, useEffect, useCallback } from 'react';
import type { ClaudeExportOptions } from '@extension/storage';

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

type ExportStatus = 'idle' | 'detecting' | 'ready' | 'exporting' | 'success' | 'error';

interface ExportResult {
  filename: string;
  messageCount: number;
  fileSize: string;
}

export const ClaudeExportPanel = () => {
  const [status, setStatus] = useState<ExportStatus>('detecting');
  const [chatId, setChatId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState<ClaudeExportOptions>({
    includeThinking: true,
    includeToolCalls: true,
    textOnly: false,
  });
  const [progress, setProgress] = useState(0);

  // 检测当前页面是否是 Claude 聊天页面
  const detectClaudePage = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url) {
        setStatus('idle');
        return;
      }

      // 匹配 claude.ai/chat/{chatId}
      const match = tab.url.match(/^https:\/\/claude\.ai\/chat\/([a-f0-9-]+)/);
      if (!match) {
        setStatus('idle');
        return;
      }

      const detectedChatId = match[1];
      setChatId(detectedChatId);

      // 尝试从页面获取 orgId（单独 try-catch，失败不影响整体检测）
      try {
        const response = await chrome.tabs.sendMessage(tab.id!, { action: 'getClaudeOrgId' });
        if (response?.orgId) {
          setOrgId(response.orgId);
          await claudeExportStorage.setLastOrgId(response.orgId);
        } else {
          // 尝试使用缓存的 orgId
          const cachedOrgId = await claudeExportStorage.getLastOrgId();
          if (cachedOrgId) {
            setOrgId(cachedOrgId);
          }
        }
      } catch {
        // content script 可能未准备好，尝试使用缓存的 orgId
        const cachedOrgId = await claudeExportStorage.getLastOrgId();
        if (cachedOrgId) {
          setOrgId(cachedOrgId);
        }
      }

      // 获取页面标题
      setChatTitle(tab.title?.replace(' - Claude', '').trim() || '未命名对话');
      setStatus('ready');
    } catch (err) {
      console.error('检测 Claude 页面失败:', err);
      setStatus('idle');
    }
  }, []);

  // 初始化
  useEffect(() => {
    detectClaudePage();

    // 加载保存的选项
    claudeExportStorage.getOptions().then(setOptions);

    // 监听标签页变化
    const handleTabUpdate = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.url || changeInfo.title) {
        detectClaudePage();
      }
    };

    const handleTabActivated = () => {
      detectClaudePage();
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    chrome.tabs.onActivated.addListener(handleTabActivated);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, [detectClaudePage]);

  // 更新选项
  const updateOption = async (key: keyof ClaudeExportOptions, value: boolean) => {
    const newOptions = { ...options, [key]: value };
    setOptions(newOptions);
    await claudeExportStorage.updateOptions({ [key]: value });
  };

  // 获取聊天数据
  const fetchChatData = async (): Promise<ClaudeChatResponse | null> => {
    if (!chatId || !orgId) {
      throw new Error('缺少必要的 chatId 或 orgId');
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error('无法获取当前标签页');

    // 在页面上下文中执行 fetch（自动携带 cookies）
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'fetchClaudeChat',
      chatId,
      orgId,
    });

    if (!response.success) {
      throw new Error(response.error || '获取聊天数据失败');
    }

    return response.data;
  };

  // 转换为 Markdown
  const convertToMarkdown = (data: ClaudeChatResponse): string => {
    const date = new Date().toISOString();
    const title = data.name || chatTitle || '未命名对话';

    let markdown = `---
title: ${title}
source: https://claude.ai/chat/${data.uuid}
exported: ${date}
messages: ${data.chat_messages?.length || 0}
---

`;

    if (!data.chat_messages) return markdown;

    for (const msg of data.chat_messages) {
      const role = msg.sender === 'human' ? 'Human' : 'Assistant';
      markdown += `## ${role}\n\n`;

      if (msg.content && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            markdown += `${block.text}\n\n`;
          } else if (block.type === 'thinking' && block.thinking && options.includeThinking) {
            markdown += `<thinking>\n${block.thinking}\n</thinking>\n\n`;
          } else if (block.type === 'tool_use' && block.tool_use && options.includeToolCalls) {
            markdown += `**Tool Call: ${block.tool_use.name}**\n\`\`\`json\n${JSON.stringify(block.tool_use.input, null, 2)}\n\`\`\`\n\n`;
          } else if (block.type === 'tool_result' && block.tool_result && options.includeToolCalls) {
            const content = block.tool_result.content;
            const truncated = content.length > 500 ? content.slice(0, 500) + '...(truncated)' : content;
            markdown += `**Tool Result:**\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
          }
        }
      } else if (msg.text) {
        markdown += `${msg.text}\n\n`;
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
      const title = data.name || chatTitle || 'claude-chat';
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `${sanitizeFilename(title)}-${dateStr}.md`;

      // 下载文件
      await downloadFile(filename, markdown, 'text/markdown');

      setProgress(100);
      setExportResult({
        filename,
        messageCount: data.chat_messages?.length || 0,
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
      const filename = `claude-chat-${chatId?.slice(0, 8)}.json`;

      await downloadFile(filename, jsonStr, 'application/json');

      setProgress(100);
      setExportResult({
        filename,
        messageCount: data.chat_messages?.length || 0,
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
    // __CHROME_DEFAULT__ 或空字符串表示让 Chrome 使用它自己记住的位置
    if (settings.lastUsedPath && settings.lastUsedPath !== '__CHROME_DEFAULT__') {
      downloadOptions.filename = `${settings.lastUsedPath}/${filename}`;
    }

    const downloadId = await chrome.downloads.download(downloadOptions);

    // 监听下载完成，复制路径到剪贴板
    return new Promise<void>((resolve, reject) => {
      const onChanged = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id === downloadId) {
          if (delta.state?.current === 'complete') {
            chrome.downloads.search({ id: downloadId }, results => {
              if (results.length > 0 && results[0].filename) {
                const path = results[0].filename;
                const formattedPath = path.includes(' ') ? `'${path}'` : path;
                navigator.clipboard.writeText(formattedPath).catch(console.error);

                // 更新最后使用的路径
                const pathParts = path.split(/[/\\]/);
                pathParts.pop();
                const downloadsIndex = pathParts.findIndex(
                  part => part.toLowerCase() === 'downloads' || part === '下载',
                );
                if (downloadsIndex !== -1) {
                  // 在 Downloads 目录下：提取相对路径（根目录则为空字符串）
                  const relativePath =
                    downloadsIndex < pathParts.length - 1 ? pathParts.slice(downloadsIndex + 1).join('/') : '';
                  downloadSettingsStorage.setLastUsedPath(relativePath);
                } else {
                  // 在 Downloads 之外：用特殊标记，让 Chrome 使用它记住的位置
                  downloadSettingsStorage.setLastUsedPath('__CHROME_DEFAULT__');
                }
              }
              chrome.downloads.onChanged.removeListener(onChanged);
              resolve();
            });
          } else if (delta.state?.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(onChanged);
            reject(new Error('下载被中断'));
          }
        }
      };
      chrome.downloads.onChanged.addListener(onChanged);
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

  // 非 Claude 页面时显示提示
  if (status === 'idle') {
    return (
      <div className="bg-muted/50 rounded-xl p-3">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>💡</span>
          <span>访问 claude.ai 可导出聊天记录</span>
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
          <span className="text-foreground text-sm">检测 Claude 页面...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border bg-card rounded-xl border p-4">
      {/* 标题 */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">🤖</span>
        <h3 className="text-foreground font-medium">Claude 对话</h3>
      </div>

      {/* 就绪状态 */}
      {status === 'ready' && (
        <>
          <div className="bg-muted mb-3 rounded-lg p-2">
            <div className="text-foreground flex items-center gap-2 text-sm">
              <span className="text-green-600">✓</span>
              <span className="truncate">{chatTitle || '已检测到对话'}</span>
            </div>
          </div>

          {/* 导出按钮 */}
          <div className="mb-3 flex gap-2">
            <button
              onClick={exportMarkdown}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium">
              <span>📥</span>
              <span>Markdown</span>
            </button>
            <button
              onClick={exportJSON}
              className="border-border bg-card text-foreground hover:bg-accent flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium">
              <span>📋</span>
              <span>JSON</span>
            </button>
          </div>

          {/* 导出选项 */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between text-sm">
            <span>导出选项</span>
            <span className={cn('transition-transform', showOptions && 'rotate-180')}>▾</span>
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
            <span className="text-green-600">✅</span>
            <span>导出成功!</span>
          </div>

          <div className="bg-muted rounded-lg p-3">
            <div className="text-foreground mb-1 truncate text-sm font-medium">📄 {exportResult.filename}</div>
            <div className="text-muted-foreground text-xs">
              💬 {exportResult.messageCount} 条消息 · {exportResult.fileSize}
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
            <span>❌</span>
            <span>{error}</span>
          </div>

          {!orgId && (
            <div className="bg-muted rounded-lg p-3 text-xs">
              <p className="text-foreground mb-1 font-medium">提示：</p>
              <p className="text-muted-foreground">请确保已登录 Claude，并刷新页面后重试。</p>
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
