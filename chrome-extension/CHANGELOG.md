# chrome-extension

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
