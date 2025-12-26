import { createStorage, StorageEnum } from '../base/index.js';

interface ExportDialogSize {
  width: number;
  height: number;
}

interface ExportLayoutState {
  dialogSize: ExportDialogSize;
}

const DEFAULT_SIZE: ExportDialogSize = { width: 520, height: 480 };

const storage = createStorage<ExportLayoutState>(
  'export-layout-storage',
  { dialogSize: DEFAULT_SIZE },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const exportLayoutStorage = {
  ...storage,
  setDialogSize: async (size: ExportDialogSize) => {
    await storage.set({ dialogSize: size });
  },
  resetDialogSize: async () => {
    await storage.set({ dialogSize: DEFAULT_SIZE });
  },
};
