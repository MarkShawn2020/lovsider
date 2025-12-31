import { MarkdownViewer } from '../../components/MarkdownViewer';
import { Switch } from '../../components/Switch';
import { useStorage } from '@extension/shared';
import { claudeExportStorage, exportLayoutStorage } from '@extension/storage';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ClaudeExportOptions } from '@extension/storage';

// 平台信息
interface PlatformInfo {
  platform: 'claude' | 'google-ai-studio' | 'gmail';
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
  gmail: 'Gmail',
};

// 可折叠 JSON 查看器组件
interface JsonNodeProps {
  data: unknown;
  depth?: number;
  label?: React.ReactNode; // 行前缀（索引或键名）
}

const JsonNode = ({ data, depth = 0, label }: JsonNodeProps) => {
  const [collapsed, setCollapsed] = useState(depth > 1);
  const [hovered, setHovered] = useState(false);
  const indent = depth * 16;

  const isCollapsible =
    (Array.isArray(data) && data.length > 0) ||
    (typeof data === 'object' && data !== null && Object.keys(data).length > 0);

  const rowStyle = {
    cursor: isCollapsible ? 'pointer' : 'default',
    userSelect: 'none' as const,
    display: 'inline-block',
    width: '100%',
    borderRadius: '3px',
    margin: '-1px -4px',
    padding: '1px 4px',
    backgroundColor: hovered ? 'rgba(0,0,0,0.05)' : 'transparent',
  };

  const rowProps = {
    style: rowStyle,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  // 原始类型
  if (data === null)
    return (
      <div {...rowProps}>
        {label}
        <span style={{ color: '#666' }}>null</span>
      </div>
    );
  if (typeof data === 'boolean')
    return (
      <div {...rowProps}>
        {label}
        <span style={{ color: '#0550ae' }}>{String(data)}</span>
      </div>
    );
  if (typeof data === 'number')
    return (
      <div {...rowProps}>
        {label}
        <span style={{ color: '#0550ae' }}>{data}</span>
      </div>
    );
  if (typeof data === 'string') {
    const truncated = data.length > 100 ? data.slice(0, 100) + '...' : data;
    return (
      <div {...rowProps}>
        {label}
        <span style={{ color: '#0a3069' }} title={data.length > 100 ? data : undefined}>
          "{truncated}"
        </span>
      </div>
    );
  }

  // 数组
  if (Array.isArray(data)) {
    if (data.length === 0)
      return (
        <div {...rowProps}>
          {label}
          <span style={{ color: '#666' }}>[]</span>
        </div>
      );
    return (
      <span>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div {...rowProps} onClick={() => setCollapsed(!collapsed)}>
          {label}
          <span style={{ color: '#666', marginRight: '4px', fontSize: '10px' }}>{collapsed ? '▶' : '▼'}</span>
          <span style={{ color: '#666' }}>[{data.length}]</span>
        </div>
        {!collapsed && (
          <div style={{ marginLeft: `${indent + 16}px` }}>
            {data.map((item, i) => (
              <div key={i}>
                <JsonNode data={item} depth={depth + 1} label={<span style={{ color: '#666' }}>{i}: </span>} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  // 对象
  if (typeof data === 'object') {
    const keys = Object.keys(data as Record<string, unknown>);
    if (keys.length === 0)
      return (
        <div {...rowProps}>
          {label}
          <span style={{ color: '#666' }}>{'{}'}</span>
        </div>
      );
    return (
      <span>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div {...rowProps} onClick={() => setCollapsed(!collapsed)}>
          {label}
          <span style={{ color: '#666', marginRight: '4px', fontSize: '10px' }}>{collapsed ? '▶' : '▼'}</span>
          <span style={{ color: '#666' }}>
            {'{'}
            {keys.length}
            {'}'}
          </span>
        </div>
        {!collapsed && (
          <div style={{ marginLeft: `${indent + 16}px` }}>
            {keys.map(key => (
              <div key={key}>
                <JsonNode
                  data={(data as Record<string, unknown>)[key]}
                  depth={depth + 1}
                  label={
                    <>
                      <span style={{ color: '#953800' }}>"{key}"</span>
                      <span style={{ color: '#666' }}>: </span>
                    </>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return (
    <div {...rowProps}>
      {label}
      <span>{String(data)}</span>
    </div>
  );
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
  const [showJsonViewer, setShowJsonViewer] = useState(false);
  const [rawApiResponse, setRawApiResponse] = useState<unknown>(null); // 原始 API 响应
  const [copyPathOnDownload, setCopyPathOnDownload] = useState(true); // 下载时复制文件路径
  const [showDownloadMenu, setShowDownloadMenu] = useState(false); // split-button 菜单
  const [showMeta, setShowMeta] = useState(false);
  const [showFetchOptions, setShowFetchOptions] = useState(false);
  const [shouldAutoFetch, setShouldAutoFetch] = useState(false); // 自动获取触发器
  const fetchOptionsRef = useRef<HTMLDivElement>(null);
  const { dialogSize } = useStorage(exportLayoutStorage);
  const [isResizing, setIsResizing] = useState(false);
  const safeDialogSize = dialogSize ?? { width: 520, height: 480 };
  const [localSize, setLocalSize] = useState({ width: safeDialogSize.width, height: safeDialogSize.height });
  const dialogRef = useRef<HTMLDivElement>(null);

  // 同步 storage 变化到 localSize
  useEffect(() => {
    if (!isResizing && dialogSize) {
      setLocalSize({ width: dialogSize.width, height: dialogSize.height });
    }
  }, [dialogSize, isResizing]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (!showFetchOptions) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (fetchOptionsRef.current && !fetchOptionsRef.current.contains(e.target as Node)) {
        setShowFetchOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFetchOptions]);

  // Resize 拖拽逻辑
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: 'se' | 'e' | 's') => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = localSize.width;
      const startHeight = localSize.height;
      let finalWidth = startWidth;
      let finalHeight = startHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        finalWidth = direction === 's' ? startWidth : Math.max(400, Math.min(1200, startWidth + deltaX * 2));
        finalHeight = direction === 'e' ? startHeight : Math.max(300, Math.min(900, startHeight + deltaY * 2));
        setLocalSize({ width: finalWidth, height: finalHeight });
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        // 持久化
        exportLayoutStorage.setDialogSize({ width: finalWidth, height: finalHeight });
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [localSize],
  );

  const parsed = useMemo(() => parseFrontmatter(markdown), [markdown]);

  // 缓存 key 生成
  const getCacheKey = (pInfo: PlatformInfo) => `lovsider-chat-cache-${pInfo.platform}-${pInfo.id}`;

  // 检测当前页面平台信息
  const detectPlatform = useCallback((): PlatformInfo | null => {
    const url = window.location.href;
    const claudeMatch = url.match(/^https:\/\/claude\.ai\/chat\/([a-f0-9-]+)/);
    if (claudeMatch) {
      return { platform: 'claude', id: claudeMatch[1], name: 'Claude' };
    }
    const googleMatch = url.match(/^https:\/\/aistudio\.google\.com\/prompts\/([a-zA-Z0-9_-]+)/);
    if (googleMatch) {
      return { platform: 'google-ai-studio', id: googleMatch[1], name: 'AI Studio' };
    }
    // Gmail 匹配
    const gmailMatch = url.match(/^https:\/\/mail\.google\.com\/mail\/u\/(\d+)\/#[^/]+\/([a-zA-Z0-9_-]+)/);
    if (gmailMatch) {
      return { platform: 'gmail', id: gmailMatch[2], name: 'Gmail' };
    }
    return null;
  }, []);

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

  // ESC 键关闭弹窗
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

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
            setShouldAutoFetch(false);
          } else {
            setChatData(null);
            setFetchStatus('idle');
            setShouldAutoFetch(true); // 无缓存时触发自动获取
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

  // 处理 URL 变化
  const handleUrlChange = useCallback(() => {
    const newPlatformInfo = detectPlatform();

    if (newPlatformInfo && newPlatformInfo.id !== platformInfo?.id) {
      setPlatformInfo(newPlatformInfo);
      const cached = loadCachedChatData(newPlatformInfo);
      if (cached) {
        setChatData(cached);
        setFetchStatus('success');
        setShouldAutoFetch(false);
      } else {
        setChatData(null);
        setFetchStatus('idle');
        setShouldAutoFetch(true);
      }
    } else if (!newPlatformInfo && platformInfo) {
      setPlatformInfo(null);
      setActiveTab('clipboard');
    }
  }, [detectPlatform, platformInfo?.id]);

  // 监听 URL 变化消息（来自 background -> content -> content-ui）
  useEffect(() => {
    if (!open) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'lovsider-url-changed') {
        handleUrlChange();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [open, handleUrlChange]);

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
  const fetchChatData = useCallback(async (): Promise<{ parsed: UnifiedChatData; raw: unknown } | null> => {
    if (!platformInfo) throw new Error('未检测到支持的平台');

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
      const rawData = await response.json();
      return { parsed: parseClaudeResponse(rawData, window.location.href), raw: rawData };
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
      const rawData = await response.json();
      return { parsed: parseGoogleAIStudioResponse(rawData, window.location.href), raw: rawData };
    }

    if (platformInfo.platform === 'gmail') {
      // 通过 content script 获取 Gmail 线程数据
      const response = await new Promise<{ success: boolean; data?: GmailMessage[]; error?: string }>(resolve => {
        window.postMessage({ type: 'lovsider-fetch-gmail-thread', threadId: platformInfo.id }, '*');
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'lovsider-gmail-thread-response') {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };
        window.addEventListener('message', handler);
        // 超时处理
        setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve({ success: false, error: '获取超时' });
        }, 15000);
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || '获取邮件数据失败');
      }

      return { parsed: parseGmailResponse(response.data, window.location.href), raw: response.data };
    }

    throw new Error('不支持的平台');
  }, [platformInfo]);

  // Gmail 邮件解析
  interface GmailMessage {
    from: string;
    to: string;
    subject: string;
    date: string;
    body: string;
  }

  const parseGmailResponse = (data: GmailMessage[], url: string): UnifiedChatData => {
    const messages: UnifiedMessage[] = [];

    for (const email of data) {
      messages.push({
        role: 'human',
        text: `**From:** ${email.from}\n**To:** ${email.to}\n**Date:** ${email.date}\n**Subject:** ${email.subject}\n\n${email.body}`,
      });
    }

    const title = data.length > 0 ? data[0].subject || '邮件线程' : '邮件线程';

    return {
      platform: 'gmail',
      id: url.split('/').pop() || '',
      title,
      messages,
      sourceUrl: url,
      exportedAt: new Date().toISOString(),
    };
  };

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
  // 数据结构：
  // - chunk[0] 是主文本，chunk[8] 是 role (user/model)
  // - chunk[19] === 1 表示整条消息是 thinking
  // - chunk[29] 包含子 blocks，用于流式显示
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
      const result = await fetchChatData();
      if (!result) throw new Error('无法获取聊天数据');

      setChatData(result.parsed); // 保存解析后数据，useEffect 会自动更新 markdown
      setRawApiResponse(result.raw); // 保存原始 API 响应
      // 缓存到 localStorage
      if (platformInfo) {
        saveChatDataToCache(platformInfo, result.parsed);
      }
      setFetchStatus('success');
    } catch (err) {
      console.error('获取失败:', err);
      setFetchError(err instanceof Error ? err.message : '获取失败');
      setFetchStatus('error');
    }
  };

  // 无缓存时自动获取
  useEffect(() => {
    if (shouldAutoFetch && open && activeTab === 'ai' && fetchStatus === 'idle') {
      setShouldAutoFetch(false);
      handleFetchAiData();
    }
  }, [shouldAutoFetch, open, activeTab, fetchStatus]);

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
      const content =
        showJsonViewer && (rawApiResponse || chatData) ? JSON.stringify(rawApiResponse || chatData, null, 2) : markdown;
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 下载文件（markdown 或 json）
  const downloadFile = async () => {
    const isJson = showJsonViewer && (rawApiResponse || chatData);
    const title = chatData?.title || extractTitleFromMarkdown(markdown);
    const dateStr = new Date().toISOString().split('T')[0];
    const ext = isJson ? 'json' : 'md';
    const filename = `${title.replace(/[/\\:*?"<>|]/g, '-').slice(0, 50)}-${dateStr}.${ext}`;

    const content = isJson ? JSON.stringify(rawApiResponse || chatData, null, 2) : markdown;
    const mimeType = isJson ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8';

    try {
      // 通过 background script 下载，获取完整文件路径
      const response = await chrome.runtime.sendMessage({
        action: 'downloadFile',
        content,
        filename,
        mimeType,
      });

      if (response?.success && response.filePath && copyPathOnDownload) {
        // 路径包含空格时用引号包围
        const pathToCopy = response.filePath.includes(' ') ? `"${response.filePath}"` : response.filePath;
        await navigator.clipboard.writeText(pathToCopy);
        setDownloadedFilename(pathToCopy);
        setTimeout(() => setDownloadedFilename(''), 2000);
      }
    } catch {
      // Fallback: 使用传统方式下载（无法获取路径）
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

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
        ref={dialogRef}
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999999,
          width: `${localSize.width}px`,
          height: `${localSize.height}px`,
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

        {/* Header */}
        <div style={{ borderBottom: '1px solid #D5D3CB', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img
                src={chrome.runtime.getURL('logo.svg')}
                alt="Lovsider"
                style={{ width: '20px', height: '20px', flexShrink: 0 }}
              />
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#181818' }}>Lovsider</span>
              <span style={{ fontSize: '11px', color: '#999', fontWeight: 400 }}>
                v{chrome.runtime.getManifest().version}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setShowMeta(!showMeta)}
                title={showMeta ? '隐藏 Meta 信息' : '显示 Meta 信息'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #D5D3CB',
                  backgroundColor: showMeta ? '#CC785C' : '#fff',
                  color: showMeta ? '#fff' : '#666',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Meta
              </button>
            </div>
          </div>
        </div>

        {/* Body + Footer wrapper */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Content area */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
            {showMeta ? (
              /* Meta 信息面板 - 独占模式 */
              <div
                style={{
                  flex: 1,
                  padding: '20px',
                  backgroundColor: '#fafafa',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <label style={{ width: '40px', fontSize: '12px', color: '#666', flexShrink: 0 }}>标题</label>
                  <input
                    type="text"
                    value={parsed.frontmatter.title || ''}
                    onChange={e => updateFrontmatterField('title', e.target.value)}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
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
                      padding: '6px 10px',
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
            ) : (
              /* Tabs + Content 正常模式 */
              <>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px', padding: '0 20px', borderBottom: '1px solid #D5D3CB' }}>
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
                    智能导出{platformInfo ? `（${platformInfo.name}）` : ''}
                    {!isAiEnabled && (
                      <span style={{ marginLeft: '4px', fontSize: '11px', color: '#999' }}>(不可用)</span>
                    )}
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

                {/* 支持平台说明 */}
                {activeTab === 'ai' && (
                  <div
                    style={{
                      padding: '8px 20px',
                      fontSize: '11px',
                      color: '#888',
                      backgroundColor: '#fafafa',
                      borderBottom: '1px solid #eee',
                    }}>
                    目前支持：Claude · Google AI Studio · Gmail
                  </div>
                )}

                {/* 主内容区 */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                  }}>
                  {/* Content Editor 或 JSON Viewer */}
                  {showJsonViewer && (rawApiResponse || chatData) ? (
                    <div
                      style={{
                        flex: 1,
                        minHeight: '180px',
                        padding: '12px 20px',
                        backgroundColor: '#f6f8fa',
                        overflow: 'auto',
                      }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px',
                        }}>
                        <span style={{ fontSize: '11px', color: '#666', fontWeight: 500 }}>
                          {rawApiResponse ? '原始 API 响应' : '解析后数据（缓存）'}
                        </span>
                        <button
                          onClick={() => setShowJsonViewer(false)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#666',
                            padding: '2px 6px',
                            fontSize: '11px',
                          }}>
                          切换到 Markdown
                        </button>
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          lineHeight: 1.5,
                        }}>
                        <JsonNode data={rawApiResponse || chatData} />
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        minHeight: '180px',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }}>
                      {/* JSON 切换按钮 - 仅在有 chatData 时显示 */}
                      {chatData && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            padding: '4px 16px 0',
                            backgroundColor: '#fafafa',
                          }}>
                          <button
                            onClick={() => setShowJsonViewer(true)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#666',
                              padding: '2px 6px',
                              fontSize: '11px',
                            }}>
                            切换到 JSON
                          </button>
                        </div>
                      )}
                      <MarkdownViewer value={parsed.content} onChange={updateContent} placeholder="内容..." />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer: 统一操作按钮 */}
          <div
            style={{
              borderTop: '1px solid #D5D3CB',
              padding: '12px 20px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              alignItems: 'center',
              flexShrink: 0,
            }}>
            {/* 错误提示 */}
            {activeTab === 'ai' && fetchStatus === 'error' && (
              <span style={{ fontSize: '12px', color: '#b91c1c', marginRight: 'auto' }}>{fetchError}</span>
            )}

            {/* 获取按钮 - Split Button */}
            {activeTab === 'ai' && (
              <div ref={fetchOptionsRef} style={{ position: 'relative', display: 'flex' }}>
                <button
                  onClick={handleFetchAiData}
                  disabled={fetchStatus === 'fetching'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: chatData ? '10px 0 0 10px' : '10px',
                    border: '1px solid #D5D3CB',
                    borderRight: chatData ? 'none' : undefined,
                    backgroundColor: '#fff',
                    color: '#666',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: fetchStatus === 'fetching' ? 'not-allowed' : 'pointer',
                    opacity: fetchStatus === 'fetching' ? 0.6 : 1,
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
                      获取对话
                    </>
                  )}
                </button>
                {/* 下拉箭头 - 有数据时显示 */}
                {chatData && (
                  <button
                    onClick={() => setShowFetchOptions(!showFetchOptions)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 8px',
                      borderRadius: '0 10px 10px 0',
                      border: '1px solid #D5D3CB',
                      backgroundColor: showFetchOptions ? '#f5f5f5' : '#fff',
                      color: '#666',
                      cursor: 'pointer',
                    }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                )}
                {/* 下拉菜单 */}
                {showFetchOptions && chatData && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      marginBottom: '4px',
                      padding: '8px 12px',
                      backgroundColor: '#fff',
                      border: '1px solid #D5D3CB',
                      borderRadius: '10px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      minWidth: '140px',
                      zIndex: 10,
                    }}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Switch
                        checked={aiOptions.includeThinking}
                        onCheckedChange={checked => updateAiOption('includeThinking', checked)}
                      />
                      <span className="text-foreground text-xs">thinking</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Switch
                        checked={aiOptions.includeToolCalls}
                        onCheckedChange={checked => updateAiOption('includeToolCalls', checked)}
                      />
                      <span className="text-foreground text-xs">tool calls</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Switch
                        checked={aiOptions.textOnly}
                        onCheckedChange={checked => updateAiOption('textOnly', checked)}
                      />
                      <span className="text-foreground text-xs">仅文本</span>
                    </label>
                  </div>
                )}
              </div>
            )}

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
              {copied ? '已复制' : showJsonViewer ? '复制 JSON' : '复制'}
            </button>
            {/* Split Button: 下载 + 下拉菜单 */}
            <div style={{ position: 'relative', display: 'flex' }}>
              <button
                onClick={downloadFile}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '10px 0 0 10px',
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
                {downloadedFilename ? '已复制路径' : showJsonViewer ? '下载 JSON' : '下载'}
              </button>
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 8px',
                  borderRadius: '0 10px 10px 0',
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: downloadedFilename ? '#15803d' : '#CC785C',
                  color: '#fff',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 15 12 9 18 15" />
                </svg>
              </button>
              {showDownloadMenu && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    marginBottom: '4px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    border: '1px solid #D5D3CB',
                    padding: '4px',
                    minWidth: '180px',
                    zIndex: 10,
                  }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#181818',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F5F5F3')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <input
                      type="checkbox"
                      checked={copyPathOnDownload}
                      onChange={e => setCopyPathOnDownload(e.target.checked)}
                      style={{ accentColor: '#CC785C' }}
                    />
                    下载时复制文件路径
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Resize handles */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            onMouseDown={e => handleResizeStart(e, 'e')}
            style={{
              position: 'absolute',
              right: 0,
              top: '20%',
              bottom: '20%',
              width: '6px',
              cursor: 'ew-resize',
            }}
          />
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            onMouseDown={e => handleResizeStart(e, 's')}
            style={{
              position: 'absolute',
              bottom: 0,
              left: '20%',
              right: '20%',
              height: '6px',
              cursor: 'ns-resize',
            }}
          />
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            onMouseDown={e => handleResizeStart(e, 'se')}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: '16px',
              height: '16px',
              cursor: 'nwse-resize',
            }}
          />
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
