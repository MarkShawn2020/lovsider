import {
  ElementSelector,
  FormDetector,
  FormFiller,
  ElementMarker,
  FloatingBadge,
  FloatingBadgeSimple,
  AIExportBadge,
  safeSendMessage,
} from '@extension/shared';
import type { FormFillRequest, SitePreset, FloatingBadgeConfig } from '@extension/shared';

console.debug('[Lovsider] Content script loaded');

// 内置预设（保持与SitePresetsPanel.tsx中的一致）
const BUILT_IN_PRESETS: SitePreset[] = [
  {
    id: 'wechat',
    name: '微信公众号',
    patterns: ['https://mp.weixin.qq.com/s/', 'mp.weixin.qq.com/s/'],
    selectors: ['#img-content'],
    priority: 10,
  },
  {
    id: 'zhihu',
    name: '知乎',
    patterns: ['zhihu.com/question', 'zhihu.com/p/'],
    selectors: ['.Post-RichTextContainer', '.QuestionAnswer-content', '.RichContent-inner'],
    priority: 10,
  },
  {
    id: 'juejin',
    name: '掘金',
    patterns: ['juejin.cn/post', 'juejin.im/post'],
    selectors: ['.article-content', '.markdown-body'],
    priority: 10,
  },
  {
    id: 'medium',
    name: 'Medium',
    patterns: ['medium.com'],
    selectors: ['article', '.meteredContent', 'main article'],
    priority: 10,
  },
  {
    id: 'devto',
    name: 'Dev.to',
    patterns: ['dev.to'],
    selectors: ['#article-body', '.crayons-article__body'],
    priority: 10,
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    patterns: ['stackoverflow.com/questions'],
    selectors: ['.answercell', '.question', '.post-text'],
    priority: 10,
  },
  {
    id: 'github',
    name: 'GitHub',
    patterns: ['github.com'],
    selectors: ['.markdown-body', '#readme', '.comment-body'],
    priority: 10,
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    patterns: ['wikipedia.org/wiki'],
    selectors: ['#mw-content-text', '.mw-parser-output'],
    priority: 10,
  },
  {
    id: 'claude',
    name: 'Claude AI',
    patterns: ['claude.ai/chat'],
    selectors: ['[data-testid="conversation-turn-first"]', '.font-claude-message', '[class*="prose"]'],
    priority: 15,
  },
  {
    id: 'aistudio',
    name: 'Google AI Studio',
    patterns: ['aistudio.google.com/prompts'],
    selectors: ['[data-turn-role]', '.response-container', 'ms-chat-turn'],
    priority: 15,
  },
];

// 存储最后选择的 markdown 数据，用于快捷键导出
let lastMarkdownData: { markdown: string; presetName?: string } | null = null;

class LovsiderElementSelector extends ElementSelector {
  protected onElementSelected(): void {
    const data = this.getSelectedElementData();
    if (data) {
      // 存储数据用于快捷键导出
      lastMarkdownData = {
        markdown: data.markdown,
        presetName: data.presetMatch?.presetName,
      };

      // 发送数据到侧边栏
      safeSendMessage({
        action: 'elementSelected',
        html: data.html,
        markdown: data.markdown,
        slug: data.slug,
        domPath: data.domPath,
        presetMatch: data.presetMatch,
      });
    }

    // 通知侧边栏导航模式已退出
    safeSendMessage({
      action: 'navigationExited',
    });
  }

  protected onElementDataUpdate(): void {
    const data = this.getSelectedElementData();
    if (data) {
      // 更新存储的数据
      lastMarkdownData = {
        markdown: data.markdown,
        presetName: data.presetMatch?.presetName,
      };

      // 实时更新侧边栏中的数据
      safeSendMessage({
        action: 'elementDataUpdate',
        html: data.html,
        markdown: data.markdown,
        slug: data.slug,
        domPath: data.domPath,
        presetMatch: data.presetMatch,
      });
    }
  }

  protected onSelectionCancelled(): void {
    // 通知侧边栏选择已停止
    safeSendMessage({
      action: 'selectionStopped',
    });
  }
}

// 创建选择器实例（初始化时先使用默认预设）
let selector = new LovsiderElementSelector({
  enableNavigation: true,
  showStatusMessages: true,
  sitePresets: BUILT_IN_PRESETS,
});

