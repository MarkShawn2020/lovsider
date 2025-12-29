import TurndownService from 'turndown';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';

export interface MarkdownConverterOptions {
  includeImages?: boolean;
  includeLists?: boolean;
  includeTables?: boolean;
  includeCodeBlocks?: boolean;
  customTitle?: string;
  customSlug?: string;
}

export class MarkdownConverter {
  private options: MarkdownConverterOptions;
  private turndownService: TurndownService;

  constructor(options: MarkdownConverterOptions = {}) {
    this.options = {
      includeImages: true,
      includeLists: true,
      includeTables: true,
      includeCodeBlocks: true,
      ...options,
    };

    // 初始化 Turndown 服务
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
    });

    // 添加 GitHub Flavored Markdown 支持（表格、删除线等）
    this.turndownService.use(gfm);

    // 配置自定义规则
    this.setupCustomRules();
  }

  convertToMarkdown(html: string, element?: Element): string {
    // 生成frontmatter
    const frontmatter = this.generateFrontmatter(element);

    // 使用 Turndown 转换
    const markdownContent = this.turndownService.turndown(html);

    // 组合frontmatter和内容
    return frontmatter + markdownContent;
  }

  getCleanHTML(element: Element): string {
    const clone = element.cloneNode(true) as Element;

    // 移除script和style标签
    clone.querySelectorAll('script, style').forEach(el => el.remove());

    // 移除事件处理器属性
    this.removeEventAttributes(clone);

    return clone.outerHTML;
  }

  private setupCustomRules(): void {}

  private generateFrontmatter(element?: Element): string {
    const now = new Date();
    const datetime = now.toISOString();
    const source = window.location.href;
    const title = this.options.customTitle || this.extractTitle(element);
    const slug = this.options.customSlug || this.generateSlug(title);

    return `---
title: ${title}
slug: ${slug}
source: ${source}
datetime: ${datetime}
---

`;
  }

  public extractTitle(element?: Element): string {
    // 1. 优先从选中的元素中提取标题
    if (element) {
      const titleFromElement = this.extractTitleFromElement(element);
      if (titleFromElement) {
        return titleFromElement;
      }
    }

    // 2. 从页面元数据中提取
    const metaTitle = this.extractMetaTitle();
    if (metaTitle) {
      return metaTitle;
    }

    // 3. 从页面标题中提取
    const pageTitle = document.title;
    if (pageTitle && pageTitle.trim()) {
      return this.cleanTitle(pageTitle);
    }

    // 4. 从URL中提取
    const urlTitle = this.extractTitleFromUrl();
    if (urlTitle) {
      return urlTitle;
    }

    // 5. 默认标题
    return 'Web Content';
  }

  private extractTitleFromElement(element: Element): string | null {
    // 如果选中的就是标题元素
    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)) {
      return this.cleanTitle(element.textContent || '');
    }

    // 查找选中元素内的第一个标题
    const heading = element.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
      return this.cleanTitle(heading.textContent || '');
    }

    // 查找选中元素内的title属性
    if (element.getAttribute('title')) {
      return this.cleanTitle(element.getAttribute('title') || '');
    }

    // 查找选中元素内的data-title属性
    const dataTitle = element.getAttribute('data-title');
    if (dataTitle) {
      return this.cleanTitle(dataTitle);
    }

    // 查找选中元素内的第一个strong或b标签
    const strongElement = element.querySelector('strong, b');
    if (strongElement && (strongElement.textContent?.length || 0) < 100) {
      return this.cleanTitle(strongElement.textContent || '');
    }

    // 从选中元素的文本内容中提取第一行作为标题
    const textContent = element.textContent?.trim() || '';
    if (textContent) {
      const firstLine = textContent.split('\n')[0].trim();
      if (firstLine.length > 5 && firstLine.length < 100) {
        return this.cleanTitle(firstLine);
      }
    }

    return null;
  }

  private extractMetaTitle(): string | null {
    // Open Graph标题
    const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
    if (ogTitle?.content) {
      return this.cleanTitle(ogTitle.content);
    }

    // Twitter卡片标题
    const twitterTitle = document.querySelector('meta[name="twitter:title"]') as HTMLMetaElement;
    if (twitterTitle?.content) {
      return this.cleanTitle(twitterTitle.content);
    }

    // 其他meta标题
    const metaTitle = document.querySelector('meta[name="title"]') as HTMLMetaElement;
    if (metaTitle?.content) {
      return this.cleanTitle(metaTitle.content);
    }

    return null;
  }

  private extractTitleFromUrl(): string | null {
    try {
      const url = new URL(window.location.href);
      const pathname = url.pathname;

      // 移除文件扩展名和路径分隔符
      const filename = pathname.split('/').pop();
      if (filename && filename !== '' && filename !== 'index') {
        return this.cleanTitle(filename.replace(/\.[^/.]+$/, ''));
      }

      // 从路径中提取有意义的部分
      const pathParts = pathname.split('/').filter(part => part && part !== 'index');
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        return this.cleanTitle(lastPart);
      }

      // 使用域名
      return this.cleanTitle(url.hostname.replace('www.', ''));
    } catch {
      return null;
    }
  }

  private cleanTitle(title: string): string {
    if (!title) return '';

    return title
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[^\w\s\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff_.()]/g, '')
      .substring(0, 100)
      .trim();
  }

  private generateSlug(title: string): string {
    if (!title) {
      title = 'untitled';
    }

    // 基础slug生成
    let slug = title
      .toLowerCase()
      .trim()
      .replace(/[\s\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]+/g, '-')
      .replace(/[^\w-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    // 如果slug为空或过短，使用时间戳
    if (!slug || slug.length < 3) {
      const now = new Date();
      slug = `content-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    }

    // 添加时间戳后缀以确保唯一性
    const timestamp = new Date().getTime();
    slug += `-${timestamp}`;

    return slug;
  }

  private removeEventAttributes(element: Element): void {
    const eventAttributes = ['onclick', 'onmouseover', 'onmouseout', 'onload', 'onerror'];

    eventAttributes.forEach(attr => {
      element.removeAttribute(attr);
    });

    element.querySelectorAll('*').forEach(el => {
      eventAttributes.forEach(attr => {
        el.removeAttribute(attr);
      });
    });
  }
}
