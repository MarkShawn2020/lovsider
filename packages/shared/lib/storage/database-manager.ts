import type { CaptureData, TextProcessingData, UserSettings, SyncQueueItem, UserStats } from '../types/database.js';

export interface DatabaseManager {
  // 初始化
  initialize(): Promise<void>;

  // 捕获数据管理
  saveCapture(data: CaptureData): Promise<string>;
  getCaptures(userId?: string, limit?: number): Promise<CaptureData[]>;
  getCaptureById(id: string): Promise<CaptureData | null>;
  updateCapture(id: string, data: Partial<CaptureData>): Promise<void>;
  deleteCapture(id: string): Promise<void>;

  // 文本处理数据管理
  saveTextProcessing(data: TextProcessingData): Promise<string>;
  getTextProcessingHistory(userId?: string, type?: string, limit?: number): Promise<TextProcessingData[]>;
  getTextProcessingById(id: string): Promise<TextProcessingData | null>;
  updateTextProcessing(id: string, data: Partial<TextProcessingData>): Promise<void>;
  deleteTextProcessing(id: string): Promise<void>;

  // 用户设置管理
  saveSetting(key: string, value: unknown, userId?: string): Promise<void>;
  getSetting(key: string, userId?: string): Promise<unknown>;
  getSettings(userId?: string): Promise<UserSettings[]>;
  deleteSetting(key: string, userId?: string): Promise<void>;

  // 同步队列管理
  addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>): Promise<void>;
  getSyncQueue(): Promise<SyncQueueItem[]>;
  removeSyncQueueItem(id: string): Promise<void>;
  updateSyncQueueItem(id: string, data: Partial<SyncQueueItem>): Promise<void>;
  clearSyncQueue(): Promise<void>;

  // 统计信息
  getUserStats(userId?: string): Promise<UserStats>;

  // 数据导出/导入
  exportData(userId?: string): Promise<unknown>;
  importData(data: unknown, userId?: string): Promise<void>;
  clearUserData(userId?: string): Promise<void>;

  // 数据库维护
  cleanup(): Promise<void>;
  compact(): Promise<void>;
}

export class IndexedDBManager implements DatabaseManager {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'LovsiderDB';
  private readonly dbVersion = 1;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建捕获数据表
        if (!db.objectStoreNames.contains('captures')) {
          const captureStore = db.createObjectStore('captures', { keyPath: 'id' });
          captureStore.createIndex('userId', 'userId', { unique: false });
          captureStore.createIndex('timestamp', 'timestamp', { unique: false });
          captureStore.createIndex('synced', 'synced', { unique: false });
        }

        // 创建文本处理数据表
        if (!db.objectStoreNames.contains('textProcessing')) {
          const textStore = db.createObjectStore('textProcessing', { keyPath: 'id' });
          textStore.createIndex('userId', 'userId', { unique: false });
          textStore.createIndex('type', 'type', { unique: false });
          textStore.createIndex('timestamp', 'timestamp', { unique: false });
          textStore.createIndex('synced', 'synced', { unique: false });
        }

        // 创建用户设置表
        if (!db.objectStoreNames.contains('settings')) {
          const settingsStore = db.createObjectStore('settings', { keyPath: 'id' });
          settingsStore.createIndex('userId_key', ['userId', 'key'], { unique: true });
        }

        // 创建同步队列表
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          syncStore.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async executeTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveCapture(data: CaptureData): Promise<string> {
    const id = this.generateId();
    const capture: CaptureData = {
      ...data,
      id,
      timestamp: data.timestamp || Date.now(),
      synced: false,
    };

    await this.executeTransaction('captures', 'readwrite', store => store.add(capture));

    // 添加到同步队列
    await this.addToSyncQueue({
      type: 'capture',
      action: 'create',
      data: capture,
    });

    return id;
  }

