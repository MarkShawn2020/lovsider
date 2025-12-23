/**
 * 悬浮徽章组件 V3 - 使用 CSS 边缘定位
 * 彻底解决视窗变化时的位置问题
 */

export interface FloatingBadgeV3Config {
  edge: 'left' | 'right' | 'top' | 'bottom';
  edgeOffset: number; // 距离边缘的偏移
  verticalPosition?: number; // 垂直位置（对于左右边缘）
  horizontalPosition?: number; // 水平位置（对于上下边缘）
  size: 'small' | 'medium' | 'large';
  theme: 'light' | 'dark' | 'auto';
  showTooltip: boolean;
  enableDragging: boolean;
  opacity: number;
  customIcon?: string;
}

export interface FloatingBadgeV3State {
  visible: boolean;
  sidebarOpen: boolean;
  currentEdge: 'left' | 'right' | 'top' | 'bottom';
  isDragging: boolean;
  dragOffset?: { x: number; y: number };
}

export class FloatingBadgeV3 {
  private config: FloatingBadgeV3Config;
  private state: FloatingBadgeV3State;
  private container: HTMLElement | null = null;
  private badge: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;

  // 拖动相关
  private dragData = {
    startX: 0,
    startY: 0,
    elementStartX: 0,
    elementStartY: 0,
    hasMoved: false,
    moveThreshold: 3,
  };

  private readonly defaultConfig: FloatingBadgeV3Config = {
    edge: 'right',
    edgeOffset: 20,
    verticalPosition: 100,
    size: 'medium',
    theme: 'auto',
    showTooltip: true,
    enableDragging: true,
    opacity: 0.9,
  };

  constructor(config?: Partial<FloatingBadgeV3Config>) {
    this.config = { ...this.defaultConfig, ...config };
    this.state = {
      visible: true,
      sidebarOpen: false,
      currentEdge: this.config.edge,
      isDragging: false,
    };
  }

  /**
   * 初始化组件
   */
  public init(): void {
    if (this.container) {
      console.warn('[FloatingBadgeV3] 已经初始化');
      return;
    }

    this.createElements();
    this.attachToPage();
    this.setupEventListeners();
    this.applyEdgePosition();
  }

  /**
   * 创建 DOM 元素
   */
  private createElements(): void {
    // 主容器
    this.container = document.createElement('div');
    this.container.id = 'lovsider-floating-badge-v3';
    this.container.className = 'lovsider-floating-badge-container';
    this.applyContainerStyles();

    // 徽章按钮
    this.badge = document.createElement('button');
    this.badge.id = 'lovsider-floating-badge-button';
    this.badge.className = 'lovsider-floating-badge';
    this.badge.setAttribute('aria-label', '打开 Lovsider 侧边栏');
    this.applyBadgeStyles();
    this.badge.innerHTML = this.getBadgeContent();

    // 工具提示
    if (this.config.showTooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'lovsider-floating-tooltip';
      this.tooltip.textContent = '打开 Lovsider 侧边栏';
      this.applyTooltipStyles();
      this.container.appendChild(this.tooltip);
    }

    this.container.appendChild(this.badge);
  }

  /**
   * 应用容器样式
   */
  private applyContainerStyles(): void {
    if (!this.container) return;

    const size = this.getSizeValue();

    // 基础样式 - 确保容器位置稳定
    this.container.style.cssText = `
      position: fixed;
      width: ${size}px;
      height: ${size}px;
      z-index: 2147483647;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      transition: none; /* 移除容器的过渡效果，只在拖动结束时添加 */
      will-change: transform; /* 优化性能 */
      contain: layout style; /* 完全隔离布局和样式影响 */
      isolation: isolate; /* 创建新的堆叠上下文 */
      transform: translateZ(0); /* 启用硬件加速 */
      backface-visibility: hidden; /* 防止闪烁 */
      -webkit-backface-visibility: hidden;
    `;
  }

