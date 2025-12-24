import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';

interface InitAppOptions {
  id: string;
  app: ReactElement;
  inlineCss: string;
}

/**
 * 使用 Shadow DOM 渲染应用（样式完全隔离，但不支持 lovinsp）
 */
export const initAppWithShadow = ({ id, app, inlineCss }: InitAppOptions) => {
  const root = document.createElement('div');
  root.id = id;

  document.body.append(root);

  const rootIntoShadow = document.createElement('div');
  rootIntoShadow.id = `shadow-root-${id}`;

  const shadowRoot = root.attachShadow({ mode: 'open' });

  if (navigator.userAgent.includes('Firefox')) {
    /**
     * In the firefox environment, adoptedStyleSheets cannot be used due to the bug
     * @url https://bugzilla.mozilla.org/show_bug.cgi?id=1770592
     *
     * Injecting styles into the document, this may cause style conflicts with the host page
     */
    const styleElement = document.createElement('style');
    styleElement.innerHTML = inlineCss;
    shadowRoot.appendChild(styleElement);
  } else {
    /** Inject styles into shadow dom */
    const globalStyleSheet = new CSSStyleSheet();
    globalStyleSheet.replaceSync(inlineCss);
    shadowRoot.adoptedStyleSheets = [globalStyleSheet];
  }

  shadowRoot.appendChild(rootIntoShadow);
  createRoot(rootIntoShadow).render(app);
};

/**
 * 不使用 Shadow DOM 渲染应用（支持 lovinsp click-to-code）
 * 通过 CSS 作用域前缀来隔离样式
 * 注意：lovinsp 的清理逻辑已移至 vite-config 的 inspectorPrelude，在 bundle 加载时执行
 */
export const initAppWithLovinsp = ({ id, app, inlineCss }: InitAppOptions) => {
  const root = document.createElement('div');
  root.id = id;
  document.body.append(root);

  // 注入样式到 document.head，使用 id 选择器作为作用域前缀
  const styleElement = document.createElement('style');
  styleElement.id = `${id}-styles`;
  // 将所有 CSS 规则包裹在 #id 选择器下，实现样式隔离
  // 同时保留 :root 和 @keyframes 等全局规则
  const scopedCss = inlineCss
    .split('}')
    .map(rule => {
      const trimmed = rule.trim();
      if (!trimmed) return '';
      // 跳过 @规则（如 @keyframes, @font-face 等）
      if (trimmed.startsWith('@')) return rule + '}';
      // 跳过 :root 规则
      if (trimmed.includes(':root')) return rule + '}';
      // 为其他规则添加作用域前缀
      const openBrace = trimmed.indexOf('{');
      if (openBrace === -1) return rule + '}';
      const selectors = trimmed.substring(0, openBrace);
      const body = trimmed.substring(openBrace);
      // 处理多个选择器（用逗号分隔）
      const scopedSelectors = selectors
        .split(',')
        .map(s => {
          const sel = s.trim();
          // 跳过已经有作用域的选择器
          if (sel.startsWith(`#${id}`)) return sel;
          // 为选择器添加作用域
          return `#${id} ${sel}`;
        })
        .join(', ');
      return scopedSelectors + ' ' + body + '}';
    })
    .join('\n');
  styleElement.textContent = scopedCss;
  document.head.appendChild(styleElement);

  createRoot(root).render(app);
};
