import React, { useState } from 'react';
import { X, Shuffle, Plus, Trash2, Loader2, Sparkles, Filter } from 'lucide-react';
import { AggregateGroup, Subscription, RenameRule, ProxyType } from '../../core/types/index.js';

interface AggregateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<AggregateGroup> & { name: string }) => Promise<void>;
  initialData?: AggregateGroup | null;
  subscriptions: Subscription[];
  enableTcpPing?: boolean;
}

const PROTOCOLS: { label: string; value: ProxyType }[] = [
  { label: 'VLESS', value: 'vless' },
  { label: 'VMess', value: 'vmess' },
  { label: 'Trojan', value: 'trojan' },
  { label: 'Hysteria2', value: 'hysteria2' },
  { label: 'Shadowsocks', value: 'ss' },
];

export const AggregateModal: React.FC<AggregateModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  subscriptions,
  enableTcpPing = true,
}) => {
  const [name, setName] = useState('');
  const [selectedSubIds, setSelectedSubIds] = useState<string[]>([]);
  const [selectedProtocols, setSelectedProtocols] = useState<ProxyType[]>([]);
  const [filterKeywordsText, setFilterKeywordsText] = useState('');
  const [excludeKeywordsText, setExcludeKeywordsText] = useState('官网, 重置, 到期, 剩余');
  const [renameRules, setRenameRules] = useState<RenameRule[]>([]);
  const [deduplicate, setDeduplicate] = useState(true);
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);
  const [maxPing, setMaxPing] = useState<string>('');
  const [targetFormat, setTargetFormat] = useState<AggregateGroup['targetFormat']>('clash');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sync state whenever modal is opened or initialData changes
  React.useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || '');
      setSelectedSubIds(initialData?.subscriptionIds || []);
      setSelectedProtocols(initialData?.protocols || []);
      setFilterKeywordsText((initialData?.filterKeywords || []).join(', '));
      setExcludeKeywordsText((initialData?.excludeKeywords || ['官网', '重置', '到期', '剩余']).join(', '));
      setRenameRules(initialData?.renameRules || []);
      setDeduplicate(initialData?.deduplicate ?? true);
      setFilterOnlineOnly(initialData?.filterOnlineOnly ?? false);
      setMaxPing(initialData?.maxPing ? String(initialData.maxPing) : '');
      setTargetFormat(initialData?.targetFormat || 'clash');
      setError('');
      setLoading(false);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleToggleSub = (subId: string) => {
    if (selectedSubIds.includes(subId)) {
      setSelectedSubIds(selectedSubIds.filter((id) => id !== subId));
    } else {
      setSelectedSubIds([...selectedSubIds, subId]);
    }
  };

  const handleToggleProtocol = (proto: ProxyType) => {
    if (selectedProtocols.includes(proto)) {
      setSelectedProtocols(selectedProtocols.filter((p) => p !== proto));
    } else {
      setSelectedProtocols([...selectedProtocols, proto]);
    }
  };

  const handleAddRenameRule = () => {
    setRenameRules([...renameRules, { pattern: '', replace: '' }]);
  };

  const handleUpdateRenameRule = (index: number, key: 'pattern' | 'replace', val: string) => {
    const next = [...renameRules];
    next[index][key] = val;
    setRenameRules(next);
  };

  const handleRemoveRenameRule = (index: number) => {
    setRenameRules(renameRules.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('聚合名称不能为空');
      return;
    }
    setError('');
    setLoading(true);

    const filterKeywords = filterKeywordsText.split(',').map((s) => s.trim()).filter(Boolean);
    const excludeKeywords = excludeKeywordsText.split(',').map((s) => s.trim()).filter(Boolean);

    try {
      await onSubmit({
        name: name.trim(),
        subscriptionIds: selectedSubIds,
        protocols: selectedProtocols,
        filterKeywords,
        excludeKeywords,
        renameRules: renameRules.filter((r) => r.pattern.trim().length > 0),
        deduplicate,
        filterOnlineOnly,
        maxPing: maxPing ? Number(maxPing) : undefined,
        targetFormat,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Shuffle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              {initialData ? '编辑聚合订阅' : '创建新聚合订阅'}
            </h3>
            <p className="text-xs text-slate-400">组合多个机场订阅源，配置智能过滤、去重与标准化命名规则</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Base Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                聚合名称 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="例如: 🚀 全球高速节点聚合"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">默认输出格式</label>
              <select
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value as any)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 text-sm text-slate-100 outline-none"
              >
                <option value="clash">Clash / Mihomo (YAML)</option>
                <option value="singbox">Sing-box (JSON)</option>
                <option value="surge">Surge (CONF)</option>
                <option value="loon">Loon (CONF)</option>
                <option value="base64">V2Ray / Base64</option>
              </select>
            </div>
          </div>

          {/* Subscriptions Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-300">
                关联订阅源 <span className="text-slate-500">(不勾选则默认包含所有有效订阅)</span>
              </label>
              {subscriptions.some((s) => s.status === 'disabled') && (
                <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  已禁用的订阅源已被自动排除或禁用选择
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              {subscriptions.length === 0 ? (
                <span className="text-xs text-slate-600 italic">暂无可用订阅源</span>
              ) : (
                subscriptions.map((sub) => {
                  const isDisabled = sub.status === 'disabled';
                  const isSelected = selectedSubIds.includes(sub.id);
                  return (
                    <button
                      type="button"
                      key={sub.id}
                      disabled={isDisabled}
                      onClick={() => !isDisabled && handleToggleSub(sub.id)}
                      title={isDisabled ? '该订阅源已处于禁用状态，无法关联' : undefined}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border flex items-center gap-1.5 ${
                        isDisabled
                          ? 'bg-slate-900/40 text-slate-600 border-slate-800/50 cursor-not-allowed opacity-60 line-through'
                          : isSelected
                          ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>{sub.name}</span>
                      <span className="text-[10px] opacity-75">
                        {isDisabled ? '(已禁用)' : `(${sub.nodeCount} 节点)`}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Protocol Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              协议筛选 <span className="text-slate-500">(不选则默认全部协议)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PROTOCOLS.map((proto) => {
                const isSelected = selectedProtocols.includes(proto.value);
                return (
                  <button
                    type="button"
                    key={proto.value}
                    onClick={() => handleToggleProtocol(proto.value)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition border ${
                      isSelected
                        ? 'bg-sky-600/30 text-sky-300 border-sky-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {proto.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Keywords filter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                包含关键词 (逗号分隔)
              </label>
              <input
                type="text"
                placeholder="例如: 香港, 日本, 0.5x"
                value={filterKeywordsText}
                onChange={(e) => setFilterKeywordsText(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 text-xs text-slate-100 placeholder:text-slate-600 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                排除关键词 (逗号分隔)
              </label>
              <input
                type="text"
                placeholder="例如: 官网, 重置, 到期, 流量"
                value={excludeKeywordsText}
                onChange={(e) => setExcludeKeywordsText(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 text-xs text-slate-100 placeholder:text-slate-600 outline-none"
              />
            </div>
          </div>

          {/* Quality & Deduplicate Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deduplicate}
                onChange={(e) => setDeduplicate(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
              />
              <span className="text-xs text-slate-300 font-medium">智能去重 (IP+端口)</span>
            </label>

            {enableTcpPing ? (
              <>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filterOnlineOnly}
                    onChange={(e) => setFilterOnlineOnly(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300 font-medium">仅保留在线节点</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">最大延迟:</span>
                  <input
                    type="number"
                    placeholder="不限"
                    value={maxPing}
                    onChange={(e) => setMaxPing(e.target.value)}
                    className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 outline-none"
                  />
                  <span className="text-xs text-slate-500">ms</span>
                </div>
              </>
            ) : (
              <div className="md:col-span-2 flex items-center text-xs text-slate-500 italic">
                * 边缘模式下推荐选用客户端「自动选择」策略组进行实时测速
              </div>
            )}
          </div>

          {/* Renaming rules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                正则重命名规则
              </label>
              <button
                type="button"
                onClick={handleAddRenameRule}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                添加规则
              </button>
            </div>

            <div className="space-y-2">
              {renameRules.length === 0 ? (
                <div className="text-center py-2 text-xs text-slate-600 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                  暂无重命名规则（原名输出）
                </div>
              ) : (
                renameRules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="匹配正则 (如: \[.*\]|机场前缀)"
                      value={rule.pattern}
                      onChange={(e) => handleUpdateRenameRule(idx, 'pattern', e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-indigo-500 text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono"
                    />
                    <span className="text-slate-600 text-xs">➔</span>
                    <input
                      type="text"
                      placeholder="替换为 (可留空剔除)"
                      value={rule.replace}
                      onChange={(e) => handleUpdateRenameRule(idx, 'replace', e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-indigo-500 text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRenameRule(idx)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
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
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {initialData ? '保存修改' : '创建聚合'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