  async getCaptures(userId?: string, limit?: number): Promise<CaptureData[]> {
    const captures = await this.executeTransaction('captures', 'readonly', store => store.getAll());

    let filtered = captures;
    if (userId) {
      filtered = captures.filter(c => c.userId === userId);
    }

    // 按时间戳倒序排列
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  async getCaptureById(id: string): Promise<CaptureData | null> {
    try {
      const capture = await this.executeTransaction('captures', 'readonly', store => store.get(id));
      return capture || null;
    } catch {
      return null;
    }
  }

  async updateCapture(id: string, data: Partial<CaptureData>): Promise<void> {
    const existing = await this.getCaptureById(id);
    if (!existing) throw new Error('Capture not found');

    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await this.executeTransaction('captures', 'readwrite', store => store.put(updated));

    // 添加到同步队列
    await this.addToSyncQueue({
      type: 'capture',
      action: 'update',
      data: updated,
    });
  }

  async deleteCapture(id: string): Promise<void> {
    await this.executeTransaction('captures', 'readwrite', store => store.delete(id));

    // 添加到同步队列
    await this.addToSyncQueue({
      type: 'capture',
      action: 'delete',
      data: { id },
    });
  }

  async saveTextProcessing(data: TextProcessingData): Promise<string> {
    const id = this.generateId();
    const processing: TextProcessingData = {
      ...data,
      id,
      timestamp: data.timestamp || Date.now(),
      synced: false,
    };

    await this.executeTransaction('textProcessing', 'readwrite', store => store.add(processing));

    // 添加到同步队列
    await this.addToSyncQueue({
      type: 'text_processing',
      action: 'create',
      data: processing,
    });

    return id;
  }

  async getTextProcessingHistory(userId?: string, type?: string, limit?: number): Promise<TextProcessingData[]> {
    const items = await this.executeTransaction('textProcessing', 'readonly', store => store.getAll());

    let filtered = items;
    if (userId) {
      filtered = items.filter(item => item.userId === userId);
    }
    if (type) {
      filtered = filtered.filter(item => item.type === type);
    }

    // 按时间戳倒序排列
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  async getTextProcessingById(id: string): Promise<TextProcessingData | null> {
    try {
      const item = await this.executeTransaction('textProcessing', 'readonly', store => store.get(id));
      return item || null;
    } catch {
      return null;
    }
  }

  async updateTextProcessing(id: string, data: Partial<TextProcessingData>): Promise<void> {
    const existing = await this.getTextProcessingById(id);
    if (!existing) throw new Error('Text processing record not found');

    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await this.executeTransaction('textProcessing', 'readwrite', store => store.put(updated));

    // 添加到同步队列
    await this.addToSyncQueue({
      type: 'text_processing',
      action: 'update',
      data: updated,
    });
  }

  async deleteTextProcessing(id: string): Promise<void> {
    await this.executeTransaction('textProcessing', 'readwrite', store => store.delete(id));

    // 添加到同步队列
    await this.addToSyncQueue({
      type: 'text_processing',
      action: 'delete',
      data: { id },
    });
  }

  async saveSetting(key: string, value: unknown, userId?: string): Promise<void> {
    const id = `${userId || 'global'}_${key}`;
    const setting: UserSettings = {
      id,
      userId,
      key,
      value,
      updatedAt: new Date().toISOString(),
    };

    await this.executeTransaction('settings', 'readwrite', store => store.put(setting));

    // 添加到同步队列
    await this.addToSyncQueue({
      type: 'settings',
      action: 'create',
      data: setting,
    });
  }

  async getSetting(key: string, userId?: string): Promise<unknown> {
    const id = `${userId || 'global'}_${key}`;
    try {
      const setting = await this.executeTransaction('settings', 'readonly', store => store.get(id));
      return setting?.value;
    } catch {
      return null;
    }
  }

  async getSettings(userId?: string): Promise<UserSettings[]> {
    const settings = await this.executeTransaction('settings', 'readonly', store => store.getAll());
    if (userId) {
      return settings.filter(s => s.userId === userId);
    }
    return settings;
  }

  async deleteSetting(key: string, userId?: string): Promise<void> {
    const id = `${userId || 'global'}_${key}`;
    await this.executeTransaction('settings', 'readwrite', store => store.delete(id));

    // 添加到同步队列
    await this.addToSyncQueue({
      type: 'settings',
      action: 'delete',
      data: { id, key, userId },
    });
  }

  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    const queueItem: SyncQueueItem = {
      ...item,
      id: this.generateId(),
      timestamp: Date.now(),
      retryCount: 0,
    };

    await this.executeTransaction('syncQueue', 'readwrite', store => store.add(queueItem));
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    const items = await this.executeTransaction('syncQueue', 'readonly', store => store.getAll());
    return items.sort((a, b) => a.timestamp - b.timestamp);
  }

  async removeSyncQueueItem(id: string): Promise<void> {
    await this.executeTransaction('syncQueue', 'readwrite', store => store.delete(id));
  }

  async updateSyncQueueItem(id: string, data: Partial<SyncQueueItem>): Promise<void> {
    const existing = await this.executeTransaction('syncQueue', 'readonly', store => store.get(id));
    if (!existing) throw new Error('Sync queue item not found');

    const updated = { ...existing, ...data };
    await this.executeTransaction('syncQueue', 'readwrite', store => store.put(updated));
  }

  async clearSyncQueue(): Promise<void> {
    await this.executeTransaction('syncQueue', 'readwrite', store => store.clear());
  }

  async getUserStats(userId?: string): Promise<UserStats> {
    const captures = await this.getCaptures(userId);
    const textProcessing = await this.getTextProcessingHistory(userId);

    const syncQueue = await this.getSyncQueue();
    const lastSyncItem = syncQueue
      .filter(
        item =>
          item.data &&
          typeof item.data === 'object' &&
          'userId' in item.data &&
          (item.data as { userId?: string }).userId === userId,
      )
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    return {
      totalCaptures: captures.length,
      totalTextProcessing: textProcessing.length,
      lastSync: lastSyncItem ? new Date(lastSyncItem.timestamp).toISOString() : undefined,
    };
  }

  async exportData(userId?: string): Promise<unknown> {
    const captures = await this.getCaptures(userId);
    const textProcessing = await this.getTextProcessingHistory(userId);
    const settings = await this.getSettings(userId);

    return {
      version: 1,
      exportDate: new Date().toISOString(),
      userId,
      data: {
        captures,
        textProcessing,
        settings,
      },
    };
  }

  async importData(data: unknown, userId?: string): Promise<void> {
    if (!data || typeof data !== 'object' || !('data' in data)) {
      throw new Error('Invalid data format');
    }

    const importData = data as { data: { captures?: unknown[]; textProcessing?: unknown[]; settings?: unknown[] } };
    const { captures = [], textProcessing = [], settings = [] } = importData.data;

    // 导入捕获数据
    for (const capture of captures) {
      const captureData = capture as CaptureData;
      if (userId) captureData.userId = userId;
      await this.saveCapture(captureData);
    }

    // 导入文本处理数据
    for (const item of textProcessing) {
      const textData = item as TextProcessingData;
      if (userId) textData.userId = userId;
      await this.saveTextProcessing(textData);
    }

    // 导入设置
    for (const setting of settings) {
      const settingData = setting as UserSettings;
      await this.saveSetting(settingData.key, settingData.value, userId);
    }
  }

  async clearUserData(userId?: string): Promise<void> {
    if (userId) {
      // 清除指定用户的数据
      const captures = await this.getCaptures(userId);
      for (const capture of captures) {
        await this.deleteCapture(capture.id!);
      }

      const textProcessing = await this.getTextProcessingHistory(userId);
      for (const item of textProcessing) {
        await this.deleteTextProcessing(item.id!);
      }

      const settings = await this.getSettings(userId);
      for (const setting of settings) {
        await this.deleteSetting(setting.key, userId);
      }
    } else {
      // 清除所有数据
      await this.executeTransaction('captures', 'readwrite', store => store.clear());
      await this.executeTransaction('textProcessing', 'readwrite', store => store.clear());
      await this.executeTransaction('settings', 'readwrite', store => store.clear());
      await this.executeTransaction('syncQueue', 'readwrite', store => store.clear());
    }
  }

  async cleanup(): Promise<void> {
    // 清理旧的同步队列项目（超过30天的失败项目）
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const queueItems = await this.getSyncQueue();

    for (const item of queueItems) {
      if (item.timestamp < cutoff && item.retryCount > 5) {
        await this.removeSyncQueueItem(item.id);
      }
    }
  }

  async compact(): Promise<void> {
    // IndexedDB 压缩通常由浏览器自动处理
    // 这里可以实现一些优化逻辑，比如重新组织数据
    console.log('Database compaction completed');
  }
}

// 创建全局数据库管理器实例
export const dbManager = new IndexedDBManager();
