import type { ExcludeValuesFromBaseArrayType } from './types.js';

export const excludeValuesFromBaseArray = <B extends string[], E extends (string | number)[]>(
  baseArray: B,
  excludeArray: E,
) => baseArray.filter(value => !excludeArray.includes(value)) as ExcludeValuesFromBaseArrayType<B, E>;

export const sleep = async (time: number) => new Promise(r => setTimeout(r, time));

/**
 * 安全发送消息到 background script
 * 捕获 "Could not establish connection" 错误，避免开发模式下的报错
 */
export const safeSendMessage = async <T = unknown>(message: unknown): Promise<T | null> => {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    // 忽略 "Receiving end does not exist" 错误（开发模式常见）
    if (error instanceof Error && error.message.includes('Receiving end does not exist')) {
      console.debug('[safeSendMessage] Connection not available:', message);
      return null;
    }
    throw error;
  }
};

/**
 * 安全发送消息到指定 tab 的 content script
 */
export const safeSendTabMessage = async <T = unknown>(tabId: number, message: unknown): Promise<T | null> => {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Receiving end does not exist')) {
      console.debug('[safeSendTabMessage] Tab not ready:', tabId, message);
      return null;
    }
    throw error;
  }
};
