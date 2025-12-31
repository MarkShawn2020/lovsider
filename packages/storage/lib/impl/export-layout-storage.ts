import { createStorage, StorageEnum } from '../base/index.js';

interface ExportDialogSize {
  width: number;
  height: number;
}

export type MarkdownViewMode = 'raw' | 'side-by-side' | 'preview';

interface ExportLayoutState {
  dialogSize: ExportDialogSize;
  viewMode: MarkdownViewMode;
}

const DEFAULT_SIZE: ExportDialogSize = { width: 520, height: 480 };
const DEFAULT_VIEW_MODE: MarkdownViewMode = 'raw';

const storage = createStorage<ExportLayoutState>(
  'export-layout-storage',
  { dialogSize: DEFAULT_SIZE, viewMode: DEFAULT_VIEW_MODE },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const exportLayoutStorage = {
  ...storage,
  setDialogSize: async (size: ExportDialogSize) => {
    const current = await storage.get();
    await storage.set({ ...current, dialogSize: size });
  },
  setViewMode: async (mode: MarkdownViewMode) => {
    const current = await storage.get();
    await storage.set({ ...current, viewMode: mode });
  },
  resetDialogSize: async () => {
    const current = await storage.get();
    await storage.set({ ...current, dialogSize: DEFAULT_SIZE });
  },
};
