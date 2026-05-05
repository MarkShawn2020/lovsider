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
  defaultPath: '',
  useDefaultPath: false,
  lastUsedPath: '',
  lastUsedAbsolutePath: '',
  askForLocation: true,
};

const CHROME_DEFAULT_PATH = '__CHROME_DEFAULT__';
const DOWNLOADS_DIRECTORY = 'downloads';

const splitPath = (path: string) => path.replace(/\\/g, '/').split('/').filter(Boolean);

const removeLeadingDownloads = (parts: string[]) => {
  const normalizedParts = [...parts];

  while (normalizedParts[0]?.toLowerCase() === DOWNLOADS_DIRECTORY) {
    normalizedParts.shift();
  }

  return normalizedParts;
};

const getRelativePathFromDownloadsDirectory = (path: string) => {
  const pathParts = splitPath(path);
  const downloadsIndex = pathParts.findIndex(part => part.toLowerCase() === DOWNLOADS_DIRECTORY);

  if (downloadsIndex === -1) {
    return '';
  }

  return removeLeadingDownloads(pathParts.slice(downloadsIndex + 1)).join('/');
};

export const normalizeDownloadRelativePath = (path?: string) => {
  const trimmedPath = path?.trim();

  if (!trimmedPath || trimmedPath === CHROME_DEFAULT_PATH) {
    return '';
  }

  if (trimmedPath.startsWith('~/') || trimmedPath.startsWith('~\\')) {
    return getRelativePathFromDownloadsDirectory(trimmedPath.slice(2));
  }

  if (/^(\/|[A-Za-z]:[\\/])/.test(trimmedPath)) {
    return getRelativePathFromDownloadsDirectory(trimmedPath);
  }

  const normalizedParts = removeLeadingDownloads(splitPath(trimmedPath));
  return normalizedParts.join('/');
};

export const getDownloadSettingsFromFilePath = (filePath: string) => {
  const separator = filePath.includes('\\') ? '\\' : '/';
  const pathParts = filePath.split(/[/\\]/);
  pathParts.pop();

  let directoryPath = pathParts.join(separator);
  if (!directoryPath && filePath.startsWith('/')) {
    directoryPath = '/';
  } else if (/^[A-Za-z]:$/.test(directoryPath)) {
    directoryPath = `${directoryPath}${separator}`;
  }

  return {
    lastUsedPath: getRelativePathFromDownloadsDirectory(directoryPath),
    lastUsedAbsolutePath: directoryPath,
  };
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
    const lastUsedAbsolutePath = settings.lastUsedAbsolutePath ?? defaultSettings.lastUsedAbsolutePath;

    return {
      ...defaultSettings,
      ...settings,
      lastUsedPath: lastUsedAbsolutePath
        ? getRelativePathFromDownloadsDirectory(lastUsedAbsolutePath)
        : normalizeDownloadRelativePath(settings.lastUsedPath),
      lastUsedAbsolutePath,
    };
  },

  // 更新设置
  updateSettings: async (newSettings: Partial<DownloadSettings>) => {
    const normalizedSettings: Partial<DownloadSettings> = { ...newSettings };
    if (normalizedSettings.lastUsedPath !== undefined) {
      normalizedSettings.lastUsedPath = normalizeDownloadRelativePath(normalizedSettings.lastUsedPath);
    }

    await storage.set(currentState => ({
      ...currentState,
      settings: {
        ...currentState.settings,
        ...normalizedSettings,
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
        lastUsedPath: normalizeDownloadRelativePath(path),
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
