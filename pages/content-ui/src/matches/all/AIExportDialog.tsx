import { claudeExportStorage, downloadSettingsStorage } from '@extension/storage';
import { useState, useEffect, useCallback } from 'react';
import type { ClaudeExportOptions } from '@extension/storage';

// 平台信息
interface PlatformInfo {
  platform: 'claude' | 'google-ai-studio';
  id: string;
  name: string;
}

// 统一的消息格式
interface UnifiedMessage {
  role: 'human' | 'assistant';
  text: string;
  thinking?: string;
  toolCalls?: Array<{ name: string; input: unknown }>;
  toolResults?: string[];
}

interface UnifiedChatData {
  platform: string;
  id: string;
  title: string;
  model?: string;
  messages: UnifiedMessage[];
  sourceUrl: string;
  exportedAt: string;
}

type ExportStatus = 'idle' | 'exporting' | 'success' | 'error';

// 平台名称映射
const PLATFORM_NAMES: Record<string, string> = {
  claude: 'Claude',
  'google-ai-studio': 'Google AI Studio',
};

export const AIExportDialog = () => {
  const [open, setOpen] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [error, setError] = useState('');
  const [options, setOptions] = useState<ClaudeExportOptions>({
    includeThinking: true,
    includeToolCalls: true,
    textOnly: false,
  });

  // 监听来自悬浮按钮的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'lovsider-open-export-dialog' && event.data?.platformInfo) {
        setPlatformInfo(event.data.platformInfo);
        setOpen(true);
        setStatus('idle');
        setError('');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 加载选项
  useEffect(() => {
    if (open) {
      claudeExportStorage.getOptions().then(setOptions);
    }
  }, [open]);

  // 更新选项
  const updateOption = async (key: keyof ClaudeExportOptions, value: boolean) => {
    const newOptions = { ...options, [key]: value };
    setOptions(newOptions);
    await claudeExportStorage.updateOptions({ [key]: value });
  };

  // 关闭对话框
  const closeDialog = () => {
    setOpen(false);
  };

  // 获取聊天数据
  const fetchChatData = useCallback(async (): Promise<UnifiedChatData | null> => {
    if (!platformInfo) throw new Error('未检测到 AI 平台');

    if (platformInfo.platform === 'claude') {
      // 获取 orgId
      let orgId: string | null = (await claudeExportStorage.getLastOrgId()) ?? null;
      if (!orgId) {
        // 尝试从页面获取
        orgId = await getClaudeOrgIdFromPage();
        if (orgId) {
          await claudeExportStorage.setLastOrgId(orgId);
        }
      }
      if (!orgId) throw new Error('缺少 orgId，请刷新页面重试');

      const response = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${platformInfo.id}?tree=True&rendering_mode=messages&render_all_tools=true`,
        { credentials: 'include', headers: { Accept: 'application/json' } },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return parseClaudeResponse(data, window.location.href);
    }

    if (platformInfo.platform === 'google-ai-studio') {
      const sapisid = getCookie('SAPISID') || getCookie('__Secure-3PAPISID');
      if (!sapisid) throw new Error('未登录 Google');

      const origin = 'https://aistudio.google.com';
      const authHeader = await generateSapisidHash(sapisid, origin);

      const response = await fetch(
        'https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/ResolveDriveResource',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json+protobuf',
            Authorization: `SAPISIDHASH ${authHeader}`,
            'x-goog-api-key': 'AIzaSyDdP816MREB3SkjZO04QXbjsigfcI0GWOs',
            'x-user-agent': 'grpc-web-javascript/0.1',
            Origin: origin,
          },
          body: JSON.stringify([platformInfo.id]),
        },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return parseGoogleAIStudioResponse(data, window.location.href);
    }

    throw new Error('不支持的平台');
  }, [platformInfo]);

  // 解析 Claude 响应
  const parseClaudeResponse = (data: any, url: string): UnifiedChatData => {
    const messages: UnifiedMessage[] = [];

    for (const msg of data.chat_messages || []) {
      const unifiedMsg: UnifiedMessage = { role: msg.sender, text: '' };

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
  };

  // 解析 Google AI Studio 响应
  const parseGoogleAIStudioResponse = (data: any, url: string): UnifiedChatData => {
    const root = data[0] as any[];
    const promptId = (root[0] as string) || '';
    const config = root[3] as any[];
    const metadata = root[4] as any[];

    const model = config?.[2] as string | undefined;
    const title = (metadata?.[0] as string) || '未命名对话';

    const messages: UnifiedMessage[] = [];
    const conversations = (root[13] as any[][]) || (root[11] as any[][]) || [];

    for (const turn of conversations) {
      if (!Array.isArray(turn)) continue;

      for (const msg of turn) {
        if (!Array.isArray(msg)) continue;

        const text = (msg[0] as string) || '';
        const role = msg[8] as string;

        if (!role || (role !== 'user' && role !== 'model')) continue;

        const unifiedRole = role === 'user' ? 'human' : 'assistant';

        let thinking: string | undefined;
        const thinkingBlocks = msg[29] as any[] | undefined;
        if (Array.isArray(thinkingBlocks)) {
          const thinkingTexts = thinkingBlocks.filter(b => Array.isArray(b) && b[1]).map(b => b[1] as string);
          if (thinkingTexts.length > 0) {
            thinking = thinkingTexts.join('\n\n');
          }
        }

        if (!text && !thinking) continue;

        messages.push({ role: unifiedRole, text, thinking });
      }
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
  };

  // 转换为 Markdown
  const convertToMarkdown = (data: UnifiedChatData): string => {
    const platformName = PLATFORM_NAMES[data.platform] || data.platform;

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

      if (msg.thinking && options.includeThinking) {
        markdown += `<thinking>\n${msg.thinking}\n</thinking>\n\n`;
      }

      if (msg.text) {
        markdown += `${msg.text}\n\n`;
      }

      if (msg.toolCalls && options.includeToolCalls) {
        for (const tool of msg.toolCalls) {
          markdown += `**Tool Call: ${tool.name}**\n\`\`\`json\n${JSON.stringify(tool.input, null, 2)}\n\`\`\`\n\n`;
        }
      }

      if (msg.toolResults && options.includeToolCalls) {
        for (const result of msg.toolResults) {
          const truncated = result.length > 500 ? result.slice(0, 500) + '...(truncated)' : result;
          markdown += `**Tool Result:**\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
        }
      }
    }

    if (options.textOnly) {
      markdown = markdown.replace(/```[\s\S]*?```/g, '[代码块已省略]');
    }

    return markdown;
  };

  // 清理文件名
  const sanitizeFilename = (name: string): string => name.replace(/[/\\:*?"<>|]/g, '-').slice(0, 100);

  // 下载文件
  const downloadFile = async (filename: string, content: string, mimeType: string) => {
    const settings = await downloadSettingsStorage.getSettings();
    const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;

    const downloadOptions: chrome.downloads.DownloadOptions = {
      url: dataUrl,
      filename: filename,
      saveAs: true,
    };

    if (settings.lastUsedPath) {
      downloadOptions.filename = `${settings.lastUsedPath}/${filename}`;
    }

    await chrome.downloads.download(downloadOptions);
  };

  // 导出处理
  const handleExport = async (format: 'markdown' | 'json') => {
    setStatus('exporting');
    setError('');

    try {
      const data = await fetchChatData();
      if (!data) throw new Error('无法获取聊天数据');

      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'markdown') {
        const markdown = convertToMarkdown(data);
        const filename = `${sanitizeFilename(data.title)}-${dateStr}.md`;
        await downloadFile(filename, markdown, 'text/markdown');
      } else {
        const jsonStr = JSON.stringify(data, null, 2);
        const filename = `${sanitizeFilename(data.title)}-${dateStr}.json`;
        await downloadFile(filename, jsonStr, 'application/json');
      }

      setStatus('success');
      setTimeout(() => closeDialog(), 1500);
    } catch (err) {
      console.error('导出失败:', err);
      setError(err instanceof Error ? err.message : '导出失败');
      setStatus('error');
    }
  };

  const platformName = platformInfo ? PLATFORM_NAMES[platformInfo.platform] : 'AI';

  if (!open) return null;

  return (
    <>
      {/* Overlay - 使用内联样式确保在任何环境下都能正确显示 */}
      <div
        role="button"
        tabIndex={0}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999999,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          transition: 'opacity 0.2s',
        }}
        onClick={closeDialog}
        onKeyDown={e => e.key === 'Escape' && closeDialog()}
      />

      {/* Dialog - 使用内联样式 */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999999,
          width: '400px',
          maxWidth: '90vw',
          borderRadius: '16px',
          border: '1px solid #D5D3CB',
          backgroundColor: '#F9F9F7',
          padding: 0,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}>
        {/* Close button */}
        <button
          onClick={closeDialog}
          style={{
            position: 'absolute',
            right: '16px',
            top: '16px',
            padding: '6px',
            borderRadius: '8px',
            border: 'none',
            background: 'transparent',
            color: '#666',
            cursor: 'pointer',
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ borderBottom: '1px solid #D5D3CB', padding: '20px 24px 16px' }}>
          <h2
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '18px',
              fontWeight: 600,
              color: '#181818',
              margin: 0,
            }}>
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#CC785C',
              }}
            />
            导出 {platformName} 对话
          </h2>
          <p style={{ marginTop: '4px', fontSize: '14px', color: '#666', margin: '4px 0 0' }}>选择导出格式和选项</p>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={options.includeThinking}
                onChange={() => updateOption('includeThinking', !options.includeThinking)}
                style={{ width: '16px', height: '16px', accentColor: '#CC785C', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', color: '#181818' }}>包含思考过程 (thinking)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={options.includeToolCalls}
                onChange={() => updateOption('includeToolCalls', !options.includeToolCalls)}
                style={{ width: '16px', height: '16px', accentColor: '#CC785C', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', color: '#181818' }}>包含工具调用 (tool calls)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={options.textOnly}
                onChange={() => updateOption('textOnly', !options.textOnly)}
                style={{ width: '16px', height: '16px', accentColor: '#CC785C', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', color: '#181818' }}>仅文本 (省略代码块)</span>
            </label>
          </div>

          {/* Status */}
          {status === 'exporting' && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '12px',
                backgroundColor: '#f0f0f0',
                fontSize: '14px',
                color: '#666',
              }}>
              正在导出...
            </div>
          )}

          {status === 'success' && (
            <div
              style={{
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px',
                borderRadius: '12px',
                backgroundColor: '#f0fdf4',
                fontSize: '14px',
                color: '#15803d',
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              导出成功
            </div>
          )}

          {status === 'error' && (
            <div
              style={{
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px',
                borderRadius: '12px',
                backgroundColor: '#fef2f2',
                fontSize: '14px',
                color: '#b91c1c',
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #D5D3CB',
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}>
          <button
            onClick={() => handleExport('json')}
            disabled={status === 'exporting'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '12px',
              border: '1px solid #D5D3CB',
              backgroundColor: '#f0f0f0',
              color: '#181818',
              fontSize: '14px',
              fontWeight: 500,
              cursor: status === 'exporting' ? 'not-allowed' : 'pointer',
              opacity: status === 'exporting' ? 0.5 : 1,
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            JSON
          </button>
          <button
            onClick={() => handleExport('markdown')}
            disabled={status === 'exporting'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: '#CC785C',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: status === 'exporting' ? 'not-allowed' : 'pointer',
              opacity: status === 'exporting' ? 0.5 : 1,
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Markdown
          </button>
        </div>
      </div>
    </>
  );
};

// 辅助函数
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

async function generateSapisidHash(sapisid: string, origin: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const input = `${timestamp} ${sapisid} ${origin}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${timestamp}_${hashHex}`;
}

async function getClaudeOrgIdFromPage(): Promise<string | null> {
  // 从 localStorage 获取
  const lsKeys = Object.keys(localStorage);
  for (const key of lsKeys) {
    if (key.includes('organization') || key.includes('org')) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          const parsed = JSON.parse(value);
          if (parsed.uuid || parsed.id || parsed.organizationId) {
            return parsed.uuid || parsed.id || parsed.organizationId;
          }
        }
      } catch {
        // 忽略
      }
    }
  }

  // 从 __NEXT_DATA__ 获取
  const nextDataEl = document.getElementById('__NEXT_DATA__');
  if (nextDataEl) {
    try {
      const nextData = JSON.parse(nextDataEl.textContent || '{}');
      const orgId =
        nextData?.props?.pageProps?.organizationId ||
        nextData?.props?.pageProps?.org?.uuid ||
        nextData?.props?.initialState?.organization?.uuid;
      if (orgId) return orgId;
    } catch {
      // 忽略
    }
  }

  // 从 performance entries 获取
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  for (const entry of entries) {
    const match = entry.name.match(/\/organizations\/([a-f0-9-]+)\//);
    if (match) {
      return match[1];
    }
  }

  return null;
}
