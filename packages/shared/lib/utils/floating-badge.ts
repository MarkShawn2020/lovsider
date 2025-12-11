/**
 * 悬浮徽章组件
 * 在页面边缘显示一个可点击的徽章，用于快速打开侧边栏
 */

import { EdgeSnappingManager } from './edge-snapping.js';
import { safeSendMessage } from './helpers.js';
import type { EdgeSnappingConfig } from './edge-snapping.js';

export interface FloatingBadgeConfig {
  position: 'left' | 'right' | 'top' | 'bottom';
  offset: { x: number; y: number };
  size: 'small' | 'medium' | 'large';
  theme: 'light' | 'dark' | 'auto';
  showTooltip: boolean;
  autoHide: boolean;
  autoHideDelay: number;
  enableDragging: boolean;
  enableSnapping: boolean;
  verticalDragOnly: boolean;
  opacity: number;
  customIcon?: string;
}

export interface FloatingBadgeState {
  visible: boolean;
  expanded: boolean;
  position: { x: number; y: number };
  lastInteraction: number;
  sidebarOpen: boolean;
}

export class FloatingBadge {
  private config: FloatingBadgeConfig;
  private state: FloatingBadgeState;
  private container: HTMLElement | null = null;
  private badge: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private snappingManager: EdgeSnappingManager | null = null;
  private hideTimeout: number | null = null;
  private isHovering: boolean = false;
  private onClickCallback: (() => void) | null = null;
  private isDragging: boolean = false;
  private dragStartPos: { x: number; y: number } | null = null;
  private dragThreshold: number = 5; // pixels

  private readonly defaultConfig: FloatingBadgeConfig = {
    position: 'right',
    offset: { x: 20, y: 100 },
    size: 'medium',
    theme: 'auto',
    showTooltip: true,
    autoHide: false,
    autoHideDelay: 3000,
    enableDragging: true,
    enableSnapping: true,
    verticalDragOnly: true,
    opacity: 0.9,
  };

  constructor(config?: Partial<FloatingBadgeConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    this.state = {
      visible: true,
      expanded: false,
      position: this.calculateInitialPosition(),
      lastInteraction: Date.now(),
      sidebarOpen: false,
    };
  }

  /**
   * 初始化并注入到页面
   */
  public init(): void {
    if (this.container) {
      console.warn('FloatingBadge 已经初始化');
      return;
    }

    this.createElements();
    this.attachToPage();
    this.setupEventListeners();

    if (this.config.enableSnapping && this.config.enableDragging) {
      this.setupSnapping();
      // 只在没有保存的位置时才自动吸附
      if (!this.state.position || (this.state.position.x === 0 && this.state.position.y === 0)) {
        setTimeout(() => {
          if (this.snappingManager) {
            this.snapToInitialEdge();
          }
        }, 100);
      }
    }

    if (this.config.autoHide) {
      this.startAutoHideTimer();
    }
  }

  /**
   * 创建 DOM 元素
   */
  private createElements(): void {
    // 创建容器
    this.container = document.createElement('div');
    this.container.id = 'lovpen-floating-badge-container';
    this.container.style.cssText = this.getContainerStyles();

    // 创建徽章
    this.badge = document.createElement('div');
    this.badge.id = 'lovpen-floating-badge';
    this.badge.style.cssText = this.getBadgeStyles();
    this.badge.innerHTML = this.getBadgeContent();

    // 创建工具提示
    if (this.config.showTooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.id = 'lovpen-floating-tooltip';
      this.tooltip.style.cssText = this.getTooltipStyles();
      this.tooltip.textContent = '打开 LovPen 侧边栏';
      this.tooltip.style.display = 'none';
      this.container.appendChild(this.tooltip);
    }

    this.container.appendChild(this.badge);
  }

