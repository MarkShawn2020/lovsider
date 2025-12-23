import { createStorage, StorageEnum } from '../base/index.js';
import type { BaseStorageType } from '../base/index.js';

// 下载设置的数据结构
export interface DownloadSettings {
  defaultPath: string;
  useDefaultPath: boolean;
  lastUsedPath: string;
  lastUsedAbsolutePath: string;
  askForLocation: boolean; // 是否每次都询问位置
}

export interface DownloadSettingsStateType {
  settings: DownloadSettings;
}

const defaultSettings: DownloadSettings = {
  defaultPath: 'Downloads',
  useDefaultPath: false,
  lastUsedPath: '',
  lastUsedAbsolutePath: '',
  askForLocation: true,
};

const normalizeRelativePath = (path?: string) => {
  if (!path || path === '__CHROME_DEFAULT__' || path === 'Downloads') {
    return '';
  }

  return path;
};

const storage = createStorage<DownloadSettingsStateType>(
  'download-settings-storage-key',
  {
    settings: defaultSettings,
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export type DownloadSettingsStorageType = BaseStorageType<DownloadSettingsStateType> & {
  getSettings: () => Promise<DownloadSettings>;
  updateSettings: (settings: Partial<DownloadSettings>) => Promise<void>;
  setDefaultPath: (path: string) => Promise<void>;
  setLastUsedPath: (path: string) => Promise<void>;
  setAskForLocation: (ask: boolean) => Promise<void>;
  setUseDefaultPath: (use: boolean) => Promise<void>;
};

export const downloadSettingsStorage: DownloadSettingsStorageType = {
  ...storage,

  // 获取下载设置
  getSettings: async () => {
    const state = await storage.get();
    const settings = state.settings ?? defaultSettings;

    return {
      ...defaultSettings,
      ...settings,
      lastUsedPath: normalizeRelativePath(settings.lastUsedPath),
      lastUsedAbsolutePath: settings.lastUsedAbsolutePath ?? defaultSettings.lastUsedAbsolutePath,
    };
  },

  // 更新设置
  updateSettings: async (newSettings: Partial<DownloadSettings>) => {
    await storage.set(currentState => ({
      ...currentState,
      settings: {
        ...currentState.settings,
        ...newSettings,
      },
    }));
  },

  // 设置默认下载路径
  setDefaultPath: async (path: string) => {
    await storage.set(currentState => ({
      ...currentState,
      settings: {
        ...currentState.settings,
        defaultPath: path,
      },
    }));
  },

  // 设置最后使用的路径
  setLastUsedPath: async (path: string) => {
    await storage.set(currentState => ({
      ...currentState,
      settings: {
        ...currentState.settings,
        lastUsedPath: path,
      },
    }));
  },

  // 设置是否询问位置
  setAskForLocation: async (ask: boolean) => {
    await storage.set(currentState => ({
      ...currentState,
      settings: {
        ...currentState.settings,
        askForLocation: ask,
      },
    }));
  },

  // 设置是否使用默认路径
  setUseDefaultPath: async (use: boolean) => {
    await storage.set(currentState => ({
      ...currentState,
      settings: {
        ...currentState.settings,
        useDefaultPath: use,
      },
    }));
  },
};