  /**
   * 应用边缘定位
   */
  private applyEdgePosition(): void {
    if (!this.container) return;

    const edge = this.state.currentEdge;
    const offset = this.config.edgeOffset;
    const size = this.getSizeValue();

    // 清除所有定位
    this.container.style.left = '';
    this.container.style.right = '';
    this.container.style.top = '';
    this.container.style.bottom = '';
    this.container.style.transform = '';

    // 根据边缘设置定位
    switch (edge) {
      case 'right':
        this.container.style.right = `${offset}px`;
        this.container.style.top = `${this.config.verticalPosition || 100}px`;
        this.container.classList.remove('snap-left', 'snap-top', 'snap-bottom');
        this.container.classList.add('snap-right');
        break;

      case 'left':
        this.container.style.left = `${offset}px`;
        this.container.style.top = `${this.config.verticalPosition || 100}px`;
        this.container.classList.remove('snap-right', 'snap-top', 'snap-bottom');
        this.container.classList.add('snap-left');
        break;

      case 'top':
        this.container.style.top = `${offset}px`;
        this.container.style.left = `${this.config.horizontalPosition || window.innerWidth / 2 - size / 2}px`;
        this.container.classList.remove('snap-left', 'snap-right', 'snap-bottom');
        this.container.classList.add('snap-top');
        break;

      case 'bottom':
        this.container.style.bottom = `${offset}px`;
        this.container.style.left = `${this.config.horizontalPosition || window.innerWidth / 2 - size / 2}px`;
        this.container.classList.remove('snap-left', 'snap-right', 'snap-top');
        this.container.classList.add('snap-bottom');
        break;
    }
  }

