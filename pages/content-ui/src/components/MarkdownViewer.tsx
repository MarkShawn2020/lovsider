import { useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type MarkdownViewMode = 'raw' | 'side-by-side' | 'preview';

interface MarkdownViewerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  viewMode?: MarkdownViewMode;
  onViewModeChange?: (mode: MarkdownViewMode) => void;
}

// Markdown 渲染样式
const markdownStyles: React.CSSProperties = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#181818',
  padding: '12px 16px',
  height: '100%',
  overflow: 'auto',
};

// 共享的 markdown 组件配置
const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1
      style={{
        fontSize: '1.5em',
        fontWeight: 700,
        marginBottom: '0.5em',
        borderBottom: '1px solid #D5D3CB',
        paddingBottom: '0.3em',
      }}>
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 style={{ fontSize: '1.3em', fontWeight: 600, marginTop: '1em', marginBottom: '0.5em', color: '#CC785C' }}>
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 style={{ fontSize: '1.1em', fontWeight: 600, marginTop: '0.8em', marginBottom: '0.4em' }}>{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ marginBottom: '0.8em' }}>{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ fontWeight: 600, color: '#CC785C' }}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
  code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          style={{
            backgroundColor: 'rgba(204, 120, 92, 0.1)',
            padding: '0.2em 0.4em',
            borderRadius: '4px',
            fontSize: '0.9em',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}>
          {children}
        </code>
      );
    }
    return (
      <code
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '0.9em',
        }}>
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre
      style={{
        backgroundColor: '#f6f8fa',
        padding: '12px',
        borderRadius: '8px',
        overflow: 'auto',
        marginBottom: '1em',
        border: '1px solid #D5D3CB',
      }}>
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote
      style={{
        borderLeft: '3px solid #CC785C',
        paddingLeft: '12px',
        marginLeft: 0,
        marginBottom: '1em',
        color: '#666',
        fontStyle: 'italic',
      }}>
      {children}
    </blockquote>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul style={{ paddingLeft: '1.5em', marginBottom: '0.8em' }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol style={{ paddingLeft: '1.5em', marginBottom: '0.8em' }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li style={{ marginBottom: '0.3em' }}>{children}</li>,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #D5D3CB', margin: '1em 0' }} />,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#CC785C', textDecoration: 'underline' }}>
      {children}
    </a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <table
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        marginBottom: '1em',
        fontSize: '0.9em',
      }}>
      {children}
    </table>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th
      style={{
        border: '1px solid #D5D3CB',
        padding: '8px 12px',
        backgroundColor: '#f6f8fa',
        fontWeight: 600,
        textAlign: 'left',
      }}>
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td
      style={{
        border: '1px solid #D5D3CB',
        padding: '8px 12px',
      }}>
      {children}
    </td>
  ),
};

// 解析 markdown 分割成章节
interface Section {
  title: string;
  content: string;
}

function parseMarkdownSections(content: string): { preamble: string; sections: Section[] } {
  const lines = content.split('\n');
  let preamble = '';
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      // 保存之前的章节
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      } else if (currentContent.length > 0) {
        preamble = currentContent.join('\n').trim();
      }
      // 开始新章节
      currentSection = { title: h2Match[1], content: '' };
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // 保存最后一个章节
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  } else if (currentContent.length > 0) {
    preamble = currentContent.join('\n').trim();
  }

  return { preamble, sections };
}

