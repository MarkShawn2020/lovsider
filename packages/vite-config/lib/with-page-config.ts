import env, { IS_DEV, IS_PROD } from '@extension/env';
import { watchRebuildPlugin } from '@extension/hmr';
import react from '@vitejs/plugin-react-swc';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import deepmerge from 'deepmerge';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import type { UserConfig } from 'vite';

export const watchOption = IS_DEV
  ? {
      chokidar: {
        awaitWriteFinish: true,
      },
    }
  : undefined;

export const withPageConfig = (config: UserConfig) =>
  defineConfig(
    deepmerge(
      {
        define: {
          'process.env': env,
        },
        base: '',
        plugins: [
          react(),
          IS_DEV && watchRebuildPlugin({ refresh: true }),
          IS_DEV &&
            codeInspectorPlugin({
              bundler: 'vite',
              dev: true, // Chrome 扩展使用 build --watch，需要显式启用
              behavior: {
                defaultAction: 'copy',
                locate: false, // 禁用 IDE 打开，避免 Chrome 扩展环境下的连接问题
              },
              showSwitch: true,
              importClient: 'file', // 使用文件引入而非内联脚本，避免 CSP 问题
              skipSnippets: ['htmlScript'], // 跳过 HTML 内联脚本注入
            }),
          nodePolyfills(),
        ],
        build: {
          sourcemap: IS_DEV,
          minify: IS_PROD,
          reportCompressedSize: IS_PROD,
          emptyOutDir: IS_PROD,
          watch: watchOption,
          rollupOptions: {
            external: ['chrome'],
          },
        },
      },
      config,
    ),
  );
