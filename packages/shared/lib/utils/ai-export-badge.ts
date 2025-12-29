/**
 * AI 对话导出悬浮按钮
 * 点击后通过消息通知 side-panel 打开导出对话框
 */

// AI 平台类型
type AIPlatform = 'claude' | 'google-ai-studio' | 'gmail';

interface PlatformInfo {
  platform: AIPlatform;
  id: string;
  name: string;
}

// Lovstudio 暖学术风格配色
const LOVSTUDIO_COLORS = {
  primary: '#CC785C', // 陶土色
  primaryHover: '#B86A50', // 陶土色深
} as const;

export class AIExportBadge {
  private container: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private platformInfo: PlatformInfo | null = null;

  // 位置
  private currentY = 150;
  private readonly STORAGE_KEY = 'lovsider-ai-export-badge-position';
  private readonly MIN_Y = 10;

  // 拖拽状态
  private isDragging = false;
  private dragStartY = 0;
  private elementStartY = 0;
  private mouseDownTime = 0;

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

    // 匹配 mail.google.com/mail/u/{accountIndex}/#inbox/{threadId} 或类似 URL
    const gmailMatch = url.match(/^https:\/\/mail\.google\.com\/mail\/u\/(\d+)\/#[^/]+\/([a-zA-Z0-9_-]+)/);
    if (gmailMatch) {
      return { platform: 'gmail', id: gmailMatch[2], name: 'Gmail' };
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
    this.createStyles();
    this.createUI();
    this.setupEventHandlers();

    console.log(`[Lovsider] AI 导出按钮已初始化: ${this.platformInfo.name}`);
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
    `;
    document.head.appendChild(style);
  }

  private createUI(): void {
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

  private openExportDialog(): void {
    // 实时检测平台信息（URL 可能已变化）
    const currentPlatformInfo = AIExportBadge.detectPlatform();
    window.postMessage(
      {
        type: 'lovsider-open-unified-export',
        platformInfo: currentPlatformInfo,
        markdownData: null,
      },
      '*',
    );
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
        this.openExportDialog();
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

    if (this.container) {
      this.container.remove();
    }
    this.container = null;
    this.button = null;
  }
}
