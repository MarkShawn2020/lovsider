import inlineCss from '../../../dist/all/index.css?inline';
import { initAppWithLovinsp } from '@extension/shared';
import App from '@src/matches/all/App';

// 使用 initAppWithLovinsp 而非 initAppWithShadow，以支持 lovinsp click-to-code
initAppWithLovinsp({ id: 'CEB-extension-all', app: <App />, inlineCss });

// 确保 lovinsp-component 的 z-index 足够高
const ensureLovinspZIndex = () => {
  const lovinspEl = document.documentElement.querySelector('lovinsp-component') as HTMLElement;
  if (lovinspEl?.shadowRoot && !lovinspEl.dataset.zindexFixed) {
    lovinspEl.style.cssText =
      'position: fixed !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important; pointer-events: none;';
    lovinspEl.dataset.zindexFixed = 'true';
  }
};

// 延迟检查，等待 lovinsp 初始化
setTimeout(ensureLovinspZIndex, 200);
setTimeout(ensureLovinspZIndex, 1000);