// 可折叠章节组件
const CollapsibleSection = ({
  title,
  content,
  defaultExpanded = false,
}: {
  title: string;
  content: string;
  defaultExpanded?: boolean;
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #D5D3CB',
          borderRadius: expanded ? '8px 8px 0 0' : '8px',
          backgroundColor: expanded ? '#fff' : '#fafafa',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
        }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            fontSize: '10px',
            color: '#666',
            transition: 'transform 0.15s ease',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>
          ▶
        </span>
        <span style={{ fontSize: '1.1em', fontWeight: 600, color: '#CC785C' }}>{title}</span>
      </button>
      {expanded && (
        <div
          style={{
            padding: '12px 16px',
            border: '1px solid #D5D3CB',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            backgroundColor: '#fff',
          }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

// 带折叠功能的 Markdown 预览组件
const CollapsibleMarkdownPreview = ({ content }: { content: string }) => {
  const { preamble, sections } = useMemo(() => parseMarkdownSections(content), [content]);

  // 如果没有 h2 章节，使用普通预览
  if (sections.length === 0) {
    return (
      <div style={markdownStyles} className="markdown-preview">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div style={markdownStyles} className="markdown-preview">
      {/* 渲染 preamble（frontmatter 之前的内容） */}
      {preamble && (
        <div style={{ marginBottom: '16px' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {preamble}
          </ReactMarkdown>
        </div>
      )}
      {/* 渲染可折叠章节 */}
      {sections.map((section, index) => (
        <CollapsibleSection key={index} title={section.title} content={section.content} defaultExpanded={false} />
      ))}
    </div>
  );
};

// 简单 Markdown 预览组件（用于 side-by-side 模式）
const SimpleMarkdownPreview = ({ content }: { content: string }) => (
  <div style={markdownStyles} className="markdown-preview">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  </div>
);

// 模式切换按钮组
const ViewModeToggle = ({ mode, onChange }: { mode: MarkdownViewMode; onChange: (mode: MarkdownViewMode) => void }) => {
  const modes: { value: MarkdownViewMode; label: string; icon: React.ReactNode }[] = [
    {
      value: 'raw',
      label: 'Raw',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
          <path d="M10 9H8" />
        </svg>
      ),
    },
    {
      value: 'side-by-side',
      label: 'Side',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M12 3v18" />
        </svg>
      ),
    },
    {
      value: 'preview',
      label: 'Preview',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: '2px',
        backgroundColor: '#f0f0f0',
        padding: '2px',
        borderRadius: '6px',
      }}>
      {modes.map(m => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          title={m.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: mode === m.value ? '#fff' : 'transparent',
            color: mode === m.value ? '#CC785C' : '#666',
            fontSize: '11px',
            fontWeight: mode === m.value ? 500 : 400,
            cursor: 'pointer',
            boxShadow: mode === m.value ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s ease',
          }}>
          {m.icon}
          {m.label}
        </button>
      ))}
    </div>
  );
};

export const MarkdownViewer = ({
  value,
  onChange,
  placeholder = '内容...',
  viewMode: controlledViewMode,
  onViewModeChange,
}: MarkdownViewerProps) => {
  const [internalViewMode, setInternalViewMode] = useState<MarkdownViewMode>('raw');

  // 支持受控和非受控模式
  const viewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = (mode: MarkdownViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const textareaStyle: React.CSSProperties = {
    flex: 1,
    padding: '12px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#181818',
    fontSize: '12px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    resize: 'none',
    outline: 'none',
    height: '100%',
    width: '100%',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}>
      {/* Header with view mode toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: '1px solid #eee',
          backgroundColor: '#fafafa',
        }}>
        <span style={{ fontSize: '11px', color: '#666', fontWeight: 500 }}>Markdown</span>
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Content area */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
          backgroundColor: viewMode === 'preview' ? '#fff' : '#f5f5f5',
        }}>
        {viewMode === 'raw' && (
          <textarea value={value} onChange={handleChange} placeholder={placeholder} style={textareaStyle} />
        )}

        {viewMode === 'side-by-side' && (
          <>
            <div style={{ flex: 1, borderRight: '1px solid #D5D3CB', overflow: 'hidden' }}>
              <textarea value={value} onChange={handleChange} placeholder={placeholder} style={textareaStyle} />
            </div>
            <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#fff' }}>
              <SimpleMarkdownPreview content={value} />
            </div>
          </>
        )}

        {viewMode === 'preview' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <CollapsibleMarkdownPreview content={value} />
          </div>
        )}
      </div>
    </div>
  );
};
