import { floatingBadgeStorage } from '@extension/storage';
import { cn } from '@extension/ui';
import {
  CheckCircledIcon,
  CrossCircledIcon,
  DrawingPinFilledIcon,
  Cross2Icon,
  LightningBoltIcon,
} from '@radix-ui/react-icons';
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
  const [saveFeedback, setSaveFeedback] = useState<{ success: boolean; message: string } | null>(null);
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

      setSaveFeedback({ success: true, message: '设置已保存' });
      setTimeout(() => setSaveFeedback(null), 2000);
    } catch (error) {
      console.error('更新设置失败:', error);
      setSaveFeedback({ success: false, message: '保存失败' });
      setTimeout(() => setSaveFeedback(null), 2000);
    }
  };

  const toggleEnabled = async () => {
    try {
      const newValue = !enabled;
      setEnabled(newValue);
      await floatingBadgeStorage.setEnabled(newValue);

      setSaveFeedback({ success: true, message: '设置已保存' });
      setTimeout(() => setSaveFeedback(null), 2000);
    } catch (error) {
      console.error('切换启用状态失败:', error);
      setSaveFeedback({ success: false, message: '操作失败' });
      setTimeout(() => setSaveFeedback(null), 2000);
    }
  };

  const toggleUseWhitelist = async () => {
    try {
      const newValue = !useWhitelist;
      setUseWhitelist(newValue);
      await floatingBadgeStorage.setUseWhitelist(newValue);

      setSaveFeedback({ success: true, message: '设置已保存' });
      setTimeout(() => setSaveFeedback(null), 2000);
    } catch (error) {
      console.error('切换白名单模式失败:', error);
      setSaveFeedback({ success: false, message: '操作失败' });
      setTimeout(() => setSaveFeedback(null), 2000);
    }
  };

  const addToBlacklist = async () => {
    if (!newDomain.trim()) return;

    try {
      await floatingBadgeStorage.addToBlacklist(newDomain.trim());
      setBlacklist([...blacklist, newDomain.trim()]);
      setNewDomain('');

      setSaveFeedback({ success: true, message: '已添加到黑名单' });
      setTimeout(() => setSaveFeedback(null), 2000);
    } catch (error) {
      console.error('添加到黑名单失败:', error);
      setSaveFeedback({ success: false, message: '添加失败' });
      setTimeout(() => setSaveFeedback(null), 2000);
    }
  };

  const removeFromBlacklist = async (domain: string) => {
    try {
      await floatingBadgeStorage.removeFromBlacklist(domain);
      setBlacklist(blacklist.filter(d => d !== domain));

      setSaveFeedback({ success: true, message: '已从黑名单移除' });
      setTimeout(() => setSaveFeedback(null), 2000);
    } catch (error) {
      console.error('从黑名单移除失败:', error);
      setSaveFeedback({ success: false, message: '移除失败' });
      setTimeout(() => setSaveFeedback(null), 2000);
    }
  };

  const addToWhitelist = async () => {
    if (!newDomain.trim()) return;

    try {
      await floatingBadgeStorage.addToWhitelist(newDomain.trim());
      setWhitelist([...whitelist, newDomain.trim()]);
      setNewDomain('');

      setSaveFeedback({ success: true, message: '已添加到白名单' });
      setTimeout(() => setSaveFeedback(null), 2000);
    } catch (error) {
      console.error('添加到白名单失败:', error);
      setSaveFeedback({ success: false, message: '添加失败' });
      setTimeout(() => setSaveFeedback(null), 2000);
    }
  };

  const removeFromWhitelist = async (domain: string) => {
    try {
      await floatingBadgeStorage.removeFromWhitelist(domain);
      setWhitelist(whitelist.filter(d => d !== domain));

      setSaveFeedback({ success: true, message: '已从白名单移除' });
      setTimeout(() => setSaveFeedback(null), 2000);
    } catch (error) {
      console.error('从白名单移除失败:', error);
      setSaveFeedback({ success: false, message: '移除失败' });
      setTimeout(() => setSaveFeedback(null), 2000);
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

  // 开关组件
  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-foreground text-sm">{label}</span>
      <button
        onClick={onChange}
        className={cn('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-input')}>
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );

  // 选择器组件
  const SelectField = ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
  }) => (
    <div className="py-2">
      <label className="text-muted-foreground mb-1.5 block text-sm">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border-input bg-background text-foreground focus:border-primary focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1">
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 保存反馈 */}
      {saveFeedback && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
            saveFeedback.success ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive',
          )}>
          {saveFeedback.success ? <CheckCircledIcon className="h-4 w-4" /> : <CrossCircledIcon className="h-4 w-4" />}
          <span>{saveFeedback.message}</span>
        </div>
      )}

      {/* 主开关 */}
      <Toggle checked={enabled} onChange={toggleEnabled} label="启用悬浮徽章" />

      {/* 当前网站状态提示 */}
      {enabled && currentHostname && blacklist.includes(currentHostname) && (
        <div className="bg-destructive/10 flex items-center justify-between rounded-lg p-3">
          <span className="text-destructive text-sm">当前网站已隐藏</span>
          <button
            onClick={() => removeFromBlacklist(currentHostname)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-3 py-1 text-xs">
            恢复显示
          </button>
        </div>
      )}

      {/* 基础设置 */}
      <div className="space-y-1">
        <SelectField
          label="初始位置"
          value={config.position}
          options={[
            { value: 'left', label: '左侧' },
            { value: 'right', label: '右侧' },
            { value: 'top', label: '顶部' },
            { value: 'bottom', label: '底部' },
          ]}
          onChange={v => updateConfig('position', v as any)}
        />

        <SelectField
          label="徽章尺寸"
          value={config.size}
          options={[
            { value: 'small', label: '小' },
            { value: 'medium', label: '中' },
            { value: 'large', label: '大' },
          ]}
          onChange={v => updateConfig('size', v as any)}
        />

        <SelectField
          label="主题"
          value={config.theme}
          options={[
            { value: 'auto', label: '自动' },
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
          ]}
          onChange={v => updateConfig('theme', v as any)}
        />
      </div>

      {/* 行为设置 */}
      <div className="border-border border-t pt-2">
        <Toggle
          checked={config.showTooltip}
          onChange={() => updateConfig('showTooltip', !config.showTooltip)}
          label="显示工具提示"
        />
        <Toggle
          checked={config.enableDragging}
          onChange={() => updateConfig('enableDragging', !config.enableDragging)}
          label="启用拖动"
        />
        {config.enableDragging && (
          <Toggle
            checked={config.verticalDragOnly}
            onChange={() => updateConfig('verticalDragOnly', !config.verticalDragOnly)}
            label="仅垂直拖动"
          />
        )}
        <Toggle
          checked={config.enableSnapping}
          onChange={() => updateConfig('enableSnapping', !config.enableSnapping)}
          label="启用边缘吸附"
        />
        <Toggle
          checked={config.autoHide}
          onChange={() => updateConfig('autoHide', !config.autoHide)}
          label="自动隐藏"
        />
      </div>

      {/* 透明度滑块 */}
      <div className="py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-muted-foreground text-sm">透明度</span>
          <span className="text-foreground text-sm">{Math.round(config.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="30"
          max="100"
          value={config.opacity * 100}
          onChange={e => updateConfig('opacity', parseInt(e.target.value) / 100)}
          className="bg-input accent-primary h-2 w-full cursor-pointer appearance-none rounded-lg"
        />
      </div>

      {/* 网站管理 */}
      <div className="border-border border-t pt-4">
        <h4 className="text-foreground mb-3 font-medium">网站管理</h4>

        <Toggle checked={useWhitelist} onChange={toggleUseWhitelist} label="使用白名单模式" />

        {/* 域名输入 */}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            placeholder="输入域名 (如: example.com)"
            className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-ring flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
          />
          <button
            onClick={getCurrentDomain}
            className="bg-secondary hover:bg-secondary/80 rounded-lg px-3 py-2 text-sm"
            title="使用当前网站">
            <DrawingPinFilledIcon className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={useWhitelist ? addToWhitelist : addToBlacklist}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 w-full rounded-lg py-2 text-sm">
          添加到{useWhitelist ? '白' : '黑'}名单
        </button>

        {/* 黑名单列表 */}
        {!useWhitelist && blacklist.length > 0 && (
          <div className="mt-3">
            <label className="text-muted-foreground mb-1.5 block text-sm">黑名单</label>
            <div className="space-y-1">
              {blacklist.map(domain => (
                <div key={domain} className="bg-secondary flex items-center justify-between rounded-lg px-3 py-2">
                  <span className="text-foreground text-sm">{domain}</span>
                  <button
                    onClick={() => removeFromBlacklist(domain)}
                    className="text-destructive hover:text-destructive/80 text-sm">
                    <Cross2Icon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 白名单列表 */}
        {useWhitelist && whitelist.length > 0 && (
          <div className="mt-3">
            <label className="text-muted-foreground mb-1.5 block text-sm">白名单</label>
            <div className="space-y-1">
              {whitelist.map(domain => (
                <div key={domain} className="bg-secondary flex items-center justify-between rounded-lg px-3 py-2">
                  <span className="text-foreground text-sm">{domain}</span>
                  <button
                    onClick={() => removeFromWhitelist(domain)}
                    className="text-destructive hover:text-destructive/80 text-sm">
                    <Cross2Icon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div className="bg-muted rounded-xl p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <LightningBoltIcon className="h-4 w-4 text-amber-500" />
          <span className="text-foreground text-sm font-medium">使用说明</span>
        </div>
        <ul className="text-muted-foreground space-y-1 text-xs">
          <li>• 悬浮徽章会显示在每个网页上</li>
          <li>• 点击徽章可快速打开侧边栏</li>
          <li>• 可以垂直拖动徽章调整位置</li>
          <li>• 黑名单模式：除黑名单外所有网站显示</li>
          <li>• 白名单模式：仅白名单中的网站显示</li>
        </ul>
      </div>
    </div>
  );
};
