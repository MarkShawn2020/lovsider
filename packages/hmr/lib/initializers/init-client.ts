import { DO_UPDATE, DONE_UPDATE, LOCAL_RELOAD_SOCKET_URL } from '../consts.js';
import MessageInterpreter from '../interpreter/index.js';

export default async ({ id, onUpdate }: { id: string; onUpdate: () => void }) => {
  const ws = new WebSocket(LOCAL_RELOAD_SOCKET_URL);

  ws.onopen = () => {
    console.info('[LovSider] HMR connected');
    ws.addEventListener('message', event => {
      const message = MessageInterpreter.receive(String(event.data));

      if (message.type === DO_UPDATE && message.id === id) {
        onUpdate();
        ws.send(MessageInterpreter.send({ type: DONE_UPDATE }));
      }
    });
  };

  ws.onerror = () => {
    console.warn(
      '%c[LovSider]%c 当前加载的是开发构建版本，但 HMR 服务器未运行。\n' +
        '• 如需热更新：运行 %cpnpm dev%c\n' +
        '• 如需生产版本：运行 %cpnpm build%c（不会有此提示）',
      'color: #f59e0b; font-weight: bold',
      'color: inherit',
      'color: #22c55e; font-weight: bold',
      'color: inherit',
      'color: #22c55e; font-weight: bold',
      'color: inherit',
    );
  };

  ws.onclose = () => {};
};
