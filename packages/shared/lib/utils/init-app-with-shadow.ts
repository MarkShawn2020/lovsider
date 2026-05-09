import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';

interface InitAppOptions {
  id: string;
  app: ReactElement;
  inlineCss: string;
}

const stripCssComments = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, '').trim();

const findNextOpenBrace = (css: string, start: number) => {
  let quote: '"' | "'" | null = null;

  for (let i = start; i < css.length; i++) {
    const char = css[i];
    const next = css[i + 1];

    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '/' && next === '*') {
      const commentEnd = css.indexOf('*/', i + 2);
      if (commentEnd === -1) return -1;
      i = commentEnd + 1;
      continue;
    }

    if (char === '{') return i;
  }

  return -1;
};

const findMatchingBrace = (css: string, openBraceIndex: number) => {
  let quote: '"' | "'" | null = null;
  let depth = 0;

  for (let i = openBraceIndex; i < css.length; i++) {
    const char = css[i];
    const next = css[i + 1];

    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '/' && next === '*') {
      const commentEnd = css.indexOf('*/', i + 2);
      if (commentEnd === -1) return -1;
      i = commentEnd + 1;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
};

const splitSelectorList = (selectors: string) => {
  const result: string[] = [];
  let quote: '"' | "'" | null = null;
  let bracketDepth = 0;
  let parenDepth = 0;
  let start = 0;

  for (let i = 0; i < selectors.length; i++) {
    const char = selectors[i];
    const next = selectors[i + 1];

    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '/' && next === '*') {
      const commentEnd = selectors.indexOf('*/', i + 2);
      if (commentEnd === -1) break;
      i = commentEnd + 1;
      continue;
    }

    if (char === '[') bracketDepth++;
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    if (char === '(') parenDepth++;
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
      result.push(selectors.slice(start, i));
      start = i + 1;
    }
  }

  result.push(selectors.slice(start));
  return result;
};

const scopeSelector = (selector: string, rootSelector: string) => {
  const normalized = stripCssComments(selector);

  if (!normalized) return [selector];
  if (normalized.startsWith(rootSelector)) return [normalized];

  if (normalized === '*') {
    return [rootSelector, `${rootSelector} *`];
  }

  if (normalized === '::before' || normalized === '::after') {
    return [`${rootSelector}${normalized}`, `${rootSelector} ${normalized}`];
  }

  if (normalized.startsWith(':root')) {
    return [normalized.replace(':root', rootSelector)];
  }

  if (normalized.startsWith(':host')) {
    return [normalized.replace(':host', rootSelector)];
  }

  if (normalized.startsWith('html')) {
    return [normalized.replace(/^html\b/, rootSelector)];
  }

  if (normalized.startsWith('body')) {
    return [normalized.replace(/^body\b/, rootSelector)];
  }

  return [`${rootSelector} ${normalized}`];
};

const scopeSelectorList = (selectors: string, rootSelector: string) =>
  splitSelectorList(selectors)
    .flatMap(selector => scopeSelector(selector, rootSelector))
    .map(selector => selector.trim())
    .filter(Boolean)
    .join(', ');

const isAtRuleWithNestedRules = (prelude: string) => {
  const normalized = stripCssComments(prelude).toLowerCase();
  if (!normalized.startsWith('@')) return false;
  return !(
    normalized.startsWith('@font-face') ||
    normalized.startsWith('@keyframes') ||
    normalized.startsWith('@-webkit-keyframes') ||
    normalized.startsWith('@property') ||
    normalized.startsWith('@page')
  );
};

const scopeCssToRoot = (css: string, id: string): string => {
  const rootSelector = `#${id}`;
  let output = '';
  let index = 0;

  while (index < css.length) {
    const openBraceIndex = findNextOpenBrace(css, index);
    if (openBraceIndex === -1) {
      output += css.slice(index);
      break;
    }

    const closeBraceIndex = findMatchingBrace(css, openBraceIndex);
    if (closeBraceIndex === -1) {
      output += css.slice(index);
      break;
    }

    const prelude = css.slice(index, openBraceIndex);
    const body = css.slice(openBraceIndex + 1, closeBraceIndex);
    const normalizedPrelude = stripCssComments(prelude);

    if (normalizedPrelude.startsWith('@')) {
      output += `${prelude}{${isAtRuleWithNestedRules(prelude) ? scopeCssToRoot(body, id) : body}}`;
    } else {
      output += `${scopeSelectorList(prelude, rootSelector)}{${body}}`;
    }

    index = closeBraceIndex + 1;
  }

  return output;
};

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
 */
export const initAppWithLovinsp = ({ id, app, inlineCss }: InitAppOptions) => {
  const root = document.createElement('div');
  root.id = id;
  root.style.all = 'initial';
  root.style.display = 'contents';
  document.body.append(root);

  // 注入样式到 document.head，使用 id 选择器作为作用域前缀
  const styleElement = document.createElement('style');
  styleElement.id = `${id}-styles`;
  styleElement.textContent = scopeCssToRoot(inlineCss, id);
  document.head.appendChild(styleElement);

  createRoot(root).render(app);
};
