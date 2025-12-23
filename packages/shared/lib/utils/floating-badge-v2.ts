/**
 * 悬浮徽章组件 V2 - 优化版本
 * 使用更专业的拖动处理和事件管理
 */

export interface FloatingBadgeV2Config {
  position: 'left' | 'right' | 'top' | 'bottom';
  offset: { x: number; y: number };
  size: 'small' | 'medium' | 'large';
  theme: 'light' | 'dark' | 'auto';
  showTooltip: boolean;
  autoHide: boolean;
  autoHideDelay: number;
  enableDragging: boolean;
  enableSnapping: boolean;
  snapDistance: number;
  animationDuration: number;
  opacity: number;
  customIcon?: string;
}

export interface FloatingBadgeV2State {
  visible: boolean;
  sidebarOpen: boolean;
  position: { x: number; y: number };
  isDragging: boolean;
  dragStart: { x: number; y: number; time: number } | null;
}

export class FloatingBadgeV2 {
  private config: FloatingBadgeV2Config;
  private state: FloatingBadgeV2State;
  private container: HTMLElement | null = null;
  private badge: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;

  // 拖动相关
  private dragData = {
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    hasMoved: false,
    moveThreshold: 3, // 移动阈值（像素）
  };

  // 动画相关
  private animationFrame: number | null = null;
  private transitionTimeout: number | null = null;

  private readonly defaultConfig: FloatingBadgeV2Config = {
    position: 'right',
    offset: { x: 20, y: 100 },
    size: 'medium',
    theme: 'auto',
    showTooltip: true,
    autoHide: false,
    autoHideDelay: 3000,
    enableDragging: true,
    enableSnapping: true,
    snapDistance: 40,
    animationDuration: 200,
    opacity: 0.9,
  };

  constructor(config?: Partial<FloatingBadgeV2Config>) {
    this.config = { ...this.defaultConfig, ...config };
    this.state = {
      visible: true,
      sidebarOpen: false,
      position: this.calculateInitialPosition(),
      isDragging: false,
      dragStart: null,
    };
  }

  /**
   * 初始化组件
   */
  public init(): void {
    if (this.container) {
      console.warn('[FloatingBadgeV2] 已经初始化');
      return;
    }

    this.createElements();
    this.attachToPage();
    this.setupEventListeners();

    // 只有在首次初始化且没有保存位置时才吸附
    const needsInitialSnap =
      this.config.enableSnapping &&
      this.state.position.x === this.calculateInitialPosition().x &&
      this.state.position.y === this.calculateInitialPosition().y;

    if (needsInitialSnap) {
      // 延迟吸附，让页面先渲染
      requestAnimationFrame(() => {
        this.snapToNearestEdge(false); // 初始吸附不需要动画
      });
    }
  }

  /**
   * 创建 DOM 元素
   */
  private createElements(): void {
    // 主容器
    this.container = document.createElement('div');
    this.container.id = 'lovsider-floating-badge-v2';
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

    const { x, y } = this.state.position;
    const size = this.getSizeValue();

    this.container.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      z-index: 2147483647;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    `;
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
    `;

    // 拖动时的样式
    if (this.state.isDragging) {
      this.badge.style.cursor = 'grabbing';
      this.badge.style.transform = 'scale(0.95)';
      this.badge.style.opacity = '0.8';
    }
  }

  /**
   * 应用工具提示样式
   */
  private applyTooltipStyles(): void {
    if (!this.tooltip) return;

    const theme = this.getThemeColors();
    const position = this.getTooltipPosition();

    this.tooltip.style.cssText = `
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
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 1;
    `;
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.badge || !this.container) return;

    // 使用 Pointer Events API 处理统一的输入
    this.badge.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.badge.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.badge.addEventListener('pointerup', this.handlePointerUp.bind(this));
    this.badge.addEventListener('pointercancel', this.handlePointerCancel.bind(this));

    // 悬停效果
    this.badge.addEventListener('pointerenter', this.handlePointerEnter.bind(this));
    this.badge.addEventListener('pointerleave', this.handlePointerLeave.bind(this));

    // 防止默认的拖动行为
    this.badge.addEventListener('dragstart', e => e.preventDefault());