  /**
   * 获取容器样式
   */
  private getContainerStyles(): string {
    const { x, y } = this.state.position;
    return `
      position: fixed;
      top: ${y}px;
      left: ${x}px;
      z-index: 2147483647;
      width: ${this.getSizeValue()}px;
      height: ${this.getSizeValue()}px;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
  }

  /**
   * 获取徽章样式
   */
  private getBadgeStyles(): string {
    const size = this.getSizeValue();
    const theme = this.getThemeColors();

    return `
      width: ${size}px;
      height: ${size}px;
      border-radius: ${size / 2}px;
      background: ${theme.background};
      color: ${theme.color};
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
      opacity: ${this.config.opacity};
      position: relative;
      user-select: none;
    `;
  }

  /**
   * 获取工具提示样式
   */
  private getTooltipStyles(): string {
    const theme = this.getThemeColors();
    const position = this.getTooltipPosition();

    return `
      position: absolute;
      ${position};
      background: ${theme.tooltipBg};
      color: ${theme.tooltipColor};
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 1;
    `;
  }

  /**
   * 获取徽章内容
   */
  private getBadgeContent(): string {
    if (this.config.customIcon) {
      return this.config.customIcon;
    }

    // 默认 LovPen 图标
    return `
      <svg width="${this.getSizeValue() * 0.6}" height="${this.getSizeValue() * 0.6}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
      </svg>
    `;
  }

  /**
   * 获取尺寸值
   */
  private getSizeValue(): number {
    const sizes = {
      small: 40,
      medium: 48,
      large: 56,
    };
    return sizes[this.config.size];
  }

  /**
   * 获取主题颜色
   */
  private getThemeColors(): {
    background: string;
    color: string;
    tooltipBg: string;
    tooltipColor: string;
  } {
    const isDark =
      this.config.theme === 'dark' ||
      (this.config.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      return {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#ffffff',
        tooltipBg: '#1a1a1a',
        tooltipColor: '#ffffff',
      };
    } else {
      return {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#ffffff',
        tooltipBg: '#333333',
        tooltipColor: '#ffffff',
      };
    }
  }

  /**
   * 获取工具提示位置
   */
  private getTooltipPosition(): string {
    switch (this.config.position) {
      case 'left':
        return 'left: 100%; margin-left: 10px; top: 50%; transform: translateY(-50%)';
      case 'right':
        return 'right: 100%; margin-right: 10px; top: 50%; transform: translateY(-50%)';
      case 'top':
        return 'top: 100%; margin-top: 10px; left: 50%; transform: translateX(-50%)';
      case 'bottom':
        return 'bottom: 100%; margin-bottom: 10px; left: 50%; transform: translateX(-50%)';
      default:
        return 'left: 100%; margin-left: 10px; top: 50%; transform: translateY(-50%)';
    }
  }

  /**
   * 计算初始位置
   */
  private calculateInitialPosition(): { x: number; y: number } {
    const size = this.getSizeValue();
    const { offset, position } = this.config;

    switch (position) {
      case 'left':
        return { x: offset.x, y: offset.y };
      case 'right':
        return { x: window.innerWidth - size - offset.x, y: offset.y };
      case 'top':
        return { x: offset.x, y: offset.y };
      case 'bottom':
        return { x: offset.x, y: window.innerHeight - size - offset.y };
      default:
        return { x: window.innerWidth - size - offset.x, y: offset.y };
    }
  }

  /**
   * 附加到页面
   */
  private attachToPage(): void {
    if (!this.container) return;

    // 检查是否已存在
    const existing = document.getElementById('lovpen-floating-badge-container');
    if (existing) {
      existing.remove();
    }

    document.body.appendChild(this.container);
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.badge) return;

    // 鼠标按下事件（记录起始位置）
    this.badge.addEventListener('mousedown', e => {
      this.dragStartPos = { x: e.clientX, y: e.clientY };
      this.isDragging = false;
    });

    // 鼠标移动事件（检测是否在拖动）
    this.badge.addEventListener('mousemove', e => {
      if (this.dragStartPos) {
        const dx = Math.abs(e.clientX - this.dragStartPos.x);
        const dy = Math.abs(e.clientY - this.dragStartPos.y);
        if (dx > this.dragThreshold || dy > this.dragThreshold) {
          this.isDragging = true;
        }
      }
    });

    // 点击事件（只在非拖动时触发）
    this.badge.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      // 如果是拖动操作，不触发点击
      if (!this.isDragging) {
        this.handleClick();
      }

      // 重置状态
      this.dragStartPos = null;
      this.isDragging = false;
    });

    // 悬停事件
    this.badge.addEventListener('mouseenter', () => {
      this.handleMouseEnter();
    });

    this.badge.addEventListener('mouseleave', () => {
      this.handleMouseLeave();
    });

    // 窗口大小变化
    window.addEventListener('resize', () => {
      this.handleResize();
    });

    // 主题变化
    if (this.config.theme === 'auto') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        this.updateTheme();
      });
    }
  }

  /**
   * 设置边缘吸附
   */
  private setupSnapping(): void {
    if (!this.container) return;

    // 如果启用垂直拖拽，自定义处理
    if (this.config.verticalDragOnly) {
      this.setupVerticalDragging();
    } else {
      const snappingConfig: Partial<EdgeSnappingConfig> = {
        snapDistance: 50,
        animationDuration: 200,
        edgeOffset: this.config.offset.x,
        enableSnapping: this.config.enableSnapping,
        enableDragging: this.config.enableDragging,
        constrainToViewport: true,
      };

      this.snappingManager = new EdgeSnappingManager(this.container, snappingConfig);

      // 监听拖动事件
      this.snappingManager.onDragStart(() => {
        // 拖动开始时记录
        this.isDragging = true;

        if (this.badge) {
          this.badge.style.transform = 'scale(0.9)';
          this.badge.style.opacity = '0.7';
        }
        this.hideTooltip();
      });

      this.snappingManager.onDragEnd((snapped, edge) => {
        // 拖动结束后重置
        setTimeout(() => {
          this.isDragging = false;
          this.dragStartPos = null;
        }, 100);

        if (this.badge) {
          this.badge.style.transform = 'scale(1)';
          this.badge.style.opacity = String(this.config.opacity);
        }

        // 保存新位置
        if (this.container) {
          const rect = this.container.getBoundingClientRect();
          this.state.position = { x: rect.left, y: rect.top };
          this.saveState();
        }
      });
    }
  }

  /**
   * 设置垂直拖动
   */
  private setupVerticalDragging(): void {
    if (!this.container || !this.badge) return;

    let isDragging = false;
    let startY = 0;
    let elementStartY = 0;
    let fixedX = this.state.position.x; // 固定X坐标

    const handleMouseDown = (e: MouseEvent) => {
      if (!this.config.enableDragging) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = this.container!.getBoundingClientRect();
      isDragging = true;
      startY = e.clientY;
      elementStartY = rect.top;
      fixedX = rect.left; // 记录当前X位置

      // 拖动开始效果
      this.isDragging = true;
      if (this.badge) {
        this.badge.style.transform = 'scale(0.9)';
        this.badge.style.opacity = '0.7';
        this.badge.style.cursor = 'ns-resize';
      }
      this.hideTooltip();

      // 移除过渡效果
      this.container!.style.transition = 'none';

      // 防止文本选择
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaY = e.clientY - startY;
      let newY = elementStartY + deltaY;

      // 限制在视窗内
      const rect = this.container!.getBoundingClientRect();
      const maxY = window.innerHeight - rect.height;
      newY = Math.max(0, Math.min(newY, maxY));

      // 只更新Y坐标，X坐标保持不变
      this.container!.style.left = `${fixedX}px`;
      this.container!.style.top = `${newY}px`;
    };

    const handleMouseUp = () => {
      if (!isDragging) return;

      isDragging = false;
      this.isDragging = false;

      // 恢复过渡效果
      this.container!.style.transition = 'all 200ms ease-out';

      // 恢复样式
      if (this.badge) {
        this.badge.style.transform = 'scale(1)';
        this.badge.style.opacity = String(this.config.opacity);
        this.badge.style.cursor = 'pointer';
      }

      // 恢复文本选择
      document.body.style.userSelect = '';

      // 保存新位置
      const rect = this.container!.getBoundingClientRect();
      this.state.position = { x: rect.left, y: rect.top };
      this.saveState();

      // 如果启用吸附，检查是否需要吸附到顶部或底部
      if (this.config.enableSnapping) {
        const size = this.getSizeValue();
        const topDistance = rect.top;
        const bottomDistance = window.innerHeight - rect.bottom;
        const snapDistance = 50;

        if (topDistance < snapDistance) {
          // 吸附到顶部
          this.container!.style.top = `${this.config.offset.y}px`;
          this.state.position.y = this.config.offset.y;
          this.saveState();
        } else if (bottomDistance < snapDistance) {
          // 吸附到底部
          const newY = window.innerHeight - size - this.config.offset.y;
          this.container!.style.top = `${newY}px`;
          this.state.position.y = newY;
          this.saveState();
        }
      }
    };

    // 鼠标事件
    this.badge.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // 触摸事件支持
    const handleTouchStart = (e: TouchEvent) => {
      if (!this.config.enableDragging) return;

      e.preventDefault();
      const touch = e.touches[0];
      const rect = this.container!.getBoundingClientRect();

      isDragging = true;
      startY = touch.clientY;
      elementStartY = rect.top;
      fixedX = rect.left;

      // 拖动开始效果
      this.isDragging = true;
      if (this.badge) {
        this.badge.style.transform = 'scale(0.9)';
        this.badge.style.opacity = '0.7';
      }
      this.hideTooltip();

      this.container!.style.transition = 'none';
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;

      e.preventDefault();
      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;
      let newY = elementStartY + deltaY;

      // 限制在视窗内
      const rect = this.container!.getBoundingClientRect();
      const maxY = window.innerHeight - rect.height;
      newY = Math.max(0, Math.min(newY, maxY));

      // 只更新Y坐标
      this.container!.style.left = `${fixedX}px`;
      this.container!.style.top = `${newY}px`;
    };

    const handleTouchEnd = () => {
      if (!isDragging) return;
      handleMouseUp();
    };

    this.badge.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    // 保存清理函数
    (this as any).cleanupVerticalDrag = () => {
      this.badge?.removeEventListener('mousedown', handleMouseDown);
      this.badge?.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }

  /**
   * 初始化时吸附到边缘
   */
  private snapToInitialEdge(): void {
    if (!this.snappingManager || !this.container) return;

    // 根据配置的位置决定吸附到哪个边缘
    let targetEdge: 'top' | 'right' | 'bottom' | 'left' = 'right';

    switch (this.config.position) {
      case 'left':
        targetEdge = 'left';
        break;
      case 'right':
        targetEdge = 'right';
        break;
      case 'top':
        targetEdge = 'top';
        break;
      case 'bottom':
        targetEdge = 'bottom';
        break;
    }

    // 使用snappingManager的snapToEdge方法
    this.snappingManager.snapToEdge(targetEdge);
  }

  /**
   * 处理点击事件
   */
  private handleClick(): void {
    this.state.lastInteraction = Date.now();

    // 添加点击动画
    if (this.badge) {
      this.badge.style.transform = 'scale(0.95)';
      setTimeout(() => {
        if (this.badge) {
          this.badge.style.transform = 'scale(1)';
        }
      }, 100);
    }

    // 触发回调
    if (this.onClickCallback) {
      this.onClickCallback();
    } else {
      // 默认行为：切换侧边栏
      this.toggleSidebar();
    }
  }

  /**
   * 切换侧边栏
   */
  private toggleSidebar(): void {
    // 切换状态
    this.state.sidebarOpen = !this.state.sidebarOpen;

    // 发送消息到 background script
    safeSendMessage({
      action: this.state.sidebarOpen ? 'openSidePanel' : 'closeSidePanel',
      source: 'floating-badge',
    });

    // 更新徽章样式以反映状态
    if (this.badge) {
      if (this.state.sidebarOpen) {
        this.badge.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
      } else {
        const theme = this.getThemeColors();
        this.badge.style.background = theme.background;
      }
    }

    // 更新工具提示
    if (this.tooltip) {
      this.tooltip.textContent = this.state.sidebarOpen ? '关闭 LovPen 侧边栏' : '打开 LovPen 侧边栏';
    }
  }

  /**
   * 处理鼠标进入
   */
  private handleMouseEnter(): void {
    this.isHovering = true;

    // 显示工具提示
    if (this.tooltip && this.config.showTooltip) {
      this.tooltip.style.display = 'block';
      setTimeout(() => {
        if (this.tooltip) {
          this.tooltip.style.opacity = '1';
        }
      }, 10);
    }

    // 放大效果
    if (this.badge) {
      this.badge.style.transform = 'scale(1.1)';
      this.badge.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    }

    // 停止自动隐藏
    if (this.config.autoHide && this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // 如果已隐藏，显示
    if (!this.state.visible) {
      this.show();
    }
  }

  /**
   * 处理鼠标离开
   */
  private handleMouseLeave(): void {
    this.isHovering = false;

    // 隐藏工具提示
    this.hideTooltip();

    // 恢复大小
    if (this.badge) {
      this.badge.style.transform = 'scale(1)';
      this.badge.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    }

    // 重新开始自动隐藏计时
    if (this.config.autoHide) {
      this.startAutoHideTimer();
    }
  }

  /**
   * 隐藏工具提示
   */
  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.style.opacity = '0';
      setTimeout(() => {
        if (this.tooltip) {
          this.tooltip.style.display = 'none';
        }
      }, 200);
    }
  }

  /**
   * 处理窗口大小变化
   */
  private handleResize(): void {
    // 调整位置以保持在视窗内
    if (this.container && !this.config.enableDragging) {
      const rect = this.container.getBoundingClientRect();
      const size = this.getSizeValue();

      let { x, y } = this.state.position;

      // 确保不超出视窗
      x = Math.max(0, Math.min(x, window.innerWidth - size));
      y = Math.max(0, Math.min(y, window.innerHeight - size));

      this.state.position = { x, y };
      this.container.style.left = `${x}px`;
      this.container.style.top = `${y}px`;
    }
  }

  /**
   * 更新主题
   */
  private updateTheme(): void {
    if (!this.badge) return;

    const theme = this.getThemeColors();
    this.badge.style.background = theme.background;
    this.badge.style.color = theme.color;

    if (this.tooltip) {
      this.tooltip.style.background = theme.tooltipBg;
      this.tooltip.style.color = theme.tooltipColor;
    }
  }

  /**
   * 开始自动隐藏计时器
   */
  private startAutoHideTimer(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    this.hideTimeout = window.setTimeout(() => {
      if (!this.isHovering) {
        this.hide();
      }
    }, this.config.autoHideDelay);
  }

  /**
   * 显示徽章
   */
  public show(): void {
    if (!this.container) return;

    this.state.visible = true;
    this.container.style.display = 'block';

    setTimeout(() => {
      if (this.container) {
        this.container.style.opacity = '1';
      }
    }, 10);

    if (this.config.autoHide) {
      this.startAutoHideTimer();
    }
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
    }, 300);
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
  public updateConfig(config: Partial<FloatingBadgeConfig>): void {
    this.config = { ...this.config, ...config };

    // 重新应用样式
    if (this.badge) {
      this.badge.style.cssText = this.getBadgeStyles();
      this.badge.innerHTML = this.getBadgeContent();
    }

    // 更新吸附配置
    if (this.snappingManager) {
      this.snappingManager.updateConfig({
        enableSnapping: this.config.enableSnapping,
        enableDragging: this.config.enableDragging,
        edgeOffset: this.config.offset.x,
      });
    }
  }

  /**
   * 设置点击回调
   */
  public onClick(callback: () => void): void {
    this.onClickCallback = callback;
  }

  /**
   * 更新侧边栏状态
   */
  public updateSidebarState(isOpen: boolean): void {
    this.state.sidebarOpen = isOpen;

    // 更新徽章样式
    if (this.badge) {
      if (isOpen) {
        this.badge.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
      } else {
        const theme = this.getThemeColors();
        this.badge.style.background = theme.background;
      }
    }

    // 更新工具提示
    if (this.tooltip) {
      this.tooltip.textContent = isOpen ? '关闭 LovPen 侧边栏' : '打开 LovPen 侧边栏';
    }
  }

  /**
   * 保存状态
   */
  private saveState(): void {
    // 发送消息保存状态
    safeSendMessage({
      action: 'saveFloatingBadgeState',
      state: this.state,
    });
  }

  /**
   * 加载状态
   */
  public async loadState(): Promise<void> {
    try {
      const response = await safeSendMessage<{ state: FloatingBadgeState | null }>({
        action: 'getFloatingBadgeState',
      });

      if (response && response.state) {
        this.state = response.state;

        // 应用位置
        if (this.container) {
          this.container.style.left = `${this.state.position.x}px`;
          this.container.style.top = `${this.state.position.y}px`;
        }

        // 应用可见性
        if (this.state.visible) {
          this.show();
        } else {
          this.hide();
        }
      }
    } catch (error) {
      console.error('加载悬浮徽章状态失败:', error);
    }
  }

  /**
   * 销毁组件
   */
  public destroy(): void {
    // 清除计时器
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // 清理垂直拖动事件
    if ((this as any).cleanupVerticalDrag) {
      (this as any).cleanupVerticalDrag();
    }

    // 销毁吸附管理器
    if (this.snappingManager) {
      this.snappingManager.destroy();
      this.snappingManager = null;
    }

    // 移除 DOM
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.badge = null;
    this.tooltip = null;
    this.onClickCallback = null;
  }
}

/**
 * 创建并初始化悬浮徽章
 */
export function createFloatingBadge(config?: Partial<FloatingBadgeConfig>): FloatingBadge {
  const badge = new FloatingBadge(config);
  badge.init();
  return badge;
}
