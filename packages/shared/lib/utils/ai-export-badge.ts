/**
 * AI 对话导出悬浮按钮
 * 专门用于 Claude.ai 和 Google AI Studio 页面的对话导出
 */

// AI 平台类型
type AIPlatform = 'claude' | 'google-ai-studio';

interface PlatformInfo {
  platform: AIPlatform;
  id: string;
  name: string;
}

interface ExportOptions {
  includeThinking: boolean;
  includeToolCalls: boolean;
  textOnly: boolean;
}

interface ChatMessage {
  role: 'human' | 'assistant';
  text: string;
  thinking?: string;
  toolCalls?: Array<{ name: string; input: unknown }>;
  toolResults?: string[];
}

interface ChatData {
  platform: string;
  id: string;
  title: string;
  model?: string;
  messages: ChatMessage[];
  sourceUrl: string;
  exportedAt: string;
}

// Lovstudio 暖学术风格配色
const LOVSTUDIO_COLORS = {
  primary: '#CC785C', // 陶土色
  primaryHover: '#B86A50', // 陶土色深
  background: '#F9F9F7', // 暖米色
  foreground: '#181818', // 炭灰色
  muted: '#87867F', // 灰褐色
  border: '#D5D3CB', // 边框色
  secondary: '#F0EEE6', // 象牙米色
  secondaryHover: '#E8E6DC', // 象牙米色深
  success: '#629A90', // 仙人掌绿
  error: '#DC2626', // 红色
} as const;

// 平台配置 - 统一使用 Lovstudio 主色调
const PLATFORM_CONFIG: Record<AIPlatform, { name: string; color: string }> = {
  claude: { name: 'Claude', color: LOVSTUDIO_COLORS.primary },
  'google-ai-studio': { name: 'Google AI Studio', color: LOVSTUDIO_COLORS.primary },
};

export class AIExportBadge {
  private container: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private dialog: HTMLDivElement | null = null;
  private platformInfo: PlatformInfo | null = null;
  private orgId: string | null = null;

  // 导出选项
  private options: ExportOptions = {
    includeThinking: true,
    includeToolCalls: true,
    textOnly: false,
  };

  // 位置
  private currentY = 150;
  private readonly STORAGE_KEY = 'lovsider-ai-export-badge-position';
  private readonly MIN_Y = 10;

  // 拖拽状态
  private isDragging = false;
  private dragStartY = 0;
  private elementStartY = 0;
  private mouseDownTime = 0;

  // 导出状态
  private isExporting = false;

  /**
   * 检测当前页面是否是 AI 平台
   */
  public static detectPlatform(): PlatformInfo | null {
    const url = window.location.href;

    const claudeMatch = url.match(/^https:\/\/claude\.ai\/chat\/([a-f0-9-]+)/);
    if (claudeMatch) {
      return { platform: 'claude', id: claudeMatch[1], name: 'Claude' };
    }

    const googleMatch = url.match(/^https:\/\/aistudio\.google\.com\/prompts\/([a-zA-Z0-9_-]+)/);
    if (googleMatch) {
      return { platform: 'google-ai-studio', id: googleMatch[1], name: 'AI Studio' };
    }

    return null;
  }

  public init(): void {
    this.platformInfo = AIExportBadge.detectPlatform();
    if (!this.platformInfo) {
      console.log('[Lovsider] 非 AI 对话页面，不显示导出按钮');
      return;
    }

    const existing = document.getElementById('lovsider-ai-export-badge');
    if (existing) existing.remove();

    this.loadPosition();

    if (this.platformInfo.platform === 'claude') {
      this.fetchClaudeOrgId();
    }

    this.createStyles();
    this.createUI();
    this.createDialog();
    this.setupEventHandlers();

    console.log(`[Lovsider] AI 导出按钮已初始化: ${this.platformInfo.name}`);
  }