  /**
   * 应用徽章样式
   */
  private applyBadgeStyles(): void {
    if (!this.badge) return;

    const size = this.getSizeValue();
    const theme = this.getThemeColors();

    this.badge.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      border-radius: ${size / 2}px;
      background: ${this.state.sidebarOpen ? theme.activeBackground : theme.background};
      color: ${theme.color};
      border: none;
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: ${this.config.enableDragging ? 'grab' : 'pointer'};
      pointer-events: auto;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      opacity: ${this.config.opacity};
      transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
      position: relative;
      outline: none;
      transform-origin: center center; /* 关键：确保从中心缩放 */
      backface-visibility: hidden; /* 防止闪烁 */
      -webkit-backface-visibility: hidden;
      will-change: transform; /* 优化性能 */
    `;
  }

  /**
   * 应用工具提示样式
   */
  private applyTooltipStyles(): void {
    if (!this.tooltip) return;

    const theme = this.getThemeColors();

    this.tooltip.style.cssText = `
      position: absolute;
      background: ${theme.tooltipBg};
      color: ${theme.tooltipColor};
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      white-space: nowrap;
      pointer-events: none !important; /* 强制不可交互 */
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 10;
      contain: layout style; /* 隔离影响 */
      will-change: opacity; /* 只优化透明度变化 */
      ${this.getTooltipPosition()}
    `;
  }

  /**
   * 获取工具提示位置
   */
  private getTooltipPosition(): string {
    switch (this.state.currentEdge) {
      case 'left':
        // 徽章在左边，工具提示在右边
        return 'left: 100%; margin-left: 10px; top: 50%; transform: translateY(-50%)';
      case 'right':
        // 徽章在右边，工具提示在左边
        return 'left: auto; right: calc(100% + 10px); top: 50%; transform: translateY(-50%)';
      case 'top':
        // 徽章在顶部，工具提示在下方
        return 'top: 100%; margin-top: 10px; left: 50%; transform: translateX(-50%)';
      case 'bottom':
        // 徽章在底部，工具提示在上方
        return 'bottom: 100%; margin-bottom: 10px; left: 50%; transform: translateX(-50%)';
      default:
        return 'left: 100%; margin-left: 10px; top: 50%; transform: translateY(-50%)';
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.badge || !this.container) return;

    // 使用 Pointer Events API
    this.badge.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.badge.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.badge.addEventListener('pointerup', this.handlePointerUp.bind(this));
    this.badge.addEventListener('pointercancel', this.handlePointerCancel.bind(this));

    // 悬停效果
    this.badge.addEventListener('pointerenter', this.handlePointerEnter.bind(this));
    this.badge.addEventListener('pointerleave', this.handlePointerLeave.bind(this));

    // 防止默认的拖动行为
    this.badge.addEventListener('dragstart', e => e.preventDefault());
  }

  /**
   * 指针按下事件
   */
  private handlePointerDown(e: PointerEvent): void {
    if (!this.config.enableDragging || !this.container) return;

    const rect = this.container.getBoundingClientRect();
    this.dragData = {
      startX: e.clientX,
      startY: e.clientY,
      elementStartX: rect.left,
      elementStartY: rect.top,
      hasMoved: false,
      moveThreshold: 3,
    };

    this.badge?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  /**
   * 指针移动事件
   */
  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragData || !this.container) return;

    const dx = e.clientX - this.dragData.startX;
    const dy = e.clientY - this.dragData.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > this.dragData.moveThreshold) {
      this.dragData.hasMoved = true;

      if (!this.state.isDragging) {
        this.startDragging();
      }

      // 拖动时使用 transform 而不是改变定位
      this.container.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  /**
   * 指针释放事件
   */
  private handlePointerUp(e: PointerEvent): void {
    if (!this.dragData) return;

    const wasDragging = this.state.isDragging;

    this.badge?.releasePointerCapture(e.pointerId);

    if (wasDragging) {
      this.endDragging();
    } else if (!this.dragData.hasMoved) {
      this.handleClick();
    }

    this.dragData.hasMoved = false;
  }

  /**
   * 指针取消事件
   */
  private handlePointerCancel(e: PointerEvent): void {
    this.handlePointerUp(e);
  }

  /**
   * 开始拖动
   */
  private startDragging(): void {
    this.state.isDragging = true;

    if (this.badge) {
      this.badge.style.cursor = 'grabbing';
      this.badge.style.opacity = '0.8';
    }

    if (this.tooltip) {
      this.tooltip.style.opacity = '0';
    }
  }

  /**
   * 结束拖动
   */
  private endDragging(): void {
    if (!this.container) return;

    // 获取当前实际位置
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // 判断最近的边缘
    const distances = {
      left: centerX,
      right: window.innerWidth - centerX,
      top: centerY,
      bottom: window.innerHeight - centerY,
    };

    let nearestEdge = this.state.currentEdge;
    let minDistance = Infinity;

    for (const [edge, distance] of Object.entries(distances)) {
      if (distance < minDistance) {
        minDistance = distance;
        nearestEdge = edge as typeof nearestEdge;
      }
    }

    // 添加过渡效果用于吸附动画
    this.container.style.transition = 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)';

    // 清除 transform
    this.container.style.transform = '';

    // 更新边缘和位置
    this.state.currentEdge = nearestEdge;

    // 保存垂直或水平位置
    if (nearestEdge === 'left' || nearestEdge === 'right') {
      this.config.verticalPosition = rect.top;
    } else {
      this.config.horizontalPosition = rect.left;
    }

    // 应用新的边缘定位
    this.applyEdgePosition();

    // 动画结束后移除过渡效果
    setTimeout(() => {
      if (this.container) {
        this.container.style.transition = 'none';
      }
    }, 200);

    // 恢复状态
    this.state.isDragging = false;
    if (this.badge) {
      this.badge.style.cursor = this.config.enableDragging ? 'grab' : 'pointer';
      this.badge.style.opacity = String(this.config.opacity);
    }

    // 保存状态
    this.saveState();
  }

  /**
   * 处理点击
   */
  private handleClick(): void {
    if (this.badge) {
      // 使用3D变换和更微妙的点击反馈
      this.badge.style.transform = 'scale3d(0.95, 0.95, 1)';
      setTimeout(() => {
        if (this.badge) {
          // 恢复到正常大小
          this.badge.style.transform = 'scale3d(1, 1, 1)';
        }
      }, 100);
    }

    this.toggleSidebar();
  }

  /**
   * 切换侧边栏
   */
  private toggleSidebar(): void {
    this.state.sidebarOpen = !this.state.sidebarOpen;

    // 更新样式
    if (this.badge) {
      const theme = this.getThemeColors();
      this.badge.style.background = this.state.sidebarOpen ? theme.activeBackground : theme.background;
    }

    if (this.tooltip) {
      this.tooltip.textContent = this.state.sidebarOpen ? '关闭 Lovsider 侧边栏' : '打开 Lovsider 侧边栏';
    }

    // 发送消息
    chrome.runtime.sendMessage({
      action: this.state.sidebarOpen ? 'openSidePanel' : 'closeSidePanel',
      source: 'floating-badge-v3',
    });
  }

  /**
   * 更新侧边栏状态
   */
  public updateSidebarState(isOpen: boolean): void {
    this.state.sidebarOpen = isOpen;

    if (this.badge) {
      const theme = this.getThemeColors();
      this.badge.style.background = isOpen ? theme.activeBackground : theme.background;
    }

    if (this.tooltip) {
      this.tooltip.textContent = isOpen ? '关闭 Lovsider 侧边栏' : '打开 Lovsider 侧边栏';
    }

    // V3 不需要重新定位，CSS 自动处理
  }

  /**
   * 指针进入事件
   */
  private handlePointerEnter(): void {
    // 只在非拖动状态下执行hover效果
    if (this.state.isDragging) return;

    if (this.badge) {
      // 使用transform3d启用硬件加速，确保从中心缩放
      this.badge.style.transform = 'scale3d(1.08, 1.08, 1)';
      this.badge.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    }

    if (this.tooltip) {
      // 延迟显示工具提示，避免闪烁
      requestAnimationFrame(() => {
        if (this.tooltip && !this.state.isDragging) {
          this.tooltip.style.opacity = '1';
        }
      });
    }
  }

  /**
   * 指针离开事件
   */
  private handlePointerLeave(): void {
    if (this.badge && !this.state.isDragging) {
      // 恢复徽章大小，使用3D变换保持硬件加速
      this.badge.style.transform = 'scale3d(1, 1, 1)';
      this.badge.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    }

    if (this.tooltip) {
      // 立即隐藏工具提示
      this.tooltip.style.opacity = '0';
    }
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
    const isDark =
      this.config.theme === 'dark' ||
      (this.config.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    return {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      activeBackground: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      color: '#ffffff',
      tooltipBg: isDark ? '#1a1a1a' : '#333333',
      tooltipColor: '#ffffff',
    };
  }

  /**
   * 获取徽章内容
   */
  private getBadgeContent(): string {
    if (this.config.customIcon) {
      return this.config.customIcon;
    }

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
    if (!this.container) return;

    const existing = document.getElementById('lovsider-floating-badge-v3');
    if (existing) {
      existing.remove();
    }

    document.body.appendChild(this.container);
  }

  /**
   * 保存状态
   */
  private saveState(): void {
    chrome.runtime.sendMessage({
      action: 'saveFloatingBadgeState',
      state: {
        visible: this.state.visible,
        edge: this.state.currentEdge,
        verticalPosition: this.config.verticalPosition,
        horizontalPosition: this.config.horizontalPosition,
        sidebarOpen: this.state.sidebarOpen,
      },
    });
  }

  /**
   * 加载状态
   */
  public async loadState(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getFloatingBadgeState',
      });

      if (response?.state) {
        if (response.state.edge) {
          this.state.currentEdge = response.state.edge;
        }

        if (response.state.verticalPosition !== undefined) {
          this.config.verticalPosition = response.state.verticalPosition;
        }

        if (response.state.horizontalPosition !== undefined) {
          this.config.horizontalPosition = response.state.horizontalPosition;
        }

        if (response.state.sidebarOpen !== undefined) {
          this.state.sidebarOpen = response.state.sidebarOpen;
        }

        // 应用加载的状态
        this.applyEdgePosition();
        this.updateSidebarState(this.state.sidebarOpen);
      }
    } catch (error) {
      console.error('[FloatingBadgeV3] 加载状态失败:', error);
    }
  }

  /**
   * 显示徽章
   */
  public show(): void {
    if (!this.container) return;

    this.state.visible = true;
    this.container.style.display = 'block';

    requestAnimationFrame(() => {
      if (this.container) {
        this.container.style.opacity = '1';
      }
    });
  }

  /**
   * 隐藏徽章
   */
  public hide(): void {
    if (!this.container) return;

    this.state.visible = false;
    this.container.style.opacity = '0';

    setTimeout(() => {
      if (this.container && !this.state.visible) {
        this.container.style.display = 'none';
      }
    }, 200);
  }

  /**
   * 切换显示/隐藏
   */
  public toggle(): void {
    if (this.state.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<FloatingBadgeV3Config>): void {
    this.config = { ...this.config, ...config };

    // 重新应用样式和位置
    this.applyContainerStyles();
    this.applyBadgeStyles();
    this.applyTooltipStyles();
    this.applyEdgePosition();
  }

  /**
   * 销毁组件
   */
  public destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.badge = null;
    this.tooltip = null;
  }
}

/**
 * 创建并初始化悬浮徽章 V3
 */
export function createFloatingBadgeV3(config?: Partial<FloatingBadgeV3Config>): FloatingBadgeV3 {
  const badge = new FloatingBadgeV3(config);
  badge.init();
  return badge;
}
