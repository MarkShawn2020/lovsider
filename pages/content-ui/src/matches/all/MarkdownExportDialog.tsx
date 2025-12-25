import { useState, useEffect, useMemo } from 'react';

interface MarkdownData {
  markdown: string;
  presetName?: string;
}

interface ParsedMarkdown {
  frontmatter: { title?: string; source?: string; [key: string]: string | undefined };
  content: string;
}

type ExportAction = 'download' | 'copy';

// 解析 frontmatter
function parseFrontmatter(markdown: string): ParsedMarkdown {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return { frontmatter: {}, content: markdown };
  }

  const frontmatterStr = frontmatterMatch[1];
  const content = frontmatterMatch[2];
  const frontmatter: ParsedMarkdown['frontmatter'] = {};

  for (const line of frontmatterStr.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content };
}

// 生成 markdown
function generateMarkdown(parsed: ParsedMarkdown): string {
  const frontmatterLines = Object.entries(parsed.frontmatter)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`);

  if (frontmatterLines.length === 0) {
    return parsed.content;
  }

  return `---\n${frontmatterLines.join('\n')}\n---\n${parsed.content}`;
}

// 提取标题
function extractTitleFromMarkdown(markdown: string): string {
  const parsed = parseFrontmatter(markdown);
  if (parsed.frontmatter.title) return parsed.frontmatter.title;

  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1];

  const firstLine = markdown.split('\n').find(line => line.trim());
  return firstLine?.slice(0, 50) || 'export';
}

export const MarkdownExportDialog = () => {
  const [open, setOpen] = useState(false);
  const [markdownData, setMarkdownData] = useState<MarkdownData | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [exportAction, setExportAction] = useState<ExportAction>('download');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => parseFrontmatter(markdown), [markdown]);

  // 监听消息
  useEffect(() => {
    console.log('[Lovsider] MarkdownExportDialog 已挂载，开始监听消息');
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'lovsider-open-markdown-export') {
        console.log('[Lovsider] 收到 lovsider-open-markdown-export 消息', event.data);
        const data = (event.data?.data || { markdown: '' }) as MarkdownData;
        setMarkdownData(data);
        setMarkdown(data.markdown || '');
        setOpen(true);
        setCopied(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 更新 frontmatter 字段
  const updateFrontmatterField = (key: string, value: string) => {
    const newParsed = {
      ...parsed,
      frontmatter: { ...parsed.frontmatter, [key]: value },
    };
    setMarkdown(generateMarkdown(newParsed));
  };

  // 更新正文
  const updateContent = (content: string) => {
    setMarkdown(generateMarkdown({ ...parsed, content }));
  };

  // 复制到剪贴板
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 下载
  const downloadMarkdown = () => {
    const title = extractTitleFromMarkdown(markdown);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${title.replace(/[/\\:*?"<>|]/g, '-').slice(0, 50)}-${dateStr}.md`;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 关闭
  const closeDialog = () => {
    setOpen(false);
    setShowExportMenu(false);
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        role="button"
        tabIndex={0}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999999,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          transition: 'opacity 0.2s',
        }}
        onClick={closeDialog}
        onKeyDown={e => e.key === 'Escape' && closeDialog()}
      />

      {/* Dialog */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999999,
          width: '520px',
          maxWidth: '90vw',
          maxHeight: '85vh',
          borderRadius: '16px',
          border: '1px solid #D5D3CB',
          backgroundColor: '#F9F9F7',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
        {/* Close button */}
        <button
          onClick={closeDialog}
          style={{
            position: 'absolute',
            right: '16px',
            top: '16px',
            padding: '6px',
            borderRadius: '8px',
            border: 'none',
            background: 'transparent',
            color: '#666',
            cursor: 'pointer',
            zIndex: 1,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        {/* Header */}
        <div
          style={{
            borderBottom: '1px solid #D5D3CB',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 500, color: '#181818', margin: 0 }}>Markdown 内容</h2>
            {markdownData?.presetName && (
              <span
                style={{
                  backgroundColor: 'rgba(204, 120, 92, 0.1)',
                  color: '#CC785C',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '12px',
                }}>
                {markdownData.presetName}
              </span>
            )}
          </div>

          {/* Split Button */}
          <div style={{ position: 'relative', marginRight: '32px' }}>
            <div style={{ display: 'flex' }}>
              <button
                onClick={exportAction === 'download' ? downloadMarkdown : copyToClipboard}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px 0 0 8px',
                  border: 'none',
                  backgroundColor: '#CC785C',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}>
                {exportAction === 'download' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                ) : copied ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
                <span>{exportAction === 'download' ? '下载' : copied ? '已复制' : '复制'}</span>
              </button>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '0 8px 8px 0',
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: '#CC785C',
                  color: '#fff',
                  cursor: 'pointer',
                }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ transform: showExportMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  minWidth: '120px',
                  borderRadius: '8px',
                  border: '1px solid #D5D3CB',
                  backgroundColor: '#F9F9F7',
                  padding: '4px 0',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 10,
                }}>
                <button
                  onClick={() => {
                    setExportAction('download');
                    setShowExportMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    backgroundColor: exportAction === 'download' ? '#f0f0f0' : 'transparent',
                    color: '#181818',
                    fontSize: '14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  下载
                </button>
                <button
                  onClick={() => {
                    setExportAction('copy');
                    setShowExportMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    backgroundColor: exportAction === 'copy' ? '#f0f0f0' : 'transparent',
                    color: '#181818',
                    fontSize: '14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  复制
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Frontmatter Form */}
        <div style={{ borderBottom: '1px solid #D5D3CB', padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <label style={{ width: '48px', fontSize: '12px', color: '#666', flexShrink: 0 }}>标题</label>
            <input
              type="text"
              value={parsed.frontmatter.title || ''}
              onChange={e => updateFrontmatterField('title', e.target.value)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #D5D3CB',
                backgroundColor: '#fff',
                color: '#181818',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ width: '48px', fontSize: '12px', color: '#666', flexShrink: 0 }}>来源</label>
            <input
              type="text"
              value={parsed.frontmatter.source || ''}
              onChange={e => updateFrontmatterField('source', e.target.value)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #D5D3CB',
                backgroundColor: '#fff',
                color: '#181818',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Content Editor */}
        <textarea
          value={parsed.content}
          onChange={e => updateContent(e.target.value)}
          style={{
            flex: 1,
            minHeight: '250px',
            padding: '16px 20px',
            border: 'none',
            backgroundColor: '#f0f0f0',
            color: '#181818',
            fontSize: '12px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            resize: 'none',
            outline: 'none',
          }}
        />
      </div>
    </>
  );
};
