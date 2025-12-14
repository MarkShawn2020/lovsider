import { floatingBadgeStorage } from '@extension/storage';
import { useState, useEffect } from 'react';
import type { FloatingBadgeConfig } from '@extension/storage';

export const FloatingBadgePanel = ({ onClose }: { onClose: () => void }) => {
  const [enabled, setEnabled] = useState(true);
  const [config, setConfig] = useState<FloatingBadgeConfig>({
    position: 'right',
    offset: { x: 20, y: 100 },
    size: 'medium',
    theme: 'auto',
    showTooltip: true,
    autoHide: false,
    autoHideDelay: 3000,
    enableDragging: true,
    enableSnapping: true,
    verticalDragOnly: true,
    opacity: 0.9,
  });
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [useWhitelist, setUseWhitelist] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [saveFeedback, setSaveFeedback] = useState('');
  const [currentHostname, setCurrentHostname] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await floatingBadgeStorage.getSettings();
        setEnabled(data.enabled);
        setConfig(data.config);
        setBlacklist(data.blacklist || []);
        setWhitelist(data.whitelist || []);
        setUseWhitelist(data.useWhitelist || false);

        // 获取当前网站 hostname
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.url) {
          setCurrentHostname(new URL(tab.url).hostname);
        }
      } catch (error) {
        console.error('加载悬浮徽章设置失败:', error);
      }
    };

    loadSettings();

    // 监听 storage 变化实时更新
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes['floating-badge-storage-key']) {
        const newData = changes['floating-badge-storage-key'].newValue;
        if (newData) {
          setEnabled(newData.enabled);
          setConfig(newData.config);
          setBlacklist(newData.blacklist || []);
          setWhitelist(newData.whitelist || []);
          setUseWhitelist(newData.useWhitelist || false);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const updateConfig = async (key: keyof FloatingBadgeConfig, value: any) => {
    try {
      const newConfig = { ...config, [key]: value };
      setConfig(newConfig);
      await floatingBadgeStorage.updateConfig({ [key]: value });

      setSaveFeedback('✅ 设置已保存');
      setTimeout(() => setSaveFeedback(''), 2000);
    } catch (error) {
      console.error('更新设置失败:', error);
      setSaveFeedback('❌ 保存失败');
      setTimeout(() => setSaveFeedback(''), 2000);
    }
  };

  const toggleEnabled = async () => {
    try {
      const newValue = !enabled;
      setEnabled(newValue);
      await floatingBadgeStorage.setEnabled(newValue);

      setSaveFeedback('✅ 设置已保存');
      setTimeout(() => setSaveFeedback(''), 2000);
    } catch (error) {
      console.error('切换启用状态失败:', error);
      setSaveFeedback('❌ 操作失败');
      setTimeout(() => setSaveFeedback(''), 2000);
    }
  };

  const toggleUseWhitelist = async () => {
    try {
      const newValue = !useWhitelist;
      setUseWhitelist(newValue);
      await floatingBadgeStorage.setUseWhitelist(newValue);

      setSaveFeedback('✅ 设置已保存');
      setTimeout(() => setSaveFeedback(''), 2000);
    } catch (error) {
      console.error('切换白名单模式失败:', error);
      setSaveFeedback('❌ 操作失败');
      setTimeout(() => setSaveFeedback(''), 2000);
    }
  };

  const addToBlacklist = async () => {
    if (!newDomain.trim()) return;

    try {
      await floatingBadgeStorage.addToBlacklist(newDomain.trim());
      setBlacklist([...blacklist, newDomain.trim()]);
      setNewDomain('');

      setSaveFeedback('✅ 已添加到黑名单');
      setTimeout(() => setSaveFeedback(''), 2000);
    } catch (error) {
      console.error('添加到黑名单失败:', error);
      setSaveFeedback('❌ 添加失败');
      setTimeout(() => setSaveFeedback(''), 2000);
    }
  };

  const removeFromBlacklist = async (domain: string) => {
    try {
      await floatingBadgeStorage.removeFromBlacklist(domain);
      setBlacklist(blacklist.filter(d => d !== domain));

      setSaveFeedback('✅ 已从黑名单移除');
      setTimeout(() => setSaveFeedback(''), 2000);
    } catch (error) {
      console.error('从黑名单移除失败:', error);
      setSaveFeedback('❌ 移除失败');
      setTimeout(() => setSaveFeedback(''), 2000);
    }
  };

  const addToWhitelist = async () => {
    if (!newDomain.trim()) return;

    try {
      await floatingBadgeStorage.addToWhitelist(newDomain.trim());
      setWhitelist([...whitelist, newDomain.trim()]);
      setNewDomain('');

      setSaveFeedback('✅ 已添加到白名单');
      setTimeout(() => setSaveFeedback(''), 2000);
    } catch (error) {
      console.error('添加到白名单失败:', error);
      setSaveFeedback('❌ 添加失败');
      setTimeout(() => setSaveFeedback(''), 2000);
    }
  };

  const removeFromWhitelist = async (domain: string) => {
    try {
      await floatingBadgeStorage.removeFromWhitelist(domain);
      setWhitelist(whitelist.filter(d => d !== domain));

      setSaveFeedback('✅ 已从白名单移除');
      setTimeout(() => setSaveFeedback(''), 2000);
    } catch (error) {
      console.error('从白名单移除失败:', error);
      setSaveFeedback('❌ 移除失败');
      setTimeout(() => setSaveFeedback(''), 2000);
    }
  };

  const getCurrentDomain = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.url) {
        const hostname = new URL(tab.url).hostname;
        setNewDomain(hostname);
      }
    } catch (error) {
      console.error('获取当前域名失败:', error);
    }
  };

  return (
    <div className="border-border-default bg-background-main mb-3 rounded border p-3 dark:border-gray-600 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">悬浮徽章设置</h4>
        <button
          onClick={onClose}
          className="bg-background-ivory-medium text-text-faded hover:bg-swatch-cloud-light rounded px-2 py-1 text-xs dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600">
          ✕
        </button>
      </div>

      {saveFeedback && (
        <div className="mb-2 rounded bg-green-100 p-2 text-xs text-green-800 dark:bg-green-900/20 dark:text-green-300">
          {saveFeedback}
        </div>
      )}

      <div className="space-y-3">
        {/* 启用悬浮徽章 */}
        <div className="flex items-center justify-between">
          <label className="text-text-main text-sm dark:text-gray-300">启用悬浮徽章</label>
          <input type="checkbox" checked={enabled} onChange={toggleEnabled} className="rounded" />
        </div>

        {/* 当前网站状态提示 */}
        {enabled && currentHostname && blacklist.includes(currentHostname) && (
          <div className="flex items-center justify-between rounded bg-amber-50 p-2 dark:bg-amber-900/20">
            <span className="text-xs text-amber-800 dark:text-amber-300">当前网站已隐藏</span>
            <button
              onClick={() => removeFromBlacklist(currentHostname)}
              className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700">
              恢复显示
            </button>
          </div>
        )}

        {/* 位置设置 */}
        <div>
          <label className="text-text-faded mb-1 block text-xs dark:text-gray-400">初始位置</label>
          <select
            value={config.position}
            onChange={e => updateConfig('position', e.target.value as any)}
            className="border-border-default dark:bg-background-dark w-full rounded border px-2 py-1 text-xs dark:border-gray-600">
            <option value="left">左侧</option>
            <option value="right">右侧</option>
            <option value="top">顶部</option>
            <option value="bottom">底部</option>
          </select>
        </div>

        {/* 尺寸设置 */}
        <div>
          <label className="text-text-faded mb-1 block text-xs dark:text-gray-400">徽章尺寸</label>
          <select
            value={config.size}
            onChange={e => updateConfig('size', e.target.value as any)}
            className="border-border-default dark:bg-background-dark w-full rounded border px-2 py-1 text-xs dark:border-gray-600">
            <option value="small">小</option>
            <option value="medium">中</option>
            <option value="large">大</option>
          </select>
        </div>

        {/* 主题设置 */}
        <div>
          <label className="text-text-faded mb-1 block text-xs dark:text-gray-400">主题</label>
          <select
            value={config.theme}
            onChange={e => updateConfig('theme', e.target.value as any)}
            className="border-border-default dark:bg-background-dark w-full rounded border px-2 py-1 text-xs dark:border-gray-600">
            <option value="auto">自动</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>

        {/* 显示工具提示 */}
        <div className="flex items-center justify-between">
          <label className="text-text-main text-sm dark:text-gray-300">显示工具提示</label>
          <input
            type="checkbox"
            checked={config.showTooltip}
            onChange={e => updateConfig('showTooltip', e.target.checked)}
            className="rounded"
          />
        </div>

        {/* 启用拖动 */}
        <div className="flex items-center justify-between">
          <label className="text-text-main text-sm dark:text-gray-300">启用拖动</label>
          <input
            type="checkbox"
            checked={config.enableDragging}
            onChange={e => updateConfig('enableDragging', e.target.checked)}
            className="rounded"
          />
        </div>

        {/* 仅垂直拖动 */}
        {config.enableDragging && (
          <div className="flex items-center justify-between">
            <label className="text-text-main text-sm dark:text-gray-300">仅垂直拖动</label>
            <input
              type="checkbox"
              checked={config.verticalDragOnly}
              onChange={e => updateConfig('verticalDragOnly', e.target.checked)}
              className="rounded"
            />
          </div>
        )}

        {/* 启用边缘吸附 */}
        <div className="flex items-center justify-between">
          <label className="text-text-main text-sm dark:text-gray-300">启用边缘吸附</label>
          <input
            type="checkbox"
            checked={config.enableSnapping}
            onChange={e => updateConfig('enableSnapping', e.target.checked)}
            className="rounded"
          />
        </div>

        {/* 自动隐藏 */}
        <div className="flex items-center justify-between">
          <label className="text-text-main text-sm dark:text-gray-300">自动隐藏</label>
          <input
            type="checkbox"
            checked={config.autoHide}
            onChange={e => updateConfig('autoHide', e.target.checked)}
            className="rounded"
          />
        </div>

        {/* 透明度 */}
        <div>
          <label className="text-text-faded mb-1 block text-xs dark:text-gray-400">
            透明度: {Math.round(config.opacity * 100)}%
          </label>
          <input
            type="range"
            min="30"
            max="100"
            value={config.opacity * 100}
            onChange={e => updateConfig('opacity', parseInt(e.target.value) / 100)}
            className="w-full"
          />
        </div>

        {/* 网站管理 */}
        <div className="border-t pt-3">
          <h5 className="mb-2 text-xs font-medium">网站管理</h5>

          {/* 白名单模式 */}
          <div className="mb-2 flex items-center justify-between">
            <label className="text-text-main text-sm dark:text-gray-300">使用白名单模式</label>
            <input type="checkbox" checked={useWhitelist} onChange={toggleUseWhitelist} className="rounded" />
          </div>

          {/* 域名输入 */}
          <div className="mb-2 flex space-x-1">
            <input
              type="text"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              placeholder="输入域名 (如: example.com)"
              className="border-border-default dark:bg-background-dark flex-1 rounded border px-2 py-1 text-xs dark:border-gray-600"
            />
            <button
              onClick={getCurrentDomain}
              className="bg-background-ivory-medium hover:bg-swatch-cloud-light rounded px-2 py-1 text-xs dark:bg-gray-700 dark:hover:bg-gray-600"
              title="使用当前网站">
              📍
            </button>
          </div>

          <div className="flex space-x-1">
            <button
              onClick={useWhitelist ? addToWhitelist : addToBlacklist}
              className="bg-primary hover:bg-background-clay flex-1 rounded px-2 py-1 text-xs text-white">
              添加到{useWhitelist ? '白' : '黑'}名单
            </button>
          </div>

          {/* 黑名单列表 */}
          {!useWhitelist && blacklist.length > 0 && (
            <div className="mt-2">
              <label className="text-text-faded mb-1 block text-xs dark:text-gray-400">黑名单</label>
              <div className="space-y-1">
                {blacklist.map(domain => (
                  <div
                    key={domain}
                    className="flex items-center justify-between rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">
                    <span className="text-xs">{domain}</span>
                    <button
                      onClick={() => removeFromBlacklist(domain)}
                      className="text-xs text-red-500 hover:text-red-700">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 白名单列表 */}
          {useWhitelist && whitelist.length > 0 && (
            <div className="mt-2">
              <label className="text-text-faded mb-1 block text-xs dark:text-gray-400">白名单</label>
              <div className="space-y-1">
                {whitelist.map(domain => (
                  <div
                    key={domain}
                    className="flex items-center justify-between rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">
                    <span className="text-xs">{domain}</span>
                    <button
                      onClick={() => removeFromWhitelist(domain)}
                      className="text-xs text-red-500 hover:text-red-700">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 说明 */}
        <div className="bg-background-oat rounded p-2 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <div className="mb-1 font-medium">💡 使用说明</div>
          <div>
            • 悬浮徽章会显示在每个网页上
            <br />
            • 点击徽章可快速打开侧边栏
            <br />
            • 可以垂直拖动徽章调整位置
            <br />
            • 黑名单模式：在所有网站显示，除了黑名单中的网站
            <br />• 白名单模式：仅在白名单中的网站显示
          </div>
        </div>
      </div>
    </div>
  );
};