// 异步加载用户配置的预设
async function loadUserPresets() {
  try {
    // Chrome API 不可用时跳过
    if (!chrome?.storage?.local) return;

    // 从storage获取用户配置
    const result = await chrome.storage.local.get('site-presets-storage-key');
    if (result['site-presets-storage-key']) {
      const storageData = result['site-presets-storage-key'];
      const settings = storageData.settings;

      // 处理内置预设，应用覆盖并过滤禁用的
      const enabledBuiltInPresets = BUILT_IN_PRESETS.map((preset, index) => {
        const presetId = ['wechat', 'zhihu', 'juejin', 'medium', 'devto', 'stackoverflow', 'github', 'wikipedia'][
          index
        ];

        // 如果被禁用，返回null
        if (settings.disabledBuiltInPresets?.includes(presetId)) {
          return null;
        }

        // 应用覆盖
        const override = settings.builtInPresetOverrides?.[presetId];
        if (override) {
          return {
            patterns: override.patterns || preset.patterns,
            selectors: override.selectors || preset.selectors,
            priority: override.priority !== undefined ? override.priority : preset.priority,
          };
        }

        return preset;
      }).filter((preset): preset is (typeof BUILT_IN_PRESETS)[0] => preset !== null);

      // 获取启用的自定义预设
      const enabledCustomPresets = (settings.customPresets || [])
        .filter((preset: any) => preset.enabled)
        .map((preset: any) => ({
          patterns: preset.patterns,
          selectors: preset.selectors,
          priority: preset.priority || 10,
        }));

      // 合并预设，自定义预设优先级更高
      const allPresets = [...enabledBuiltInPresets, ...enabledCustomPresets];

      // 重新创建选择器实例
      selector = new LovsiderElementSelector({
        enableNavigation: true,
        showStatusMessages: true,
        sitePresets: allPresets,
      });

      console.log('[Lovsider] 预设配置已加载，共', allPresets.length, '个预设');
    }
  } catch (error) {
    console.error('[Lovsider] 加载预设配置失败:', error);
  }
}

// 初始化时加载用户预设
loadUserPresets();

// 监听存储变化，实时更新预设
chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName === 'local' && changes['site-presets-storage-key']) {
    console.log('[Lovsider] 检测到预设配置变化，重新加载');
    loadUserPresets();
  }
});

// 创建表单处理实例
const formDetector = new FormDetector();
const formFiller = new FormFiller();

// 创建元素标记实例
const elementMarker = new ElementMarker();

