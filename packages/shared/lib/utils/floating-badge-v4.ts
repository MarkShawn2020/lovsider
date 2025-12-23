/**
 * 悬浮徽章组件 V4 - 彻底解决hover位移问题
 * 核心思路：完全分离定位容器和视觉元素
 */

export interface FloatingBadgeV4Config {
  edge: 'left' | 'right' | 'top' | 'bottom';
  offset: number;
  size: 'small' | 'medium' | 'large';
  theme: 'light' | 'dark' | 'auto';
  enableDragging: boolean;
  opacity: number;
}

export class FloatingBadgeV4 {
  private config: FloatingBadgeV4Config;
  private wrapper: HTMLElement | null = null; // 外层定位容器
  private inner: HTMLElement | null = null; // 内层缩放容器
  private badge: HTMLElement | null = null; // 实际徽章元素
  private currentEdge: 'left' | 'right' | 'top' | 'bottom';
  private isDragging = false;
  private isSidebarOpen = false;

  private readonly defaultConfig: FloatingBadgeV4Config = {
    edge: 'right',
    offset: 20,
    size: 'medium',
    theme: 'auto',
    enableDragging: true,
    opacity: 0.9,
  };

  constructor(config?: Partial<FloatingBadgeV4Config>) {
    this.config = { ...this.defaultConfig, ...config };
    this.currentEdge = this.config.edge;
  }

  /**
   * 初始化组件 - 三层结构
   */
  public init(): void {
    if (this.wrapper) {
      console.warn('[FloatingBadgeV4] Already initialized');
      return;
    }

    this.createElements();
    this.attachStyles();
    this.setupEventListeners();
    this.attachToPage();
  }

  /**
   * 创建三层DOM结构
   */
  private createElements(): void {
    // 第一层：定位容器（只负责位置）
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'lovsider-badge-wrapper';
    this.wrapper.setAttribute('data-edge', this.currentEdge);

    // 第二层：缩放容器（只负责hover效果）
    this.inner = document.createElement('div');
    this.inner.className = 'lovsider-badge-inner';

    // 第三层：徽章本体（只负责视觉）
    this.badge = document.createElement('button');
    this.badge.className = 'lovsider-badge';
    this.badge.innerHTML = this.getBadgeIcon();

    // 组装结构
    this.inner.appendChild(this.badge);
    this.wrapper.appendChild(this.inner);
  }

  /**
   * 附加样式 - 使用内联样式确保最高优先级
   */
  private attachStyles(): void {
    if (!this.wrapper || !this.inner || !this.badge) return;

    const size = this.getSizeValue();
    const theme = this.getThemeColors();

    // 容器样式 - 只负责定位，完全透明
    this.wrapper.style.cssText = `
      position: fixed !important;
      width: ${size}px !important;
      height: ${size}px !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      ${this.getEdgePosition()}
    `;

    // 内层容器 - 只负责缩放动画
    this.inner.style.cssText = `
      width: 100% !important;
      height: 100% !important;
      transform: scale(1) !important;
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      transform-origin: center center !important;
      will-change: transform !important;
      pointer-events: none !important;
    `;

    // 徽章样式 - 只负责视觉呈现
    this.badge.style.cssText = `
      width: 100% !important;
      height: 100% !important;
      border-radius: 50% !important;
      background: ${this.isSidebarOpen ? theme.activeBackground : theme.background} !important;
      color: white !important;
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: ${this.config.enableDragging ? 'grab' : 'pointer'} !important;
      pointer-events: auto !important;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2) !important;
      opacity: ${this.config.opacity} !important;
      transition: box-shadow 0.2s ease, background 0.3s ease !important;
      outline: none !important;
      position: relative !important;
      overflow: visible !important;
    `;

    // 添加全局样式规则
    this.injectGlobalStyles();
  }

