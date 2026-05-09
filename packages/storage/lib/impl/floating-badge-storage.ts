import { createStorage, StorageEnum } from '../base/index.js';
import type { BaseStorageType } from '../base/index.js';

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

export interface FloatingBadgeStorageData {
  enabled: boolean;
  config: FloatingBadgeConfig;
  states: Record<string, FloatingBadgeState>; // 按域名存储状态
  blacklist: string[]; // 黑名单网站
  whitelist: string[]; // 白名单网站（如果设置，只在这些网站显示）
  useWhitelist: boolean;
}

const defaultConfig: FloatingBadgeConfig = {
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

const storage = createStorage<FloatingBadgeStorageData>(
  'floating-badge-storage-key',
  {
    enabled: false,
    config: defaultConfig,
    states: {},
    blacklist: [],
    whitelist: [],
    useWhitelist: false,
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export type FloatingBadgeStorageType = BaseStorageType<FloatingBadgeStorageData> & {
  getSettings: () => Promise<FloatingBadgeStorageData>;
  updateConfig: (config: Partial<FloatingBadgeConfig>) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  saveState: (hostname: string, state: FloatingBadgeState) => Promise<void>;
  getState: (hostname: string) => Promise<FloatingBadgeState | null>;
  addToBlacklist: (hostname: string) => Promise<void>;
  removeFromBlacklist: (hostname: string) => Promise<void>;
  addToWhitelist: (hostname: string) => Promise<void>;
  removeFromWhitelist: (hostname: string) => Promise<void>;
  setUseWhitelist: (use: boolean) => Promise<void>;
  shouldShowOnSite: (hostname: string) => Promise<boolean>;
};

export const floatingBadgeStorage: FloatingBadgeStorageType = {
  ...storage,

  /**
   * 获取所有设置
   */
  getSettings: async () => await storage.get(),

  /**
   * 更新配置
   */
  updateConfig: async (config: Partial<FloatingBadgeConfig>) => {
    const current = await storage.get();
    await storage.set({
      ...current,
      config: {
        ...current.config,
        ...config,
      },
    });
  },

  /**
   * 设置启用/禁用
   */
  setEnabled: async (enabled: boolean) => {
    await storage.set(current => ({
      ...current,
      enabled,
    }));
  },

  /**
   * 保存特定网站的状态
   */
  saveState: async (hostname: string, state: FloatingBadgeState) => {
    await storage.set(current => ({
      ...current,
      states: {
        ...current.states,
        [hostname]: state,
      },
    }));
  },

  /**
   * 获取特定网站的状态
   */
  getState: async (hostname: string) => {
    const data = await storage.get();
    return data.states[hostname] || null;
  },

  /**
   * 添加到黑名单
   */
  addToBlacklist: async (hostname: string) => {
    await storage.set(current => ({
      ...current,
      blacklist: [...new Set([...current.blacklist, hostname])],
    }));
  },

  /**
   * 从黑名单移除
   */
  removeFromBlacklist: async (hostname: string) => {
    await storage.set(current => ({
      ...current,
      blacklist: current.blacklist.filter(h => h !== hostname),
    }));
  },

  /**
   * 添加到白名单
   */
  addToWhitelist: async (hostname: string) => {
    await storage.set(current => ({
      ...current,
      whitelist: [...new Set([...current.whitelist, hostname])],
    }));
  },

  /**
   * 从白名单移除
   */
  removeFromWhitelist: async (hostname: string) => {
    await storage.set(current => ({
      ...current,
      whitelist: current.whitelist.filter(h => h !== hostname),
    }));
  },

  /**
   * 设置是否使用白名单模式
   */
  setUseWhitelist: async (use: boolean) => {
    await storage.set(current => ({
      ...current,
      useWhitelist: use,
    }));
  },

  /**
   * 判断是否应该在特定网站显示
   */
  shouldShowOnSite: async (hostname: string) => {
    const data = await storage.get();

    // 如果未启用，不显示
    if (!data.enabled) {
      return false;
    }

    // 如果在黑名单中，不显示
    if (data.blacklist.includes(hostname)) {
      return false;
    }

    // 如果使用白名单模式
    if (data.useWhitelist) {
      // 只在白名单中的网站显示
      return data.whitelist.includes(hostname);
    }

    // 默认显示
    return true;
  },
};
