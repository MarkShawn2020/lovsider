// AI 平台解析工具
// 从 ClaudeExportPanel 提取的核心解析逻辑

import { claudeExportStorage } from '@extension/storage';
import type { ClaudeExportOptions } from '@extension/storage';

// 支持的 AI 平台
export type AIPlatform = 'claude' | 'google-ai-studio' | 'gmail';

// 统一的消息格式
export interface UnifiedMessage {
  role: 'human' | 'assistant';
  text: string;
  thinking?: string;
  toolCalls?: Array<{ name: string; input: unknown }>;
  toolResults?: string[];
}

export interface UnifiedChatData {
  platform: AIPlatform;
  id: string;
  title: string;
  model?: string;
  messages: UnifiedMessage[];
  sourceUrl: string;
  exportedAt: string;
}

// 平台检测结果
export interface PlatformDetection {
  platform: AIPlatform;
  id: string;
  title: string;
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
    tool_use?: { name: string; input: unknown };
    tool_result?: { content: string };
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

// Google AI Studio 响应类型
type GoogleAIStudioResponse = unknown[][];

// 平台名称映射
export const PLATFORM_NAMES: Record<AIPlatform, string> = {
  claude: 'Claude AI',
  'google-ai-studio': 'Google AI Studio',
  gmail: 'Gmail',
};

// 解析 Google AI Studio 响应
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

// 解析 Claude 响应
function parseClaudeResponse(data: ClaudeChatResponse, url: string): UnifiedChatData {
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
}

// 检测当前页面是否是 AI 平台
export async function detectAIPlatform(): Promise<{ detection: PlatformDetection; orgId?: string } | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.id) return null;

    // 匹配 claude.ai/chat/{chatId}
    const claudeMatch = tab.url.match(/^https:\/\/claude\.ai\/chat\/([a-f0-9-]+)/);
    if (claudeMatch) {
      const chatId = claudeMatch[1];
      let orgId: string | undefined;

      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getClaudeOrgId' });
        if (response?.orgId) {
          orgId = response.orgId;
          await claudeExportStorage.setLastOrgId(response.orgId);
        } else {
          orgId = (await claudeExportStorage.getLastOrgId()) || undefined;
        }
      } catch {
        orgId = (await claudeExportStorage.getLastOrgId()) || undefined;
      }

      const title = tab.title?.replace(' - Claude', '').trim() || '未命名对话';
      return { detection: { platform: 'claude', id: chatId, title }, orgId };
    }

    // 匹配 aistudio.google.com/prompts/{promptId}
    const googleMatch = tab.url.match(/^https:\/\/aistudio\.google\.com\/prompts\/([a-zA-Z0-9_-]+)/);
    if (googleMatch) {
      const promptId = googleMatch[1];
      const title = tab.title?.replace(' - Google AI Studio', '').trim() || '未命名对话';
      return { detection: { platform: 'google-ai-studio', id: promptId, title } };
    }

    // 匹配 mail.google.com/mail/u/{accountIndex}/#inbox/{threadId} 或类似 URL
    // 格式: #inbox/xxx, #label/xxx/yyy, #sent/xxx, #all/xxx 等
    const gmailMatch = tab.url.match(/^https:\/\/mail\.google\.com\/mail\/u\/(\d+)\/#[^/]+\/([a-zA-Z0-9_-]+)/);
    if (gmailMatch) {
      const threadId = gmailMatch[2];
      const title =
        tab.title
          ?.replace(' - Gmail', '')
          .replace(/ - .+@.+$/, '')
          .trim() || '邮件线程';
      return { detection: { platform: 'gmail', id: threadId, title } };
    }

    return null;
  } catch (err) {
    console.error('[Lovsider] 检测 AI 平台失败:', err);
    return null;
  }
}

// 获取聊天数据
export async function fetchAIChatData(detection: PlatformDetection, orgId?: string): Promise<UnifiedChatData | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id || !tab.url) throw new Error('无法获取当前标签页');

  if (detection.platform === 'claude') {
    if (!orgId) throw new Error('缺少必要的 orgId');

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'fetchClaudeChat',
      chatId: detection.id,
      orgId,
    });

    if (!response.success) {
      throw new Error(response.error || '获取聊天数据失败');
    }

    return parseClaudeResponse(response.data, tab.url);
  }

  if (detection.platform === 'google-ai-studio') {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'fetchGoogleAIStudioChat',
      promptId: detection.id,
    });

    if (!response.success) {
      throw new Error(response.error || '获取聊天数据失败');
    }

    return parseGoogleAIStudioResponse(response.data, tab.url);
  }

  if (detection.platform === 'gmail') {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'fetchGmailThread',
      threadId: detection.id,
    });

    if (!response.success) {
      throw new Error(response.error || '获取邮件数据失败');
    }

    return parseGmailResponse(response.data, tab.url);
  }

  throw new Error('不支持的平台');
}

// Gmail 邮件项接口
interface GmailMessage {
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
}

// 解析 Gmail 响应
function parseGmailResponse(data: GmailMessage[], url: string): UnifiedChatData {
  const messages: UnifiedMessage[] = [];

  for (const email of data) {
    // 每封邮件作为一条消息，包含完整的邮件头信息
    const header = [
      email.from ? `**From:** ${email.from}` : '',
      email.to ? `**To:** ${email.to}` : '',
      email.subject ? `**Subject:** ${email.subject}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    messages.push({
      role: 'human',
      text: header ? `${header}\n\n---\n\n${email.body}` : email.body,
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
}

// 转换为 Markdown
export function convertChatToMarkdown(
  data: UnifiedChatData,
  options: ClaudeExportOptions = { includeThinking: true, includeToolCalls: true, textOnly: false },
): string {
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
}

// 一键解析 AI 平台内容
export async function parseAIPlatformContent(): Promise<{
  markdown: string;
  presetMatch: { presetId: string; presetName: string; matchedPattern: string };
} | null> {
  const result = await detectAIPlatform();
  if (!result) return null;

  const { detection, orgId } = result;
  const chatData = await fetchAIChatData(detection, orgId);
  if (!chatData) return null;

  const options = await claudeExportStorage.getOptions();
  const markdown = convertChatToMarkdown(chatData, options);

  const patternMap: Record<AIPlatform, string> = {
    claude: 'claude.ai/chat',
    'google-ai-studio': 'aistudio.google.com/prompts',
    gmail: 'mail.google.com/mail',
  };

  return {
    markdown,
    presetMatch: {
      presetId: detection.platform,
      presetName: PLATFORM_NAMES[detection.platform],
      matchedPattern: patternMap[detection.platform],
    },
  };
}
