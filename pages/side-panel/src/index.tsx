import '@src/index.css';
import SidePanel from '@src/SidePanel';
import { createRoot } from 'react-dom/client';

// 设置浏览器 side panel 标题（显示版本号）
document.title = `Lovsider v${chrome.runtime.getManifest().version}`;

const init = () => {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(<SidePanel />);
};

init();
