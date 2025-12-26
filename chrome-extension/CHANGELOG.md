# chrome-extension

## 0.1.0

### Core Features

**1. AI Chat Export**

Export conversations from Claude.ai and Google AI Studio with full fidelity.

- API-based: Fetches complete conversation via backend API
- Thinking Process: Toggle to include/exclude AI's thinking blocks
- Multiple Formats: Export as Markdown or JSON
- Quick Actions: Copy to clipboard or download as file
- Trigger: Click floating badge or press `Cmd+E`

| Platform | Export | Thinking |
|----------|--------|----------|
| Claude.ai | ✅ | ✅ |
| Google AI Studio | ✅ | ✅ |

**2. Web Content Capture**

Capture any web page content and export as Markdown via sidebar.

- Smart Selection: Auto-detect main content areas
- Manual Selection: Click to select any DOM element
- Markdown Export: Convert HTML to clean Markdown
- Trigger: Click extension icon in toolbar to open sidebar

## 1.2.1

### Patch Changes

- e5da87f: fix: 修复下载路径记忆功能在非标准浏览器配置下不工作的问题
- Updated dependencies [e5da87f]
  - @extension/storage@1.2.1
  - @extension/shared@1.2.1
  - @extension/env@1.2.1

## 1.2.0

### Minor Changes

- feat(export): 支持 Google AI Studio 对话导出

  - 重构 ClaudeExportPanel 为通用多平台导出组件
  - 新增 Google AI Studio 页面检测和 API 调用
  - 实现 SAPISIDHASH 认证生成
  - 解析 Google AI Studio JSON 响应格式
  - 异步获取并更新真实对话标题

### Patch Changes

- @extension/env@1.2.0
- @extension/shared@1.2.0
- @extension/storage@1.2.0

## 1.1.6

### Patch Changes

- 修复下载功能问题：
  - 文件名含斜杠时不再创建子文件夹
  - 优化剪贴板路径格式（去掉@前缀，仅空格路径加引号）
  - @extension/env@1.1.6
  - @extension/shared@1.1.6
  - @extension/storage@1.1.6

## 1.1.5

### Patch Changes

- 0574e02: 初始化 changeset 版本管理
- feat(selection): 重新选择功能与DOM路径稳定性改进

  - DOM 路径卡片新增重新选择按钮
  - 移除侧边栏交互自动退出选择模式
  - 统一智能选择与手动选择的鼠标样式
  - 改进 DOM 路径生成算法
  - @extension/env@1.1.5
  - @extension/shared@1.1.5
  - @extension/storage@1.1.5