// 监听来自侧边栏的消息
chrome.runtime?.onMessage?.addListener(
  (request: unknown, _sender: unknown, sendResponse: (response?: unknown) => void) => {
    if (!request || typeof request !== 'object') return false;

    const msg = request as { action?: string; domPath?: string; text?: string; data?: unknown };
    if (msg.action === 'startSelection') {
      selector.startSelection();
      sendResponse({ success: true });
    } else if (msg.action === 'stopSelection') {
      selector.stopSelection();
      sendResponse({ success: true });
    } else if (msg.action === 'smartSelect') {
      selector.smartSelect();
      sendResponse({ success: true });
    } else if (msg.action === 'applyDomPath') {
      try {
        const element = document.querySelector(msg.domPath || '');
        if (element) {
          selector.setSelectedElement(element);
          selector.highlightSelectedElement();
          selector.triggerElementSelected(element);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: '未找到指定元素' });
        }
      } catch {
        sendResponse({ success: false, error: '无效的DOM路径' });
      }
    } else if (msg.action === 'reselectFromPath') {
      try {
        const element = document.querySelector(msg.domPath || '');
        if (element) {
          selector.selectAndNavigate(element);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: '未找到指定元素' });
        }
      } catch {
        sendResponse({ success: false, error: '无效的DOM路径' });
      }
    } else if (msg.action === 'copyToClipboard') {
      // 处理剪贴板复制请求
      if (msg.text) {
        navigator.clipboard
          .writeText(msg.text)
          .then(() => {
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('[Lovsider] Failed to copy to clipboard:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // 保持消息通道开放
      } else {
        sendResponse({ success: false, error: '没有提供要复制的文本' });
      }
    } else if (msg.action === 'detectForms') {
      // 检测表单
      try {
        const forms = formDetector.detectForms();

        // 视觉标记检测到的表单字段
        formDetector.highlightFormFields(forms);

        sendResponse({
          success: true,
          message: `检测到 ${forms.length} 个表单，已在页面上标记字段`,
          data: forms.map(form => ({
            formSelector: form.formSelector,
            formType: form.formType,
            confidence: form.confidence,
            fields: form.fields.map(field => ({
              id: field.id,
              type: field.type,
              label: field.label,
              required: field.required,
            })),
          })),
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '表单检测失败',
        });
      }
    } else if (msg.action === 'fillForm') {
      // 填写表单
      if (msg.data) {
        formFiller
          .fillForm(msg.data as FormFillRequest)
          .then(result => {
            sendResponse({
              success: result.success,
              message: result.message,
              data: {
                filledCount: result.filledCount,
                failedFields: result.failedFields,
                duration: result.duration,
              },
            });
          })
          .catch(error => {
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : '填写表单失败',
            });
          });
        return true; // 保持消息通道开放
      } else {
        sendResponse({ success: false, error: '没有提供表单数据' });
      }
    } else if (msg.action === 'clearForm') {
      // 清空表单
      try {
        const result = formFiller.clearForm(
          (msg.data as { formSelector?: string })?.formSelector || 'form:first-of-type',
        );
        sendResponse({
          success: result.success,
          message: result.message,
          data: {
            filledCount: result.filledCount,
            duration: result.duration,
          },
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '清空表单失败',
        });
      }
    } else if (msg.action === 'validateForm') {
      // 验证表单
      try {
        const result = formFiller.validateForm(
          (msg.data as { formSelector?: string })?.formSelector || 'form:first-of-type',
        );
        sendResponse({
          success: result.isValid,
          message: result.isValid ? '表单验证通过' : '表单验证失败',
          data: {
            isValid: result.isValid,
            errors: result.errors,
          },
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '表单验证失败',
        });
      }
    } else if (msg.action === 'clearHighlights') {
      // 清除表单高亮
      try {
        formDetector.clearHighlights();
        sendResponse({
          success: true,
          message: '已清除表单字段标记',
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '清除标记失败',
        });
      }
    } else if (msg.action === 'highlightForm') {
      // 高亮指定表单
      try {
        const formSelector = (msg.data as { formSelector?: string })?.formSelector || 'form:first-of-type';
        formDetector.highlightSpecificForm(formSelector);
        sendResponse({
          success: true,
          message: `已标记表单 ${formSelector} 的字段`,
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '标记表单失败',
        });
      }
    } else if (msg.action === 'debugForms') {
      // 调试表单检测
      try {
        console.log('=== 表单调试信息 ===');

        // 检测所有form标签
        const formTags = Array.from(document.querySelectorAll('form'));
        console.log(`找到 ${formTags.length} 个 <form> 标签:`);
        formTags.forEach((form, index) => {
          const inputs = form.querySelectorAll('input, textarea, select');
          console.log(`  表单 ${index + 1}: ${inputs.length} 个字段`, form);
        });

        // 检测所有输入元素
        const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
        console.log(`\n页面总共有 ${allInputs.length} 个输入元素:`);
        allInputs.forEach((input, index) => {
          const htmlInput = input as HTMLInputElement;
          console.log(
            `  ${index + 1}. ${htmlInput.tagName} [${htmlInput.type || 'text'}] - ${htmlInput.name || htmlInput.id || '无标识'}`,
          );
        });

        // 运行完整检测
        const forms = formDetector.detectForms();
        console.log(`\n检测结果: ${forms.length} 个表单`);
        forms.forEach((form, index) => {
          console.log(
            `表单 ${index + 1}: ${form.formSelector} (${form.formType}, 置信度: ${Math.round(form.confidence * 100)}%)`,
          );
          console.log(`  包含 ${form.fields.length} 个字段:`);
          form.fields.forEach((field, fieldIndex) => {
            console.log(`    ${fieldIndex + 1}. ${field.type}: ${field.label || '无标签'} - ${field.selector}`);
          });
        });

        sendResponse({
          success: true,
          message: '调试信息已输出到浏览器控制台（F12 > Console）',
          data: {
            formTags: formTags.length,
            totalInputs: allInputs.length,
            detectedForms: forms.length,
          },
        });
      } catch (error) {
        console.error('调试失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '调试失败',
        });
      }
    } else if (msg.action === 'markAllElements') {
      // 标记所有元素
      try {
        const elements = elementMarker.markAllElements();
        const stats = elementMarker.getMarkingStats();

        sendResponse({
          success: true,
          message: `已标记 ${elements.length} 个元素`,
          data: {
            totalElements: elements.length,
            stats,
            elements: elements.map(el => ({
              type: el.type,
              label: el.label,
              selector: el.selector,
            })),
          },
        });
      } catch (error) {
        console.error('标记所有元素失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '标记失败',
        });
      }
    } else if (msg.action === 'markInputs') {
      // 标记输入元素
      try {
        const elements = elementMarker.markInputElements();

        sendResponse({
          success: true,
          message: `已标记 ${elements.length} 个输入元素`,
          data: {
            totalElements: elements.length,
            elements: elements.map(el => ({
              type: el.type,
              label: el.label,
              selector: el.selector,
            })),
          },
        });
      } catch (error) {
        console.error('标记输入元素失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '标记失败',
        });
      }
    } else if (msg.action === 'markContainers') {
      // 标记容器元素
      try {
        const elements = elementMarker.markContainerElements();

        sendResponse({
          success: true,
          message: `已标记 ${elements.length} 个容器元素`,
          data: {
            totalElements: elements.length,
            elements: elements.map(el => ({
              type: el.type,
              label: el.label,
              selector: el.selector,
            })),
          },
        });
      } catch (error) {
        console.error('标记容器元素失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '标记失败',
        });
      }
    } else if (msg.action === 'clearAllMarks') {
      // 清除所有标记
      try {
        elementMarker.clearMarkers();

        sendResponse({
          success: true,
          message: '已清除所有元素标记',
        });
      } catch (error) {
        console.error('清除标记失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '清除失败',
        });
      }
    } else if (msg.action === 'fillAllTextInputs') {
      // 填充所有文本输入框
      try {
        const text = (msg.data as { text?: string })?.text || '111';
        const result = elementMarker.fillAllTextInputs(text);

        sendResponse({
          success: result.success,
          message: result.message,
          data: {
            filledCount: result.filledCount,
          },
        });
      } catch (error) {
        console.error('填充文本输入框失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '填充失败',
        });
      }
    } else if (msg.action === 'getClaudeOrgId') {
      // 从 Claude 页面获取 orgId
      try {
        // 方法1: 从 URL 或 localStorage 中获取
        let orgId: string | null = null;

        // 尝试从 localStorage 获取
        const lsKeys = Object.keys(localStorage);
        for (const key of lsKeys) {
          if (key.includes('organization') || key.includes('org')) {
            try {
              const value = localStorage.getItem(key);
              if (value) {
                const parsed = JSON.parse(value);
                if (parsed.uuid || parsed.id || parsed.organizationId) {
                  orgId = parsed.uuid || parsed.id || parsed.organizationId;
                  break;
                }
              }
            } catch {
              // 忽略解析错误
            }
          }
        }

        // 方法2: 从页面中的 script 标签或 __NEXT_DATA__ 获取
        if (!orgId) {
          const nextDataEl = document.getElementById('__NEXT_DATA__');
          if (nextDataEl) {
            try {
              const nextData = JSON.parse(nextDataEl.textContent || '{}');
              // 尝试从各种可能的路径获取 orgId
              orgId =
                nextData?.props?.pageProps?.organizationId ||
                nextData?.props?.pageProps?.org?.uuid ||
                nextData?.props?.initialState?.organization?.uuid;
            } catch {
              // 忽略解析错误
            }
          }
        }

        // 方法3: 从页面网络请求中嗅探（查找已发起的请求）
        if (!orgId) {
          // 尝试从 performance entries 中获取
          const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          for (const entry of entries) {
            const match = entry.name.match(/\/organizations\/([a-f0-9-]+)\//);
            if (match) {
              orgId = match[1];
              break;
            }
          }
        }

        sendResponse({ success: !!orgId, orgId });
      } catch (error) {
        console.error('获取 Claude orgId 失败:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '获取失败' });
      }
    } else if (msg.action === 'fetchClaudeChat') {
      // 在页面上下文中 fetch Claude 聊天数据
      const { chatId, orgId } = msg as { chatId?: string; orgId?: string };

      if (!chatId || !orgId) {
        sendResponse({ success: false, error: '缺少 chatId 或 orgId' });
        return false;
      }

      // 使用 fetch API 获取聊天数据（会自动携带 cookies）
      fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${chatId}?tree=True&rendering_mode=messages&render_all_tools=true`,
        {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
          },
        },
      )
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          sendResponse({ success: true, data });
        })
        .catch(error => {
          console.error('获取 Claude 聊天数据失败:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : '获取失败' });
        });

      return true; // 保持消息通道开放
    } else if (msg.action === 'fetchGoogleAIStudioChat') {
      // 从 Google AI Studio API 获取聊天数据
      const { promptId } = msg as { promptId?: string };

      if (!promptId) {
        sendResponse({ success: false, error: '缺少 promptId' });
        return false;
      }

      // 生成 SAPISIDHASH 认证头
      // 算法: SAPISIDHASH timestamp_sha1(timestamp + " " + SAPISID + " " + origin)
      const generateSapisidHash = async (sapisid: string, origin: string): Promise<string> => {
        const timestamp = Math.floor(Date.now() / 1000);
        const input = `${timestamp} ${sapisid} ${origin}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return `${timestamp}_${hashHex}`;
      };

      // 从 cookie 中获取 SAPISID
      const getCookie = (name: string): string | null => {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : null;
      };

      const sapisid = getCookie('SAPISID') || getCookie('__Secure-3PAPISID');
      if (!sapisid) {
        sendResponse({ success: false, error: '未找到认证信息，请确保已登录 Google' });
        return false;
      }

      const origin = 'https://aistudio.google.com';

      generateSapisidHash(sapisid, origin)
        .then(hash => {
          const authHeader = `SAPISIDHASH ${hash}`;

          return fetch(
            'https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/ResolveDriveResource',
            {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json+protobuf',
                Authorization: authHeader,
                'x-goog-api-key': 'AIzaSyDdP816MREB3SkjZO04QXbjsigfcI0GWOs',
                'x-user-agent': 'grpc-web-javascript/0.1',
                Origin: origin,
              },
              body: JSON.stringify([promptId]),
            },
          );
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          sendResponse({ success: true, data });
        })
        .catch(error => {
          console.error('获取 Google AI Studio 聊天数据失败:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : '获取失败' });
        });

      return true; // 保持消息通道开放
    } else if (msg.action === 'openMarkdownExport') {
      // 打开统一导出弹窗（剪贴板模式）
      console.log('[Lovsider] 收到 openMarkdownExport 消息', msg.data);
      const platformInfo = AIExportBadge.detectPlatform();
      window.postMessage(
        {
          type: 'lovsider-open-unified-export',
          platformInfo,
          markdownData: msg.data,
        },
        '*',
      );
      console.log('[Lovsider] 已发送 postMessage');
      sendResponse({ success: true });
    } else if (msg.action === 'urlChanged') {
      // URL 变化时通知 content-ui
      window.postMessage({ type: 'lovsider-url-changed' }, '*');
      sendResponse({ success: true });
    }

    return false;
  },
);

