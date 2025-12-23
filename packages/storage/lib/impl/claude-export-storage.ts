import { createStorage, StorageEnum } from '../base/index.js';
import type { BaseStorageType } from '../base/index.js';

// Claude 导出设置
export interface ClaudeExportOptions {
  includeThinking: boolean; // 包含 AI 思考过程
  includeToolCalls: boolean; // 包含工具调用详情
  textOnly: boolean; // 仅导出文本（去除代码块）
}

export interface ClaudeExportStateType {
  options: ClaudeExportOptions;
  lastOrgId: string; // 缓存上次使用的 orgId
}

const storage = createStorage<ClaudeExportStateType>(
  'claude-export-storage-key',
  {
    options: {
      includeThinking: true,
      includeToolCalls: true,
      textOnly: false,
    },
    lastOrgId: '',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export type ClaudeExportStorageType = BaseStorageType<ClaudeExportStateType> & {
  getOptions: () => Promise<ClaudeExportOptions>;
  updateOptions: (options: Partial<ClaudeExportOptions>) => Promise<void>;
  getLastOrgId: () => Promise<string>;
  setLastOrgId: (orgId: string) => Promise<void>;
};

export const claudeExportStorage: ClaudeExportStorageType = {
  ...storage,

  getOptions: async () => {
    const state = await storage.get();
    return state.options;
  },

  updateOptions: async (newOptions: Partial<ClaudeExportOptions>) => {
    await storage.set(currentState => ({
      ...currentState,
      options: {
        ...currentState.options,
        ...newOptions,
      },
    }));
  },

  getLastOrgId: async () => {
    const state = await storage.get();
    return state.lastOrgId;
  },

  setLastOrgId: async (orgId: string) => {
    await storage.set(currentState => ({
      ...currentState,
      lastOrgId: orgId,
    }));
  },
};
