<p align="center">
  <img src="docs/images/cover.png" alt="LovSider Cover" width="100%">
</p>

<h1 align="center">
  <img src="assets/logo.svg" width="32" height="32" alt="Logo" align="top">
  LovSider
</h1>

<p align="center">
  <strong>AI Chat Export & Web Capture Toolkit</strong><br>
  <sub>Chrome Extension · Firefox Add-on</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

## Highlights

### AI Chat Export

Export conversations from **Claude.ai** and **Google AI Studio** with full fidelity.

<p align="center">
  <img src="docs/images/ai-export.png" alt="AI Chat Export" width="600">
</p>

- **Backend API-based** - Fetches complete conversation data, not DOM scraping
- **Thinking Process** - Toggle to include/exclude AI's thinking blocks
- **Multiple Formats** - Export as Markdown or JSON
- **One-click Download** - Copy to clipboard or download as file

---

## Features

### Page Capture
- **Smart Selection** - Auto-detect main content areas
- **Manual Selection** - Click to select any DOM element
- **Markdown Export** - One-click convert and download

### Form Auto-fill
- Detect form fields on pages
- Template-based filling
- Simulate real typing behavior

### Developer Tools
- Element marking (inputs, containers)
- Form debugging
- Command-line interface

### Floating Badge
- Draggable positioning
- Right-click menu for quick actions
- Hide per-site or globally

## Installation

```bash
# Clone repository
git clone https://github.com/MarkShawn2020/lovsider.git
cd lovsider

# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build
pnpm build
```

### Load Extension

**Chrome:**
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `dist` directory

**Firefox:**
1. Run `pnpm dev:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select `dist/manifest.json`

## Project Structure

```
lovsider/
├── chrome-extension/     # Extension entry (manifest, background)
├── pages/
│   ├── side-panel/       # Sidebar main UI
│   ├── content/          # Content scripts
│   ├── popup/            # Popup window
│   └── options/          # Settings page
└── packages/
    ├── shared/           # Shared utilities
    ├── storage/          # Storage wrapper
    ├── ui/               # UI components
    └── i18n/             # Internationalization
```

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Build**: Vite + Turborepo
- **Styling**: Tailwind CSS + shadcn/ui
- **Extension**: Chrome Extension Manifest V3

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Toggle sidebar |
| `Escape` | Exit selection mode |

## License

[MIT](LICENSE)
