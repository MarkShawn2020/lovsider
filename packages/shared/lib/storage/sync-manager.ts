import { dbManager } from './database-manager.js';
import type { SyncQueueItem, SyncStatus } from '../types/database.js';

export interface SyncResult {
  success: boolean;
  error?: string;
  syncedCount?: number;
  failedCount?: number;
}

export interface SyncProvider {
  syncItem(item: SyncQueueItem): Promise<boolean>;
  isAuthenticated(): boolean;
  getUserId(): string | null;
}

export class SyncManager {
  private isCurrentlySyncing = false;
  private autoSyncEnabled = true;
  private autoSyncInterval: NodeJS.Timeout | null = null;
  private providers: SyncProvider[] = [];
  private maxRetries = 5;
  private retryDelays = [1000, 5000, 15000, 60000, 300000]; // 1s, 5s, 15s, 1m, 5m

  constructor() {
    this.initializeAutoSync();
  }

  addProvider(provider: SyncProvider): void {
    this.providers.push(provider);
  }

  removeProvider(provider: SyncProvider): void {
    const index = this.providers.indexOf(provider);
    if (index > -1) {
      this.providers.splice(index, 1);
    }
  }

  private initializeAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }

    // 每5分钟自动同步一次
    this.autoSyncInterval = setInterval(
      () => {
        if (this.autoSyncEnabled && !this.isCurrentlySyncing) {
          this.syncAll().catch(console.error);
        }
      },
      5 * 60 * 1000,
    );
    this.autoSyncInterval?.unref?.();
  }

  async enableAutoSync(): Promise<void> {
    this.autoSyncEnabled = true;
    await dbManager.saveSetting('autoSyncEnabled', true);
    this.initializeAutoSync();
  }

  async disableAutoSync(): Promise<void> {
    this.autoSyncEnabled = false;
    await dbManager.saveSetting('autoSyncEnabled', false);
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const queue = await dbManager.getSyncQueue();
    const pendingItems = queue.filter((item: SyncQueueItem) => item.retryCount < this.maxRetries);

    // 获取上次同步时间
    const lastSyncTimestamp = await dbManager.getSetting('lastSyncTimestamp');
    const lastSync =
      lastSyncTimestamp && (typeof lastSyncTimestamp === 'string' || typeof lastSyncTimestamp === 'number')
        ? new Date(lastSyncTimestamp)
        : undefined;

    // 获取最后一个错误
    const failedItems = queue.filter((item: SyncQueueItem) => item.retryCount >= this.maxRetries);
    const lastError = failedItems.length > 0 ? failedItems[0].lastError : undefined;

    return {
      isSyncing: this.isCurrentlySyncing,
      pendingCount: pendingItems.length,
      autoSyncEnabled: this.autoSyncEnabled,
      lastSync,
      lastError,
    };
  }

  async syncAll(): Promise<SyncResult> {
    if (this.isCurrentlySyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    this.isCurrentlySyncing = true;
    let syncedCount = 0;
    let failedCount = 0;

    try {
      const queue = await dbManager.getSyncQueue();
      const pendingItems = queue.filter((item: SyncQueueItem) => item.retryCount < this.maxRetries);

      for (const item of pendingItems) {
        try {
          const success = await this.syncItem(item);
          if (success) {
            await dbManager.removeSyncQueueItem(item.id);
            syncedCount++;
          } else {
            await this.handleSyncFailure(item, 'Sync failed');
            failedCount++;
          }
        } catch (error) {
          await this.handleSyncFailure(item, error instanceof Error ? error.message : 'Unknown error');
          failedCount++;
        }
      }

      // 更新最后同步时间
      await dbManager.saveSetting('lastSyncTimestamp', Date.now());

      return {
        success: true,
        syncedCount,
        failedCount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      this.isCurrentlySyncing = false;
    }
  }

  async forceSyncAll(): Promise<SyncResult> {
    // 强制同步会重置所有项目的重试计数
    const queue = await dbManager.getSyncQueue();
    for (const item of queue) {
      if (item.retryCount >= this.maxRetries) {
        await dbManager.updateSyncQueueItem(item.id, {
          retryCount: 0,
          lastError: undefined,
        });
      }
    }

    return this.syncAll();
  }

  private async syncItem(item: SyncQueueItem): Promise<boolean> {
    // 尝试使用所有可用的提供商进行同步
    for (const provider of this.providers) {
      if (provider.isAuthenticated()) {
        try {
          const success = await provider.syncItem(item);
          if (success) {
            return true;
          }
        } catch (error) {
          console.error(`Sync failed with provider:`, error);
          // 继续尝试下一个提供商
        }
      }
    }
    return false;
  }

  private async handleSyncFailure(item: SyncQueueItem, error: string): Promise<void> {
    const newRetryCount = item.retryCount + 1;

    if (newRetryCount < this.maxRetries) {
      // 计算延迟时间
      const delayIndex = Math.min(newRetryCount - 1, this.retryDelays.length - 1);
      const delay = this.retryDelays[delayIndex];

      // 更新重试计数和错误信息
      await dbManager.updateSyncQueueItem(item.id, {
        retryCount: newRetryCount,
        lastError: error,
      });

      // 安排重试
      const retryTimeout = setTimeout(() => {
        this.retryItem(item.id).catch(console.error);
      }, delay);
      (retryTimeout as unknown as { unref?: () => void }).unref?.();
    } else {
      // 达到最大重试次数，标记为永久失败
      await dbManager.updateSyncQueueItem(item.id, {
        retryCount: newRetryCount,
        lastError: `Max retries exceeded: ${error}`,
      });
    }
  }

  private async retryItem(itemId: string): Promise<void> {
    if (this.isCurrentlySyncing) {
      return; // 如果正在进行全量同步，跳过单项重试
    }

    try {
      const queue = await dbManager.getSyncQueue();
      const item = queue.find(queueItem => queueItem.id === itemId);

      if (!item || item.retryCount >= this.maxRetries) {
        return;
      }

      const success = await this.syncItem(item);
      if (success) {
        await dbManager.removeSyncQueueItem(item.id);
      } else {
        await this.handleSyncFailure(item, 'Retry failed');
      }
    } catch (error) {
      console.error('Retry failed:', error);
    }
  }

  async clearFailedItems(): Promise<void> {
    const queue = await dbManager.getSyncQueue();
    const failedItems = queue.filter((item: SyncQueueItem) => item.retryCount >= this.maxRetries);

    for (const item of failedItems) {
      await dbManager.removeSyncQueueItem(item.id);
    }
  }

  async getFailedItems(): Promise<SyncQueueItem[]> {
    const queue = await dbManager.getSyncQueue();
    return queue.filter((item: SyncQueueItem) => item.retryCount >= this.maxRetries);
  }

  async retryFailedItems(): Promise<SyncResult> {
    const failedItems = await this.getFailedItems();

    // 重置失败项目的重试计数
    for (const item of failedItems) {
      await dbManager.updateSyncQueueItem(item.id, {
        retryCount: 0,
        lastError: undefined,
      });
    }

    return this.syncAll();
  }

  destroy(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }
}

// 创建全局同步管理器实例
export const syncManager = new SyncManager();