// 导出选择器实例供调试使用
(window as unknown as { lovsiderSelector: typeof selector }).lovsiderSelector = selector;

// 初始化悬浮徽章 - 极简版本
let floatingBadge: FloatingBadgeSimple | null = null;

async function initializeFloatingBadge() {
  try {
    // Chrome API 不可用时跳过
    if (!chrome?.storage?.local) return;

    // 获取当前网站的 hostname
    const hostname = window.location.hostname;

    // 从存储获取配置
    const result = await chrome.storage.local.get('floating-badge-storage-key');
    const storageData = result['floating-badge-storage-key'];

    if (!storageData) {
      // 使用默认配置
      floatingBadge = new FloatingBadgeSimple();
      floatingBadge.init();
      return;
    }

    // 检查是否应该在当前网站显示
    const { enabled, config, states, blacklist, whitelist, useWhitelist } = storageData;

    if (!enabled) {
      console.log('[Lovsider] 悬浮徽章已禁用');
      return;
    }

    // 检查黑名单
    if (blacklist && blacklist.includes(hostname)) {
      console.log('[Lovsider] 当前网站在黑名单中，不显示悬浮徽章');
      return;
    }

    // 检查白名单模式
    if (useWhitelist && whitelist && !whitelist.includes(hostname)) {
      console.log('[Lovsider] 当前网站不在白名单中，不显示悬浮徽章');
      return;
    }

    // 创建悬浮徽章 - 极简版本
    floatingBadge = new FloatingBadgeSimple();
    floatingBadge.init();

    console.log('[Lovsider] 悬浮徽章已初始化');
  } catch (error) {
    console.error('[Lovsider] 初始化悬浮徽章失败:', error);
  }
}

