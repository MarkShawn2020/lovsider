import env, { IS_DEV, IS_PROD } from '@extension/env';
import { watchRebuildPlugin } from '@extension/hmr';
import { getInjectedCode } from '@lovinsp/core';
import react from '@vitejs/plugin-react-swc';
import deepmerge from 'deepmerge';
import { lovinspPlugin } from 'lovinsp';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { isAbsolute, resolve } from 'node:path';
import type { UserConfig } from 'vite';

export const watchOption = IS_DEV
  ? {
      chokidar: {
        awaitWriteFinish: true,
      },
    }
  : undefined;

// 在 lovinsp 初始化之前，强制移除第三方页面可能存在的 lovinsp-component
// 这确保我们的 lovinsp 总是能正确初始化，而不会被页面现有的组件阻止
const lovinspCleanupCode = `
(function() {
  if (typeof document !== 'undefined') {
    var existing = document.documentElement.querySelector('lovinsp-component');
    if (existing) {
      existing.remove();
      console.log('[Lovsider] Removed existing lovinsp-component to ensure our inspector initializes');
    }
    if (typeof globalThis !== 'undefined' && globalThis.__lovinsp_console) {
      delete globalThis.__lovinsp_console;
    }
  }
})();
`;

const inspectorPrelude = [
  lovinspCleanupCode,
  "var __lovinspCustomElements = typeof globalThis !== 'undefined' ? globalThis.customElements : (typeof window !== 'undefined' ? window.customElements : null);",
  'var customElements = __lovinspCustomElements || { get: function () { return undefined; }, define: function () {} };',
  // lovinsp 运行时代码使用 CommonJS 风格的 exports，在 IIFE bundle 中需要手动定义
  'var exports = {};',
].join('\n');

const lovinspCustomElementsGuard = () => ({
  name: 'lovinsp-custom-elements-guard',
  renderChunk(code: string) {
    if (!code.includes('lovinsp-component')) return null;
    const moduleMarker = '"use client";';
    if (code.includes(moduleMarker)) {
      return {
        code: code.replace(moduleMarker, `${moduleMarker}\n${inspectorPrelude}`),
        map: null,
      };
    }
    const strictMarker = '"use strict";';
    if (code.includes(strictMarker)) {
      return {
        code: code.replace(strictMarker, `${strictMarker}\n${inspectorPrelude}`),
        map: null,
      };
    }
    return {
      code: `${inspectorPrelude}\n${code}`,
      map: null,
    };
  },
});

const resolveLovinspInjectTo = (config: UserConfig): string[] | undefined => {
  const entries = new Set<string>();
  const collectEntries = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      entries.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collectEntries);
      return;
    }
    if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(collectEntries);
    }
  };

  const libConfig = config.build?.lib;
  if (libConfig && typeof libConfig === 'object') {
    collectEntries(libConfig.entry);
  }
  collectEntries(config.build?.rollupOptions?.input);

  if (entries.size === 0) return undefined;

  const rootDir = config.root ? resolve(config.root) : process.cwd();
  return Array.from(entries).map(entry => (isAbsolute(entry) ? entry : resolve(rootDir, entry)));
};

const normalizeId = (id: string) => id.split('?', 2)[0].replace(/\\/g, '/');

const lovinspRuntimeInjector = (injectTo: string[] | undefined, options: Record<string, unknown>) => {
  const targets = new Set((injectTo ?? []).map(normalizeId));
  const injectCode = getInjectedCode(options as any, 0, false);

  return {
    name: 'lovinsp-runtime-injector',
    renderChunk(code: string, chunk: { isEntry: boolean; facadeModuleId?: string | null }) {
      if (code.includes('lovinsp-component')) return null;
      const facadeId = chunk.facadeModuleId ? normalizeId(chunk.facadeModuleId) : null;
      const shouldInject = targets.size > 0 ? facadeId && targets.has(facadeId) : chunk.isEntry;
      if (!shouldInject) return null;
      return {
        code: `${injectCode}\n${code}`,
        map: null,
      };
    },
  };
};

const baseConfig = {
  define: {
    'process.env': env,
  },
  base: '',
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
};

export const withPageConfig = (config: UserConfig) => {
  const injectTo = resolveLovinspInjectTo(config);
  const lovinspOptions = {
    bundler: 'vite' as const,
    dev: true, // Chrome 扩展使用 build --watch，需要显式启用
    behavior: {
      defaultAction: 'copy' as const,
      locate: false, // 禁用 IDE 打开，避免 Chrome 扩展环境下的连接问题
    },
    showSwitch: false,
    importClient: 'file' as const, // 使用文件引入而非内联脚本，避免 CSP 问题
    skipSnippets: ['htmlScript'] as ('htmlScript' | 'console')[], // 跳过 HTML 内联脚本注入
    ...(injectTo?.length ? { injectTo } : {}),
  };

  return defineConfig(
    deepmerge(
      {
        ...baseConfig,
        build: {
          ...baseConfig.build,
          rollupOptions: {
            ...baseConfig.build.rollupOptions,
            output: {
              intro: inspectorPrelude,
            },
          },
        },
        plugins: [
          IS_DEV && lovinspPlugin(lovinspOptions),
          IS_DEV && lovinspRuntimeInjector(injectTo, lovinspOptions),
          react(),
          IS_DEV && watchRebuildPlugin({ refresh: true }),
          IS_DEV && lovinspCustomElementsGuard(),
          nodePolyfills(),
        ],
      },
      config,
    ),
  );
};

// Content script 专用配置，不包含 inspector 插件
export const withContentScriptConfig = (config: UserConfig) =>
  defineConfig(
    deepmerge(
      {
        ...baseConfig,
        plugins: [react(), IS_DEV && watchRebuildPlugin({ refresh: true }), nodePolyfills()],
      },
      config,
    ),
  );