  private async fetchClaudeOrgId(): Promise<void> {
    try {
      const lsKeys = Object.keys(localStorage);
      for (const key of lsKeys) {
        if (key.includes('organization') || key.includes('org')) {
          try {
            const value = localStorage.getItem(key);
            if (value) {
              const parsed = JSON.parse(value);
              if (parsed.uuid || parsed.id || parsed.organizationId) {
                this.orgId = parsed.uuid || parsed.id || parsed.organizationId;
                return;
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
          this.orgId =
            nextData?.props?.pageProps?.organizationId ||
            nextData?.props?.pageProps?.org?.uuid ||
            nextData?.props?.initialState?.organization?.uuid;
          if (this.orgId) return;
        } catch {
          // 忽略
        }
      }

      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      for (const entry of entries) {
        const match = entry.name.match(/\/organizations\/([a-f0-9-]+)\//);
        if (match) {
          this.orgId = match[1];
          return;
        }
      }
    } catch (error) {
      console.error('[Lovsider] 获取 Claude orgId 失败:', error);
    }
  }

  private createStyles(): void {
    if (document.getElementById('lovsider-ai-export-styles')) return;

    const style = document.createElement('style');
    style.id = 'lovsider-ai-export-styles';
    style.textContent = `
      #lovsider-ai-export-badge {
        transition: top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      #lovsider-ai-export-badge.dragging {
        transition: none !important;
      }
      #lovsider-ai-export-badge button:hover {
        transform: translateX(-4px);
        background: ${LOVSTUDIO_COLORS.primaryHover};
        box-shadow: -4px 0 16px rgba(204, 120, 92, 0.35);
      }

      .lovsider-dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 2147483647;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
      .lovsider-dialog-overlay.open {
        opacity: 1;
        pointer-events: auto;
      }

      .lovsider-dialog {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        background: ${LOVSTUDIO_COLORS.background};
        border-radius: 16px;
        border: 1px solid ${LOVSTUDIO_COLORS.border};
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
        width: 400px;
        max-width: 90vw;
        z-index: 2147483647;
        opacity: 0;
        pointer-events: none;
        transition: all 0.2s ease;
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .lovsider-dialog.open {
        opacity: 1;
        pointer-events: auto;
        transform: translate(-50%, -50%) scale(1);
      }

      .lovsider-dialog-header {
        padding: 20px 24px 16px;
        border-bottom: 1px solid ${LOVSTUDIO_COLORS.border};
      }
      .lovsider-dialog-title {
        font-size: 18px;
        font-weight: 600;
        color: ${LOVSTUDIO_COLORS.foreground};
        margin: 0 0 4px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: Georgia, Cambria, 'Times New Roman', serif;
      }
      .lovsider-dialog-desc {
        font-size: 14px;
        color: ${LOVSTUDIO_COLORS.muted};
        margin: 0;
      }

      .lovsider-dialog-body {
        padding: 20px 24px;
      }

      .lovsider-checkbox-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .lovsider-checkbox-label {
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        font-size: 14px;
        color: ${LOVSTUDIO_COLORS.foreground};
      }
      .lovsider-checkbox-label input {
        width: 16px;
        height: 16px;
        accent-color: ${LOVSTUDIO_COLORS.primary};
        cursor: pointer;
      }

      .lovsider-dialog-status {
        margin-top: 16px;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13px;
      }
      .lovsider-dialog-status.info {
        background: ${LOVSTUDIO_COLORS.secondary};
        color: ${LOVSTUDIO_COLORS.muted};
      }
      .lovsider-dialog-status.error {
        background: #FEE2E2;
        color: ${LOVSTUDIO_COLORS.error};
      }
      .lovsider-dialog-status.success {
        background: rgba(98, 154, 144, 0.1);
        color: ${LOVSTUDIO_COLORS.success};
      }

      .lovsider-dialog-footer {
        padding: 16px 24px 20px;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }

      .lovsider-btn {
        padding: 10px 18px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: none;
        outline: none;
      }
      .lovsider-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .lovsider-btn-secondary {
        background: ${LOVSTUDIO_COLORS.secondary};
        color: ${LOVSTUDIO_COLORS.foreground};
        border: 1px solid ${LOVSTUDIO_COLORS.border};
      }
      .lovsider-btn-secondary:hover:not(:disabled) {
        background: ${LOVSTUDIO_COLORS.secondaryHover};
      }
      .lovsider-btn-primary {
        background: ${LOVSTUDIO_COLORS.primary};
        color: #FFFFFF;
      }
      .lovsider-btn-primary:hover:not(:disabled) {
        background: ${LOVSTUDIO_COLORS.primaryHover};
      }

      .lovsider-close-btn {
        position: absolute;
        right: 16px;
        top: 16px;
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${LOVSTUDIO_COLORS.muted};
        transition: all 0.15s ease;
      }
      .lovsider-close-btn:hover {
        background: ${LOVSTUDIO_COLORS.secondary};
        color: ${LOVSTUDIO_COLORS.foreground};
      }
    `;
    document.head.appendChild(style);
  }

  private createUI(): void {
    const config = PLATFORM_CONFIG[this.platformInfo!.platform];

    this.container = document.createElement('div');
    this.container.id = 'lovsider-ai-export-badge';
    this.container.style.cssText = `
      position: fixed;
      right: 0;
      top: ${this.currentY}px;
      z-index: 2147483646;
      user-select: none;
    `;

    this.button = document.createElement('button');
    this.button.style.cssText = `
      width: 44px;
      height: 44px;
      border-radius: 12px 0 0 12px;
      background: ${LOVSTUDIO_COLORS.primary};
      color: white;
      border: none;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: -2px 0 12px rgba(204, 120, 92, 0.25);
      transition: all 0.2s ease;
      outline: none;
    `;

    this.button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `;

    this.container.appendChild(this.button);
    document.body.appendChild(this.container);
  }

  private createDialog(): void {
    const config = PLATFORM_CONFIG[this.platformInfo!.platform];

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'lovsider-dialog-overlay';
    overlay.id = 'lovsider-dialog-overlay';

    // Dialog
    this.dialog = document.createElement('div');
    this.dialog.className = 'lovsider-dialog';
    this.dialog.id = 'lovsider-dialog';
    this.dialog.innerHTML = `
      <button class="lovsider-close-btn" id="lovsider-dialog-close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
      <div class="lovsider-dialog-header">
        <h2 class="lovsider-dialog-title">
          <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${config.color}"></span>
          导出 ${config.name} 对话
        </h2>
        <p class="lovsider-dialog-desc">选择导出格式和选项</p>
      </div>
      <div class="lovsider-dialog-body">
        <div class="lovsider-checkbox-group">
          <label class="lovsider-checkbox-label">
            <input type="checkbox" id="lovsider-opt-thinking" checked>
            包含思考过程 (thinking)
          </label>
          <label class="lovsider-checkbox-label">
            <input type="checkbox" id="lovsider-opt-tools" checked>
            包含工具调用 (tool calls)
          </label>
          <label class="lovsider-checkbox-label">
            <input type="checkbox" id="lovsider-opt-textonly">
            仅文本 (省略代码块)
          </label>
        </div>
        <div class="lovsider-dialog-status info" id="lovsider-dialog-status" style="display:none"></div>
      </div>
      <div class="lovsider-dialog-footer">
        <button class="lovsider-btn lovsider-btn-secondary" id="lovsider-export-json">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          JSON
        </button>
        <button class="lovsider-btn lovsider-btn-primary" id="lovsider-export-md">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Markdown
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(this.dialog);

    // 事件绑定
    overlay.addEventListener('click', () => this.closeDialog());
    this.dialog.querySelector('#lovsider-dialog-close')?.addEventListener('click', () => this.closeDialog());
    this.dialog.querySelector('#lovsider-export-json')?.addEventListener('click', () => this.handleExport('json'));
    this.dialog.querySelector('#lovsider-export-md')?.addEventListener('click', () => this.handleExport('markdown'));

    // 选项变更
    this.dialog.querySelector('#lovsider-opt-thinking')?.addEventListener('change', e => {
      this.options.includeThinking = (e.target as HTMLInputElement).checked;
    });
    this.dialog.querySelector('#lovsider-opt-tools')?.addEventListener('change', e => {
      this.options.includeToolCalls = (e.target as HTMLInputElement).checked;
    });
    this.dialog.querySelector('#lovsider-opt-textonly')?.addEventListener('change', e => {
      this.options.textOnly = (e.target as HTMLInputElement).checked;
    });

    // ESC 关闭
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeDialog();
    });
  }

  private openDialog(): void {
    const overlay = document.getElementById('lovsider-dialog-overlay');
    const dialog = document.getElementById('lovsider-dialog');
    if (overlay && dialog) {
      overlay.classList.add('open');
      dialog.classList.add('open');
      this.hideStatus();
    }
  }

  private closeDialog(): void {
    const overlay = document.getElementById('lovsider-dialog-overlay');
    const dialog = document.getElementById('lovsider-dialog');
    if (overlay && dialog) {
      overlay.classList.remove('open');
      dialog.classList.remove('open');
    }
  }

  private showStatus(message: string, type: 'info' | 'error' | 'success'): void {
    const status = document.getElementById('lovsider-dialog-status');
    if (status) {
      status.textContent = message;
      status.className = `lovsider-dialog-status ${type}`;
      status.style.display = 'block';
    }
  }

  private hideStatus(): void {
    const status = document.getElementById('lovsider-dialog-status');
    if (status) status.style.display = 'none';
  }

  private async handleExport(format: 'markdown' | 'json'): Promise<void> {
    if (this.isExporting) return;

    this.isExporting = true;
    this.showStatus('正在导出...', 'info');

    const buttons = this.dialog?.querySelectorAll('.lovsider-btn');
    buttons?.forEach(btn => ((btn as HTMLButtonElement).disabled = true));

    try {
      const chatData = await this.fetchChatData();

      if (format === 'markdown') {
        const markdown = this.convertToMarkdown(chatData);
        const filename = this.generateFilename(chatData.title, 'md');
        this.downloadFile(filename, markdown, 'text/markdown');
      } else {
        const jsonStr = JSON.stringify(chatData, null, 2);
        const filename = this.generateFilename(chatData.title, 'json');
        this.downloadFile(filename, jsonStr, 'application/json');
      }

      this.showStatus(`已导出 ${chatData.messages.length} 条消息`, 'success');
      setTimeout(() => this.closeDialog(), 1500);
    } catch (error) {
      console.error('[Lovsider] 导出失败:', error);
      this.showStatus(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      this.isExporting = false;
      buttons?.forEach(btn => ((btn as HTMLButtonElement).disabled = false));
    }
  }

  private async fetchChatData(): Promise<ChatData> {
    if (!this.platformInfo) throw new Error('未检测到 AI 平台');

    if (this.platformInfo.platform === 'claude') {
      if (!this.orgId) {
        await this.fetchClaudeOrgId();
        if (!this.orgId) throw new Error('缺少 orgId，请刷新页面重试');
      }

      const response = await fetch(
        `https://claude.ai/api/organizations/${this.orgId}/chat_conversations/${this.platformInfo.id}?tree=True&rendering_mode=messages&render_all_tools=true`,
        { credentials: 'include', headers: { Accept: 'application/json' } },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return this.parseClaudeResponse(data);
    }

    if (this.platformInfo.platform === 'google-ai-studio') {
      const sapisid = this.getCookie('SAPISID') || this.getCookie('__Secure-3PAPISID');
      if (!sapisid) throw new Error('未登录 Google');

      const origin = 'https://aistudio.google.com';
      const authHeader = await this.generateSapisidHash(sapisid, origin);

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
          body: JSON.stringify([this.platformInfo.id]),
        },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return this.parseGoogleAIStudioResponse(data);
    }

    throw new Error('不支持的平台');
  }

  private getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  private async generateSapisidHash(sapisid: string, origin: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const input = `${timestamp} ${sapisid} ${origin}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `${timestamp}_${hashHex}`;
  }

  private parseClaudeResponse(data: any): ChatData {
    const messages: ChatMessage[] = [];

    for (const msg of data.chat_messages || []) {
      const unifiedMsg: ChatMessage = { role: msg.sender, text: '' };

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
      sourceUrl: window.location.href,
      exportedAt: new Date().toISOString(),
    };
  }

  private parseGoogleAIStudioResponse(data: any): ChatData {
    const root = data[0] as any[];
    const promptId = (root[0] as string) || '';
    const config = root[3] as any[];
    const metadata = root[4] as any[];

    const model = config?.[2] as string | undefined;
    const title = (metadata?.[0] as string) || '未命名对话';

    const messages: ChatMessage[] = [];
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
      sourceUrl: window.location.href,
      exportedAt: new Date().toISOString(),
    };
  }

  private convertToMarkdown(data: ChatData): string {
    const platformName = data.platform === 'claude' ? 'Claude' : 'Google AI Studio';

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

      if (msg.thinking && this.options.includeThinking) {
        markdown += `<thinking>\n${msg.thinking}\n</thinking>\n\n`;
      }

      if (msg.text) {
        markdown += `${msg.text}\n\n`;
      }

      if (msg.toolCalls && this.options.includeToolCalls) {
        for (const tool of msg.toolCalls) {
          markdown += `**Tool Call: ${tool.name}**\n\`\`\`json\n${JSON.stringify(tool.input, null, 2)}\n\`\`\`\n\n`;
        }
      }

      if (msg.toolResults && this.options.includeToolCalls) {
        for (const result of msg.toolResults) {
          const truncated = result.length > 500 ? result.slice(0, 500) + '...(truncated)' : result;
          markdown += `**Tool Result:**\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
        }
      }
    }

    if (this.options.textOnly) {
      markdown = markdown.replace(/```[\s\S]*?```/g, '[代码块已省略]');
    }

    return markdown;
  }

  private generateFilename(title: string, ext: string): string {
    const sanitized = title.replace(/[/\\:*?"<>|]/g, '-').slice(0, 50);
    const dateStr = new Date().toISOString().split('T')[0];
    return `${sanitized}-${dateStr}.${ext}`;
  }

  private downloadFile(filename: string, content: string, mimeType: string): void {
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

  private setupEventHandlers(): void {
    if (!this.button || !this.container) return;

    let startY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      this.mouseDownTime = Date.now();
      this.isDragging = false;
      startY = e.clientY;
      this.dragStartY = e.clientY;
      this.elementStartY = this.container!.offsetTop;

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = Math.abs(e.clientY - startY);

      if (deltaY > 5) {
        if (!this.isDragging) {
          this.isDragging = true;
          this.container!.classList.add('dragging');
        }

        const delta = e.clientY - this.dragStartY;
        let newY = this.elementStartY + delta;
        const maxY = window.innerHeight - 50;
        newY = Math.max(this.MIN_Y, Math.min(newY, maxY));

        this.container!.style.top = `${newY}px`;
        this.currentY = newY;
      }
    };

    const handleMouseUp = () => {
      const timeDiff = Date.now() - this.mouseDownTime;

      this.container!.classList.remove('dragging');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';

      if (!this.isDragging && timeDiff < 300) {
        this.openDialog();
      } else if (this.isDragging) {
        this.savePosition();
      }

      this.isDragging = false;
    };

    this.button.addEventListener('mousedown', handleMouseDown);
  }

  private savePosition(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ y: this.currentY }));
    } catch {
      // 忽略
    }
  }

  private loadPosition(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.y === 'number') {
          const maxY = window.innerHeight - 50;
          this.currentY = Math.max(this.MIN_Y, Math.min(data.y, maxY));
        }
      }
    } catch {
      // 忽略
    }
  }

  public destroy(): void {
    document.getElementById('lovsider-ai-export-styles')?.remove();
    document.getElementById('lovsider-dialog-overlay')?.remove();
    document.getElementById('lovsider-dialog')?.remove();

    if (this.container) {
      this.container.remove();
    }
    this.container = null;
    this.button = null;
    this.dialog = null;
  }
}