// 监听存储变化，实时更新悬浮徽章
chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName === 'local' && changes['floating-badge-storage-key']) {
    console.log('[Lovsider] 检测到悬浮徽章配置变化');

    // 销毁现有徽章
    if (floatingBadge) {
      floatingBadge.destroy();
      floatingBadge = null;
    }

    // 重新初始化
    initializeFloatingBadge();
  }
});

// 监听来自 popup 或 sidebar 的消息
chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleFloatingBadge') {
    if (floatingBadge) {
      floatingBadge.toggle();
    }
    sendResponse({ success: true });
  } else if (request.action === 'hideFloatingBadge') {
    if (floatingBadge) {
      floatingBadge.hide();
    }
    sendResponse({ success: true });
  } else if (request.action === 'showFloatingBadge') {
    if (floatingBadge) {
      floatingBadge.show();
    }
    sendResponse({ success: true });
  } else if (request.action === 'sidebarStateChanged') {
    // 更新徽章的侧边栏状态
    if (floatingBadge) {
      floatingBadge.updateSidebarState(request.isOpen);
    }
    sendResponse({ success: true });
  }
  return false;
});

// 初始化 AI 导出按钮（仅在 AI 平台页面显示）
let aiExportBadge: AIExportBadge | null = null;

function initializeAIExportBadge() {
  // 检测是否是 AI 平台页面
  if (AIExportBadge.detectPlatform()) {
    aiExportBadge = new AIExportBadge();
    aiExportBadge.init();
  }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeFloatingBadge();
    initializeAIExportBadge();
  });
} else {
  // 延迟初始化，避免影响页面加载
  setTimeout(() => {
    initializeFloatingBadge();
    initializeAIExportBadge();
  }, 500);
}

