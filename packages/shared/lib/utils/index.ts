export * from './helpers.js';
export * from './colorful-logger.js';
export * from './init-app-with-shadow.js';
export type * from './types.js';
export type * from '../types/form-filler.js';
export * from './markdown-converter.js';
export * from './element-selector.js';
export * from './form-detector.js';
export * from './form-filler.js';
export * from './element-marker.js';
export * from './edge-snapping.js';
export * from './floating-badge.js';
export * from './floating-badge-v2.js';
export * from './floating-badge-v3.js';
export * from './floating-badge-v4.js';
export * from './floating-badge-simple.js';
export * from './ai-export-badge.js';
export * from '../commands/command-processor.js';

// 导出storage相关功能，但不导出类型以避免冲突
export { dbManager } from '../storage/database-manager.js';
export { syncManager } from '../storage/sync-manager.js';

// 显式重导出数据库类型，避免重复导出
export type {
  DatabaseFormTemplateData,
  DatabaseFormDefinitionData,
  CaptureData,
  TextProcessingData,
  UserSettings,
  SyncQueueItem,
  UserStats,
  SyncStatus,
} from '../types/database.js';
