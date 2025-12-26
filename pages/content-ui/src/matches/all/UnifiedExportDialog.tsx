import { claudeExportStorage } from '@extension/storage';
import { useState, useEffect, useMemo, useCallback } from 'react';
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

interface MarkdownData {
  markdown: string;
  presetName?: string;
}

interface ParsedMarkdown {
  frontmatter: { title?: string; source?: string; [key: string]: string | undefined };
  content: string;
}

type FetchStatus = 'idle' | 'fetching' | 'success' | 'error';
type TabType = 'ai' | 'clipboard';

// 平台名称映射
const PLATFORM_NAMES: Record<string, string> = {
  claude: 'Claude',
  'google-ai-studio': 'Google AI Studio',
};

// 解析 frontmatter
function parseFrontmatter(markdown: string): ParsedMarkdown {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return { frontmatter: {}, content: markdown };
  }

  const frontmatterStr = frontmatterMatch[1];
  const content = frontmatterMatch[2];
  const frontmatter: ParsedMarkdown['frontmatter'] = {};

  for (const line of frontmatterStr.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content };
}

// 生成 markdown
function generateMarkdown(parsed: ParsedMarkdown): string {
  const frontmatterLines = Object.entries(parsed.frontmatter)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`);

  if (frontmatterLines.length === 0) {
    return parsed.content;
  }

  return `---\n${frontmatterLines.join('\n')}\n---\n${parsed.content}`;
}

// 提取标题
function extractTitleFromMarkdown(markdown: string): string {
  const parsed = parseFrontmatter(markdown);
  if (parsed.frontmatter.title) return parsed.frontmatter.title;

  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1];

  const firstLine = markdown.split('\n').find(line => line.trim());
  return firstLine?.slice(0, 50) || 'export';
}

export const UnifiedExportDialog = () => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('clipboard');
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);

  // AI 获取状态
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle');
  const [fetchError, setFetchError] = useState('');
  const [aiOptions, setAiOptions] = useState<ClaudeExportOptions>({
    includeThinking: true,
    includeToolCalls: true,
    textOnly: false,
  });
  const [chatData, setChatData] = useState<UnifiedChatData | null>(null); // 保存原始数据

  // 公共编辑状态
  const [markdownData, setMarkdownData] = useState<MarkdownData | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloadedFilename, setDownloadedFilename] = useState('');
  const [thinkingCache, setThinkingCache] = useState<Map<number, string>>(new Map());

  const parsed = useMemo(() => parseFrontmatter(markdown), [markdown]);

  // 缓存 key 生成
  const getCacheKey = (pInfo: PlatformInfo) => `lovsider-chat-cache-${pInfo.platform}-${pInfo.id}`;

  // 从缓存加载对话数据
  const loadCachedChatData = (pInfo: PlatformInfo): UnifiedChatData | null => {
    try {
      const cached = localStorage.getItem(getCacheKey(pInfo));
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // 忽略
    }
    return null;
  };

  // 保存对话数据到缓存
  const saveChatDataToCache = (pInfo: PlatformInfo, data: UnifiedChatData) => {
    try {
      localStorage.setItem(getCacheKey(pInfo), JSON.stringify(data));
    } catch {
      // 忽略
    }
  };

  // 监听消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'lovsider-open-unified-export') {
        const { platformInfo: pInfo, markdownData: mData } = event.data;

        setPlatformInfo(pInfo || null);

        // 设置初始数据
        if (mData) {
          setMarkdownData(mData);
          setMarkdown(mData.markdown || '');
        }

        // 智能选择默认 Tab
        if (pInfo) {
          setActiveTab('ai');
          // 尝试从缓存加载对话数据
          const cached = loadCachedChatData(pInfo);
          if (cached) {
            setChatData(cached);
            setFetchStatus('success');
          } else {
            setChatData(null);
            setFetchStatus('idle');
          }
        } else {
          setActiveTab('clipboard');
          setChatData(null);
          setFetchStatus('idle');
        }

        setOpen(true);
        setFetchError('');
        setCopied(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 加载 AI 导出选项
  useEffect(() => {
    if (open) {
      claudeExportStorage.getOptions().then(setAiOptions);
    }
  }, [open]);

  // 更新 AI 选项
  const updateAiOption = async (key: keyof ClaudeExportOptions, value: boolean) => {
    const newOptions = { ...aiOptions, [key]: value };
    setAiOptions(newOptions);
    await claudeExportStorage.updateOptions({ [key]: value });
  };

  // 关闭对话框
  const closeDialog = () => {
    setOpen(false);
  };

  // ========== AI 数据获取 ==========

  // 获取聊天数据
  const fetchChatData = useCallback(async (): Promise<UnifiedChatData | null> => {
    if (!platformInfo) throw new Error('未检测到 AI 平台');

    if (platformInfo.platform === 'claude') {
      let orgId: string | null = (await claudeExportStorage.getLastOrgId()) ?? null;
      if (!orgId) {
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

  // 转换为 Markdown（使用当前 aiOptions）
  const convertToMarkdown = useCallback(
    (data: UnifiedChatData): string => {
      const platformName = PLATFORM_NAMES[data.platform] || data.platform;

      let md = `---
title: ${data.title}
platform: ${platformName}
${data.model ? `model: ${data.model}\n` : ''}source: ${data.sourceUrl}
exported: ${data.exportedAt}
messages: ${data.messages.length}
---

`;

      for (const msg of data.messages) {
        const role = msg.role === 'human' ? 'Human' : 'Assistant';
        md += `## ${role}\n\n`;

        if (msg.thinking && aiOptions.includeThinking) {
          md += `<thinking>\n${msg.thinking}\n</thinking>\n\n`;
        }

        if (msg.text) {
          md += `${msg.text}\n\n`;
        }

        if (msg.toolCalls && aiOptions.includeToolCalls) {
          for (const tool of msg.toolCalls) {
            md += `**Tool Call: ${tool.name}**\n\`\`\`json\n${JSON.stringify(tool.input, null, 2)}\n\`\`\`\n\n`;
          }
        }

        if (msg.toolResults && aiOptions.includeToolCalls) {
          for (const result of msg.toolResults) {
            const truncated = result.length > 500 ? result.slice(0, 500) + '...(truncated)' : result;
            md += `**Tool Result:**\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
          }
        }
      }

      if (aiOptions.textOnly) {
        md = md.replace(/```[\s\S]*?```/g, '[代码块已省略]');
      }

      return md;
    },
    [aiOptions],
  );

  // 当 chatData 变化时，生成初始 markdown
  useEffect(() => {
    if (chatData) {
      const md = convertToMarkdown(chatData);
      setMarkdown(md);
    }
  }, [chatData, convertToMarkdown]);

  // 当 includeThinking 变化时，实时 toggle <thinking> 标签
  useEffect(() => {
    if (!markdown) return;

    if (!aiOptions.includeThinking) {
      // 移除 <thinking>...</thinking> 标签，缓存内容以便恢复
      const thinkingRegex = /<thinking>\n?([\s\S]*?)\n?<\/thinking>\n*/g;
      const cache = new Map<number, string>();
      let index = 0;
      let newMarkdown = markdown;
      let match;

      // 先收集所有 thinking 内容
      while ((match = thinkingRegex.exec(markdown)) !== null) {
        cache.set(index++, match[0]);
      }

      if (cache.size > 0) {
        setThinkingCache(cache);
        newMarkdown = markdown.replace(thinkingRegex, '');
        setMarkdown(newMarkdown);
      }
    } else if (thinkingCache.size > 0 && chatData) {
      // 恢复时从 chatData 重新生成
      const md = convertToMarkdown(chatData);
      setMarkdown(md);
      setThinkingCache(new Map());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOptions.includeThinking]);

  // 当 includeToolCalls 或 textOnly 变化时，从 chatData 重新生成
  useEffect(() => {
    if (chatData) {
      const md = convertToMarkdown(chatData);
      setMarkdown(md);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOptions.includeToolCalls, aiOptions.textOnly]);

  // 获取 AI 对话并填充到编辑区
  const handleFetchAiData = async () => {
    setFetchStatus('fetching');
    setFetchError('');

    try {
      const data = await fetchChatData();
      if (!data) throw new Error('无法获取聊天数据');

      setChatData(data); // 保存原始数据，useEffect 会自动更新 markdown
      // 缓存到 localStorage
      if (platformInfo) {
        saveChatDataToCache(platformInfo, data);
      }
      setFetchStatus('success');
    } catch (err) {
      console.error('获取失败:', err);
      setFetchError(err instanceof Error ? err.message : '获取失败');
      setFetchStatus('error');
    }
  };

  // ========== 公共编辑操作 ==========

  // 更新 frontmatter 字段
  const updateFrontmatterField = (key: string, value: string) => {
    const newParsed = {
      ...parsed,
      frontmatter: { ...parsed.frontmatter, [key]: value },
    };
    setMarkdown(generateMarkdown(newParsed));
  };

  // 更新正文
  const updateContent = (content: string) => {
    setMarkdown(generateMarkdown({ ...parsed, content }));
  };

  // 复制到剪贴板
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 下载 markdown
  const downloadMarkdown = async () => {
    const title = extractTitleFromMarkdown(markdown);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${title.replace(/[/\\:*?"<>|]/g, '-').slice(0, 50)}-${dateStr}.md`;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 复制文件名到剪贴板
    try {
      await navigator.clipboard.writeText(filename);
      setDownloadedFilename(filename);
      setTimeout(() => setDownloadedFilename(''), 2000);
    } catch {
      // 忽略
    }
  };

  const platformName = platformInfo ? PLATFORM_NAMES[platformInfo.platform] : '';
  const isAiEnabled = !!platformInfo;

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
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

      {/* Dialog */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999999,
          width: '520px',
          maxWidth: '90vw',
          maxHeight: '85vh',
          borderRadius: '16px',
          border: '1px solid #D5D3CB',
          backgroundColor: '#F9F9F7',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
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
            zIndex: 1,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        {/* Header with Tabs */}
        <div style={{ borderBottom: '1px solid #D5D3CB', padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#CC785C',
              }}
            />
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#181818', margin: 0 }}>导出内容</h2>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => isAiEnabled && setActiveTab('ai')}
              disabled={!isAiEnabled}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                border: 'none',
                borderRadius: '8px 8px 0 0',
                backgroundColor: activeTab === 'ai' ? '#fff' : 'transparent',
                color: !isAiEnabled ? '#aaa' : activeTab === 'ai' ? '#CC785C' : '#666',
                cursor: isAiEnabled ? 'pointer' : 'not-allowed',
                borderBottom: activeTab === 'ai' ? '2px solid #CC785C' : '2px solid transparent',
                marginBottom: '-1px',
                opacity: isAiEnabled ? 1 : 0.5,
              }}>
              AI 对话导出
              {!isAiEnabled && <span style={{ marginLeft: '4px', fontSize: '11px', color: '#999' }}>(不可用)</span>}
            </button>
            <button
              onClick={() => setActiveTab('clipboard')}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                border: 'none',
                borderRadius: '8px 8px 0 0',
                backgroundColor: activeTab === 'clipboard' ? '#fff' : 'transparent',
                color: activeTab === 'clipboard' ? '#CC785C' : '#666',
                cursor: 'pointer',
                borderBottom: activeTab === 'clipboard' ? '2px solid #CC785C' : '2px solid transparent',
                marginBottom: '-1px',
              }}>
              剪贴板导出
            </button>
          </div>
        </div>

        {/* AI Tab: 获取选项 */}
        {activeTab === 'ai' && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #D5D3CB', backgroundColor: '#fafafa' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              {/* Options */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={aiOptions.includeThinking}
                    onChange={() => updateAiOption('includeThinking', !aiOptions.includeThinking)}
                    style={{ width: '14px', height: '14px', accentColor: '#CC785C', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#181818' }}>thinking</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={aiOptions.includeToolCalls}
                    onChange={() => updateAiOption('includeToolCalls', !aiOptions.includeToolCalls)}
                    style={{ width: '14px', height: '14px', accentColor: '#CC785C', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#181818' }}>tool calls</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={aiOptions.textOnly}
                    onChange={() => updateAiOption('textOnly', !aiOptions.textOnly)}
                    style={{ width: '14px', height: '14px', accentColor: '#CC785C', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#181818' }}>仅文本</span>
                </label>
              </div>

              {/* Fetch button */}
              <button
                onClick={handleFetchAiData}
                disabled={fetchStatus === 'fetching'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: chatData ? '1px solid #D5D3CB' : 'none',
                  backgroundColor: chatData ? '#fff' : '#CC785C',
                  color: chatData ? '#666' : '#fff',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: fetchStatus === 'fetching' ? 'not-allowed' : 'pointer',
                  opacity: fetchStatus === 'fetching' ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}>
                {fetchStatus === 'fetching' ? (
                  '获取中...'
                ) : chatData ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 2v6h-6" />
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                      <path d="M3 22v-6h6" />
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    重新获取
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    获取 {platformName} 对话
                  </>
                )}
              </button>
            </div>

            {/* Status */}
            {fetchStatus === 'success' && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                已获取对话内容，可在下方编辑
              </div>
            )}
            {fetchStatus === 'error' && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#b91c1c',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m15 9-6 6" />
                  <path d="m9 9 6 6" />
                </svg>
                {fetchError}
              </div>
            )}
          </div>
        )}

        {/* 公共编辑区：Frontmatter */}
        <div style={{ borderBottom: '1px solid #D5D3CB', padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <label style={{ width: '40px', fontSize: '12px', color: '#666', flexShrink: 0 }}>标题</label>
            <input
              type="text"
              value={parsed.frontmatter.title || ''}
              onChange={e => updateFrontmatterField('title', e.target.value)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #D5D3CB',
                backgroundColor: '#fff',
                color: '#181818',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ width: '40px', fontSize: '12px', color: '#666', flexShrink: 0 }}>来源</label>
            <input
              type="text"
              value={parsed.frontmatter.source || ''}
              onChange={e => updateFrontmatterField('source', e.target.value)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #D5D3CB',
                backgroundColor: '#fff',
                color: '#181818',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>
          {markdownData?.presetName && (
            <div style={{ marginTop: '8px' }}>
              <span
                style={{
                  backgroundColor: 'rgba(204, 120, 92, 0.1)',
                  color: '#CC785C',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                }}>
                {markdownData.presetName}
              </span>
            </div>
          )}
        </div>

        {/* 公共编辑区：Content Editor */}
        <textarea
          value={parsed.content}
          onChange={e => updateContent(e.target.value)}
          placeholder="内容..."
          style={{
            flex: 1,
            minHeight: '180px',
            padding: '12px 20px',
            border: 'none',
            backgroundColor: '#f5f5f5',
            color: '#181818',
            fontSize: '12px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            resize: 'none',
            outline: 'none',
          }}
        />

        {/* Footer: 统一操作按钮 */}
        <div
          style={{
            borderTop: '1px solid #D5D3CB',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}>
          <button
            onClick={copyToClipboard}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #D5D3CB',
              backgroundColor: '#fff',
              color: '#181818',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}>
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {copied ? '已复制' : '复制'}
          </button>
          <button
            onClick={downloadMarkdown}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: downloadedFilename ? '#15803d' : '#CC785C',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}>
            {downloadedFilename ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {downloadedFilename ? '已复制文件名' : '下载'}
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

  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  for (const entry of entries) {
    const match = entry.name.match(/\/organizations\/([a-f0-9-]+)\//);
    if (match) {
      return match[1];
    }
  }

  return null;
}