// 监听 Shift+Cmd+P / Shift+Ctrl+P 快捷键打开导出弹窗
document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Shift+Cmd+P (Mac) 或 Shift+Ctrl+P (Windows/Linux)
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
    // 检查是否在输入框中
    const activeEl = document.activeElement;
    if (
      activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLTextAreaElement ||
      (activeEl instanceof HTMLElement && activeEl.isContentEditable)
    ) {
      return; // 不阻止输入框中的快捷键
    }

    e.preventDefault();

    console.log('[Lovsider] Shift+Cmd+P 打开统一导出弹窗');

    // 检测是否在 AI 平台
    const platformInfo = AIExportBadge.detectPlatform();

    // 发送统一导出消息的辅助函数
    const sendUnifiedExportMessage = (markdownData: { markdown: string; presetName?: string } | null) => {
      window.postMessage(
        {
          type: 'lovsider-open-unified-export',
          platformInfo,
          markdownData,
        },
        '*',
      );
    };

    // 如果有选择过内容，直接使用
    if (lastMarkdownData) {
      sendUnifiedExportMessage(lastMarkdownData);
      return;
    }

    // 否则尝试读取剪贴板内容作为默认正文
    navigator.clipboard
      .readText()
      .then(clipboardText => {
        const data = {
          markdown: `---\ntitle: ${document.title}\nsource: ${window.location.href}\n---\n\n${clipboardText || ''}`,
        };
        sendUnifiedExportMessage(data);
      })
      .catch(() => {
        // 剪贴板读取失败时使用空内容
        const data = {
          markdown: `---\ntitle: ${document.title}\nsource: ${window.location.href}\n---\n\n`,
        };
        sendUnifiedExportMessage(data);
      });
  }
});
