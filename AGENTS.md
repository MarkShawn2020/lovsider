## Design System

This project uses **Lovstudio Warm Academic Style (暖学术风格)**

Reference complete design guide: file:///Users/mark/@lovstudio/design/design-guide.md

### Quick Rules
1. **禁止硬编码颜色**：必须使用 semantic 类名（如 `bg-primary`、`text-muted-foreground`）
2. **字体配对**：标题用 `font-serif`，正文用默认 `font-sans`
3. **圆角风格**：使用 `rounded-lg`、`rounded-xl`、`rounded-2xl`
4. **主色调**：陶土色（按钮/高亮）+ 暖米色背景 + 炭灰文字
5. **组件优先**：优先使用 shadcn/ui 组件

### Color Palette
- **Primary**: #CC785C (陶土色 Terracotta)
- **Background**: #F9F9F7 (暖米色 Warm Beige)
- **Foreground**: #181818 (炭灰色 Charcoal)
- **Border**: #D5D3CB

### Common Patterns
- 主按钮: `bg-primary text-primary-foreground hover:bg-primary/90`
- 卡片: `bg-card border border-border rounded-xl`
- 标题: `font-serif text-foreground`

## 开发原则
- 本地正在 pnpm dev 编译，请你不要再手动编译测试
- 如无授权，**禁止** 自动写各种备用、fallback方案，仅需给出相应方案的文字说明即可
- 如无授权，**禁止** 自动写各种测试用例、测试方案，仅需给出相应方案的文字说明即可
- 每次回答完后要执行 pnpm type-check，如果有错误一直修复到没有错误为止

## 工具配置

- **包管理器**: 默认使用 pnpm 作为包管理器，除非项目特别指定使用其他包管理器

## SuperCompact 记录

最后执行时间: 2025-07-12 18:33:00
执行内容: 会话压缩 + 自动提交 + 项目文件更新
主要成就: 重构元素标记系统，实现互斥检测和文本输入框填充功能