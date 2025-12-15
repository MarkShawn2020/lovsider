# LovSider

多功能浏览器侧边栏工具集，支持网页内容捕获、表单自动填充、开发者工具等功能。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)
![Chrome Extension](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome)

## 功能特性

### 🎯 页面捕获
- **智能选择** - 自动识别页面主要内容区域
- **手动选择** - 点击选取任意 DOM 元素
- **Markdown 导出** - 一键转换并下载

### 📝 表单自动填充
- 检测页面表单字段
- 支持模板化填充
- 模拟真实输入行为

### 🛠️ 开发者工具
- 元素标记（输入框、容器等）
- 表单调试
- 命令行交互界面

### ⚙️ 悬浮徽章
- 可拖拽定位
- 右键菜单快捷操作
- 支持按站点/全局隐藏

## 安装

```bash
# 克隆项目
git clone https://github.com/MarkShawn2020/lovsider.git
cd lovsider

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build
```

### 加载扩展

**Chrome:**
1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist` 目录

**Firefox:**
1. 运行 `pnpm dev:firefox`
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点击「临时载入附加组件」
4. 选择 `dist/manifest.json`

## 项目结构

```
lovsider/
├── chrome-extension/     # 扩展入口（manifest、background）
├── pages/
│   ├── side-panel/       # 侧边栏主界面
│   ├── content/          # 内容脚本
│   ├── popup/            # 弹出窗口
│   └── options/          # 设置页面
└── packages/
    ├── shared/           # 共享工具库
    ├── storage/          # 存储封装
    ├── ui/               # UI 组件
    └── i18n/             # 国际化
```

## 技术栈

- **框架**: React 19 + TypeScript
- **构建**: Vite + Turborepo
- **样式**: Tailwind CSS + shadcn/ui
- **扩展**: Chrome Extension Manifest V3

## License

MIT
