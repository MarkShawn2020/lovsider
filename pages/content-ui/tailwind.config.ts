import globalConfig from '@extension/tailwindcss-config';
import { withUI } from '@extension/ui';

export default withUI({
  content: ['src/**/*.tsx'],
  presets: [globalConfig],
});
