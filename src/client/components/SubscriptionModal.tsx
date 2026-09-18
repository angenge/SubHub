import React, { useState } from 'react';
import { X, Globe, Radio, Shield, Loader2 } from 'lucide-react';
import { Subscription } from '../../core/types/index.js';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    url: string;
    customUserAgent?: string;
    autoUpdate: boolean;
    updateInterval: number;
    status?: 'active' | 'error' | 'disabled';
  }) => Promise<void>;
  initialData?: Subscription | null;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [customUserAgent, setCustomUserAgent] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [updateInterval, setUpdateInterval] = useState(360);
  const [status, setStatus] = useState<'active' | 'error' | 'disabled'>('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sync state whenever modal is opened or initialData changes
  React.useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || '');
      setUrl(initialData?.url || '');
      setCustomUserAgent(initialData?.customUserAgent || '');
      setAutoUpdate(initialData?.autoUpdate ?? true);
      setUpdateInterval(initialData?.updateInterval || 360);
      setStatus(initialData?.status || 'active');
      setError('');
      setLoading(false);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError('订阅名称与订阅链接不能为空');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        url: url.trim(),
        customUserAgent: customUserAgent.trim() || undefined,
        autoUpdate,
        updateInterval: Number(updateInterval),
        status,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              {initialData ? '编辑订阅源' : '添加订阅源'}
            </h3>
            <p className="text-xs text-slate-400">支持 Clash YAML、V2Ray Base64、Sing-box JSON 链接</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              订阅名称 <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例如: 某某机场-VIP"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              订阅 URL 地址 <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="https://airport.com/api/v1/client/subscribe?token=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              自定义 User-Agent <span className="text-slate-500">(选填，默认 ClashMeta)</span>
            </label>
            <input
              type="text"
              placeholder="ClashMeta/v1.18.0"
              value={customUserAgent}
              onChange={(e) => setCustomUserAgent(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">自动更新周期</label>
              <select
                value={updateInterval}
                onChange={(e) => setUpdateInterval(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-500 text-sm text-slate-100 outline-none"
              >
                <option value={60}>每 1 小时</option>
                <option value={180}>每 3 小时</option>
                <option value={360}>每 6 小时 (推荐)</option>
                <option value={720}>每 12 小时</option>
                <option value={1440}>每 24 小时</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">启用状态</label>
              <select
                value={status === 'disabled' ? 'disabled' : 'active'}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-500 text-sm text-slate-100 outline-none"
              >
                <option value="active">正常启用</option>
                <option value="disabled">暂时禁用 (不参与聚合)</option>
              </select>
            </div>
          </div>

          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoUpdate}
                onChange={(e) => setAutoUpdate(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-sky-500 focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-xs font-medium text-slate-300">启用定时后台自动拉取</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/30 transition disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {initialData ? '保存修改' : '拉取并添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