  /**
   * 注入全局CSS规则
   */
  private injectGlobalStyles(): void {
    const styleId = 'lovsider-badge-v4-styles';

    // 如果已存在则移除
    const existing = document.getElementById(styleId);
    if (existing) {
      existing.remove();
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Hover效果 - 只作用于inner容器 */
      .lovsider-badge-wrapper:hover .lovsider-badge-inner {
        transform: scale(1.08) !important;
      }
      
      /* Hover时的阴影效果 - 只作用于badge */
      .lovsider-badge-wrapper:hover .lovsider-badge {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
      }
      
      /* 点击效果 */
      .lovsider-badge-wrapper:active .lovsider-badge-inner {
        transform: scale(0.95) !important;
      }
      
      /* 拖动时的样式 */
      .lovsider-badge-wrapper.dragging .lovsider-badge-inner {
        transform: scale(0.9) !important;
      }
      
      .lovsider-badge-wrapper.dragging .lovsider-badge {
        cursor: grabbing !important;
        opacity: 0.8 !important;
      }
      
      /* 工具提示样式 */
      .lovsider-badge::after {
        content: attr(data-tooltip);
        position: absolute;
        white-space: nowrap;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      
      /* 根据边缘位置调整工具提示 */
      .lovsider-badge-wrapper[data-edge="right"] .lovsider-badge::after {
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
      }
      
      .lovsider-badge-wrapper[data-edge="left"] .lovsider-badge::after {
        left: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
      }
      
      .lovsider-badge-wrapper[data-edge="top"] .lovsider-badge::after {
        top: calc(100% + 10px);
        left: 50%;
        transform: translateX(-50%);
      }
      
      .lovsider-badge-wrapper[data-edge="bottom"] .lovsider-badge::after {
        bottom: calc(100% + 10px);
        left: 50%;
        transform: translateX(-50%);
      }
      
      /* Hover时显示工具提示 */
      .lovsider-badge-wrapper:hover .lovsider-badge::after {
        opacity: 1;
      }
      
      /* 禁用拖动时的工具提示 */
      .lovsider-badge-wrapper.dragging .lovsider-badge::after {
        opacity: 0 !important;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * 获取边缘定位CSS
   */
  private getEdgePosition(): string {
    const offset = this.config.offset;

    switch (this.currentEdge) {
      case 'right':
        return `right: ${offset}px !important; top: 100px !important;`;
      case 'left':
        return `left: ${offset}px !important; top: 100px !important;`;
      case 'top':
        return `top: ${offset}px !important; left: 50% !important; transform: translateX(-50%) !important;`;
      case 'bottom':
        return `bottom: ${offset}px !important; left: 50% !important; transform: translateX(-50%) !important;`;
      default:
        return `right: ${offset}px !important; top: 100px !important;`;
    }
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    if (!this.badge) return;

    // 点击事件
    this.badge.addEventListener('click', e => {
      e.stopPropagation();
      this.handleClick();
    });

    // 拖动事件（如果启用）
    if (this.config.enableDragging) {
      this.setupDragging();
    }

    // 设置初始工具提示
    this.updateTooltip();
  }

  /**
   * 设置拖动功能
   */
  private setupDragging(): void {
    if (!this.badge || !this.wrapper) return;

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let hasMoved = false;

    const handlePointerDown = (e: PointerEvent) => {
      if (!this.wrapper) return;

      const rect = this.wrapper.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      hasMoved = false;

      this.badge?.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!this.wrapper || (!hasMoved && Math.abs(e.clientX - startX) < 3 && Math.abs(e.clientY - startY) < 3)) {
        return;
      }

      hasMoved = true;

      if (!this.isDragging) {
        this.isDragging = true;
        this.wrapper.classList.add('dragging');
      }

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // 临时使用transform移动
      this.wrapper.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!this.wrapper) return;

      this.badge?.releasePointerCapture(e.pointerId);

      if (this.isDragging) {
        this.isDragging = false;
        this.wrapper.classList.remove('dragging');

        // 计算最终位置并吸附
        const rect = this.wrapper.getBoundingClientRect();
        this.snapToNearestEdge(rect);
      }

      hasMoved = false;
    };

    this.badge.addEventListener('pointerdown', handlePointerDown);
    this.badge.addEventListener('pointermove', handlePointerMove);
    this.badge.addEventListener('pointerup', handlePointerUp);
    this.badge.addEventListener('pointercancel', handlePointerUp);
  }

  /**
   * 吸附到最近边缘
   */
  private snapToNearestEdge(rect: DOMRect): void {
    if (!this.wrapper) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const distances = {
      left: centerX,
      right: window.innerWidth - centerX,
      top: centerY,
      bottom: window.innerHeight - centerY,
    };

    let nearestEdge = this.currentEdge;
    let minDistance = Infinity;

    for (const [edge, distance] of Object.entries(distances)) {
      if (distance < minDistance) {
        minDistance = distance;
        nearestEdge = edge as typeof nearestEdge;
      }
    }

    this.currentEdge = nearestEdge;
    this.wrapper.setAttribute('data-edge', nearestEdge);

    // 重置transform并应用新位置
    this.wrapper.style.transform = '';
    this.wrapper.style.cssText = `
      position: fixed !important;
      width: ${this.getSizeValue()}px !important;
      height: ${this.getSizeValue()}px !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      ${this.getEdgePosition()}
    `;

    // 动画结束后移除transition
    setTimeout(() => {
      if (this.wrapper) {
        this.wrapper.style.transition = '';
      }
    }, 300);
  }

  /**
   * 处理点击
   */
  private handleClick(): void {
    this.toggleSidebar();
  }

  /**
   * 切换侧边栏
   */
  private toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;

    // 更新徽章颜色
    if (this.badge) {
      const theme = this.getThemeColors();
      this.badge.style.background = `${this.isSidebarOpen ? theme.activeBackground : theme.background} !important`;
    }

    // 更新工具提示
    this.updateTooltip();

    // 发送消息
    chrome.runtime.sendMessage({
      action: this.isSidebarOpen ? 'openSidePanel' : 'closeSidePanel',
      source: 'floating-badge-v4',
    });
  }

  /**
   * 更新工具提示
   */
  private updateTooltip(): void {
    if (this.badge) {
      this.badge.setAttribute('data-tooltip', this.isSidebarOpen ? '关闭 Lovsider 侧边栏' : '打开 Lovsider 侧边栏');
    }
  }

  /**
   * 更新侧边栏状态
   */
  public updateSidebarState(isOpen: boolean): void {
    this.isSidebarOpen = isOpen;

    if (this.badge) {
      const theme = this.getThemeColors();
      this.badge.style.background = `${isOpen ? theme.activeBackground : theme.background} !important`;
    }

    this.updateTooltip();
  }

  /**
   * 获取尺寸值
   */
  private getSizeValue(): number {
    const sizes = { small: 40, medium: 48, large: 56 };
    return sizes[this.config.size];
  }

  /**
   * 获取主题颜色
   */
  private getThemeColors() {
    return {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      activeBackground: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    };
  }

  /**
   * 获取徽章图标
   */
  private getBadgeIcon(): string {
    const size = this.getSizeValue() * 0.6;
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
      </svg>
    `;
  }

  /**
   * 附加到页面
   */
  private attachToPage(): void {
    if (!this.wrapper) return;

    // 移除旧实例
    const existing = document.querySelector('.lovsider-badge-wrapper');
    if (existing) {
      existing.remove();
    }

    document.body.appendChild(this.wrapper);
  }

  /**
   * 显示徽章
   */
  public show(): void {
    if (this.wrapper) {
      this.wrapper.style.display = 'block';
    }
  }

  /**
   * 隐藏徽章
   */
  public hide(): void {
    if (this.wrapper) {
      this.wrapper.style.display = 'none';
    }
  }

  /**
   * 切换显示/隐藏
   */
  public toggle(): void {
    if (this.wrapper) {
      const isHidden = this.wrapper.style.display === 'none';
      this.wrapper.style.display = isHidden ? 'block' : 'none';
    }
  }

  /**
   * 销毁组件
   */
  public destroy(): void {
    // 移除样式
    const style = document.getElementById('lovsider-badge-v4-styles');
    if (style) {
      style.remove();
    }

    // 移除DOM
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }

    this.inner = null;
    this.badge = null;
  }
}
