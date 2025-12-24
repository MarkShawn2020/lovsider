import inlineCss from '../../../dist/all/index.css?inline';
import { initAppWithLovinsp } from '@extension/shared';
import App from '@src/matches/all/App';

// 使用 initAppWithLovinsp 而非 initAppWithShadow，以支持 lovinsp click-to-code
initAppWithLovinsp({ id: 'CEB-extension-all', app: <App />, inlineCss });