    // 窗口调整
    window.addEventListener('resize', this.handleWindowResize.bind(this));
  }

  /**
   * 指针按下事件
   */
  private handlePointerDown(e: PointerEvent): void {
    if (!this.config.enableDragging || !this.container) return;

    // 记录开始位置
    const rect = this.container.getBoundingClientRect();
    this.dragData = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      hasMoved: false,
      moveThreshold: 3,
    };

    this.state.dragStart = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };

    // 捕获指针
    this.badge?.setPointerCapture(e.pointerId);

    // 防止文本选择
    e.preventDefault();
  }

  /**
   * 指针移动事件
   */
  private handlePointerMove(e: PointerEvent): void {
    if (!this.state.dragStart || !this.container) return;

    const dx = e.clientX - this.dragData.startX;
    const dy = e.clientY - this.dragData.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 检查是否超过移动阈值
    if (distance > this.dragData.moveThreshold) {
      this.dragData.hasMoved = true;

      if (!this.state.isDragging) {
        this.startDragging();
      }

      // 计算新位置
      let newX = this.dragData.startLeft + dx;
      let newY = this.dragData.startTop + dy;

      // 限制在视窗内
      const size = this.getSizeValue();
      newX = Math.max(0, Math.min(newX, window.innerWidth - size));
      newY = Math.max(0, Math.min(newY, window.innerHeight - size));

      // 更新位置（拖动时不使用过渡动画）
      this.container.style.transition = 'none';
      this.container.style.left = `${newX}px`;
      this.container.style.top = `${newY}px`;

      this.state.position = { x: newX, y: newY };
    }
  }

  /**
   * 指针释放事件
   */
  private handlePointerUp(e: PointerEvent): void {
    if (!this.state.dragStart) return;

    const dragDuration = Date.now() - this.state.dragStart.time;
    const wasDragging = this.state.isDragging;

    // 释放指针
    this.badge?.releasePointerCapture(e.pointerId);

    // 如果是拖动，执行吸附
    if (wasDragging) {
      this.endDragging();

      if (this.config.enableSnapping) {
        // 延迟一帧执行吸附，确保过渡效果
        requestAnimationFrame(() => {
          this.snapToNearestEdge(true);
        });
      }
    }
    // 如果是点击（没有移动且时间较短）
    else if (!this.dragData.hasMoved && dragDuration < 300) {
      this.handleClick();
    }

    // 重置状态
    this.state.dragStart = null;
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
      this.badge.style.transform = 'scale(0.95)';
      this.badge.style.opacity = '0.8';
    }

    // 隐藏工具提示
    if (this.tooltip) {
      this.tooltip.style.opacity = '0';
    }
  }

  /**
   * 结束拖动
   */
  private endDragging(): void {
    this.state.isDragging = false;

    if (this.badge) {
      this.badge.style.cursor = this.config.enableDragging ? 'grab' : 'pointer';
      this.badge.style.transform = 'scale(1)';
      this.badge.style.opacity = String(this.config.opacity);
    }

    // 保存位置
    this.saveState();
  }

  /**
   * 处理点击
   */
  private handleClick(): void {
    // 点击动画
    if (this.badge) {
      this.badge.style.transform = 'scale(0.92)';
      setTimeout(() => {
        if (this.badge) {
          this.badge.style.transform = 'scale(1)';
        }
      }, 100);
    }

    // 切换侧边栏
    this.toggleSidebar();
  }

  /**
   * 切换侧边栏
   */
  private toggleSidebar(): void {
    // 如果侧边栏已经打开，提示用户手动关闭
    if (this.state.sidebarOpen) {
      // 创建提示元素
      this.showCloseTip();

      // 仍然尝试程序化关闭（可能会失败）
      chrome.runtime.sendMessage({
        action: 'closeSidePanel',
        source: 'floating-badge-v2',
      });

      // 延迟更新状态，给关闭操作一些时间
      setTimeout(() => {
        // 检查侧边栏是否真的关闭了
        // 如果没有关闭，状态会保持打开
        this.state.sidebarOpen = false;
        this.updateSidebarState(false);
      }, 500);
    } else {
      // 打开侧边栏
      this.state.sidebarOpen = true;
      this.updateSidebarState(true);

      chrome.runtime.sendMessage({
        action: 'openSidePanel',
        source: 'floating-badge-v2',
      });
    }
  }

  /**
   * 显示关闭提示
   */
  private showCloseTip(): void {
    // 创建提示元素
    const tip = document.createElement('div');
    tip.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483647;
      pointer-events: none;
      animation: fadeInOut 2s ease-in-out;
    `;
    tip.textContent = '请点击侧边栏外的区域或按 Esc 键关闭';

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; }
        20% { opacity: 1; }
        80% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    // 添加到页面
    document.body.appendChild(tip);

    // 2秒后移除
    setTimeout(() => {
      tip.remove();
      style.remove();
    }, 2000);
  }

  /**
   * 更新侧边栏状态
   */
  public updateSidebarState(isOpen: boolean): void {
    const wasOpen = this.state.sidebarOpen;
    this.state.sidebarOpen = isOpen;

    if (this.badge) {
      const theme = this.getThemeColors();
      this.badge.style.background = isOpen ? theme.activeBackground : theme.background;
    }

    if (this.tooltip) {
      this.tooltip.textContent = isOpen ? '关闭 Lovsider 侧边栏' : '打开 Lovsider 侧边栏';
    }

    // 当侧边栏状态改变时，重新检查位置并吸附
    // 侧边栏的打开/关闭会改变可用视窗宽度
    if (wasOpen !== isOpen && this.config.enableSnapping) {
      // 延迟执行，等待侧边栏动画完成
      setTimeout(() => {
        this.checkAndReposition();
      }, 300);
    }
  }

  /**
   * 检查位置并重新定位
   */
  private checkAndReposition(): void {
    if (!this.container) return;

    const rect = this.container.getBoundingClientRect();
    const size = this.getSizeValue();
    const currentX = rect.left;
    const currentY = rect.top;

    // 检查是否超出新的视窗边界
    const maxX = window.innerWidth - size;
    const maxY = window.innerHeight - size;

    let needsReposition = false;
    let newX = currentX;
    let newY = currentY;

    // 如果当前位置超出了视窗，需要重新定位
    if (currentX > maxX) {
      newX = maxX;
      needsReposition = true;
    }
    if (currentY > maxY) {
      newY = maxY;
      needsReposition = true;
    }

    // 如果接近边缘，触发吸附
    const edgeThreshold = this.config.snapDistance;
    const distances = {
      left: newX,
      right: window.innerWidth - (newX + size),
      top: newY,
      bottom: window.innerHeight - (newY + size),
    };

    // 找到最近的边缘
    const minDistance = Math.min(distances.left, distances.right, distances.top, distances.bottom);

    // 如果已经很接近边缘或需要重新定位，执行吸附
    if (minDistance < edgeThreshold || needsReposition) {
      // 先移动到安全位置
      if (needsReposition) {
        this.container.style.transition = 'none';
        this.container.style.left = `${newX}px`;
        this.container.style.top = `${newY}px`;
        this.state.position = { x: newX, y: newY };
      }

      // 然后执行吸附动画
      requestAnimationFrame(() => {
        this.snapToNearestEdge(true);
      });
    }
  }

  /**
   * 指针进入事件
   */
  private handlePointerEnter(): void {
    if (this.badge && !this.state.isDragging) {
      this.badge.style.transform = 'scale(1.08)';
      this.badge.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    }

    if (this.tooltip && !this.state.isDragging) {
      this.tooltip.style.opacity = '1';
    }
  }

  /**
   * 指针离开事件
   */
  private handlePointerLeave(): void {
    if (this.badge && !this.state.isDragging) {
      this.badge.style.transform = 'scale(1)';
      this.badge.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    }

    if (this.tooltip) {
      this.tooltip.style.opacity = '0';
    }
  }

  /**
   * 吸附到最近的边缘
   */
  private snapToNearestEdge(animate: boolean = true): void {
    if (!this.container) return;

    const rect = this.container.getBoundingClientRect();
    const size = this.getSizeValue();

    // 计算到各边缘的距离
    const distances = {
      left: rect.left,
      right: window.innerWidth - rect.right,
      top: rect.top,
      bottom: window.innerHeight - rect.bottom,
    };

    // 找到最近的边缘
    let minDistance = Infinity;
    let nearestEdge: 'left' | 'right' | 'top' | 'bottom' = 'right';

    // 显式检查每个边缘
    if (distances.left < minDistance) {
      minDistance = distances.left;
      nearestEdge = 'left';
    }
    if (distances.right < minDistance) {
      minDistance = distances.right;
      nearestEdge = 'right';
    }
    if (distances.top < minDistance) {
      minDistance = distances.top;
      nearestEdge = 'top';
    }
    if (distances.bottom < minDistance) {
      minDistance = distances.bottom;
      nearestEdge = 'bottom';
    }

    // 只在距离小于吸附阈值时吸附
    if (minDistance > this.config.snapDistance) {
      return;
    }

    // 计算吸附位置
    let newX = rect.left;
    let newY = rect.top;
    const offset = this.config.offset.x;

    switch (nearestEdge) {
      case 'left':
        newX = offset;
        break;
      case 'right':
        newX = window.innerWidth - size - offset;
        break;
      case 'top':
        newY = offset;
        break;
      case 'bottom':
        newY = window.innerHeight - size - offset;
        break;
    }

    // 应用过渡动画
    if (animate) {
      this.container.style.transition = `all ${this.config.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    } else {
      this.container.style.transition = 'none';
    }

    // 设置新位置
    this.container.style.left = `${newX}px`;
    this.container.style.top = `${newY}px`;

    this.state.position = { x: newX, y: newY };

    // 清除过渡
    if (animate) {
      if (this.transitionTimeout) {
        clearTimeout(this.transitionTimeout);
      }
      this.transitionTimeout = window.setTimeout(() => {
        if (this.container) {
          this.container.style.transition = 'none';
        }
      }, this.config.animationDuration);
    }
  }

  /**
   * 窗口大小调整
   */
  private handleWindowResize(): void {
    if (!this.container) return;

    // 使用统一的重新定位逻辑
    // 这会自动处理边界检查和吸附
    this.checkAndReposition();
  }

  /**
   * 计算初始位置
   */
  private calculateInitialPosition(): { x: number; y: number } {
    const size = this.getSizeValue();
    const { offset, position } = this.config;

    switch (position) {
      case 'left':
        return { x: offset.x, y: window.innerHeight / 2 - size / 2 };
      case 'right':
        return { x: window.innerWidth - size - offset.x, y: window.innerHeight / 2 - size / 2 };
      case 'top':
        return { x: window.innerWidth / 2 - size / 2, y: offset.y };
      case 'bottom':
        return { x: window.innerWidth / 2 - size / 2, y: window.innerHeight - size - offset.y };
      default:
        return { x: window.innerWidth - size - offset.x, y: window.innerHeight / 2 - size / 2 };
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
   * 获取工具提示位置
   */
  private getTooltipPosition(): string {
    // 根据徽章位置智能调整工具提示位置
    const rect = this.container?.getBoundingClientRect();
    if (!rect) return 'left: 100%; margin-left: 10px; top: 50%; transform: translateY(-50%)';

    const isNearLeft = rect.left < window.innerWidth / 2;
    const isNearTop = rect.top < window.innerHeight / 2;

    if (isNearLeft) {
      return 'left: 100%; margin-left: 10px; top: 50%; transform: translateY(-50%)';
    } else {
      return 'right: 100%; margin-right: 10px; top: 50%; transform: translateY(-50%)';
    }
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

    // 移除已存在的
    const existing = document.getElementById('lovsider-floating-badge-v2');
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
        position: this.state.position,
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
        if (response.state.position) {
          this.state.position = response.state.position;
          if (this.container) {
            this.container.style.left = `${this.state.position.x}px`;
            this.container.style.top = `${this.state.position.y}px`;
          }
        }

        if (response.state.sidebarOpen !== undefined) {
          this.updateSidebarState(response.state.sidebarOpen);
        }

        if (response.state.visible !== undefined) {
          this.state.visible = response.state.visible;
          if (!response.state.visible) {
            this.hide();
          }
        }
      }
    } catch (error) {
      console.error('[FloatingBadgeV2] 加载状态失败:', error);
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
  public updateConfig(config: Partial<FloatingBadgeV2Config>): void {
    this.config = { ...this.config, ...config };

    // 重新应用样式
    this.applyContainerStyles();
    this.applyBadgeStyles();
    this.applyTooltipStyles();
  }

  /**
   * 销毁组件
   */
  public destroy(): void {
    // 清理定时器
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
    }

    // 移除 DOM
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.badge = null;
    this.tooltip = null;
  }
}

/**
 * 创建并初始化悬浮徽章 V2
 */
export function createFloatingBadgeV2(config?: Partial<FloatingBadgeV2Config>): FloatingBadgeV2 {
  const badge = new FloatingBadgeV2(config);
  badge.init();
  return badge;
}
