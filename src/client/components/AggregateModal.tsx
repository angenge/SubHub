import React, { useState } from 'react';
import { X, Shuffle, Plus, Trash2, Loader2, Sparkles, Filter, ShieldCheck, Zap } from 'lucide-react';
import { AggregateGroup, Subscription, RenameRule, ProxyType } from '../../core/types/index.js';

interface AggregateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<AggregateGroup> & { name: string }) => Promise<void>;
  initialData?: AggregateGroup | null;
  subscriptions: Subscription[];
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

  // Filter out disabled subscriptions from selectable options
  const activeSubscriptions = subscriptions.filter((s) => s.status !== 'disabled');

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

  const handleUpdateRenameRule = (index: number, field: keyof RenameRule, value: string) => {
    const updated = [...renameRules];
    updated[index] = { ...updated[index], [field]: value };
    setRenameRules(updated);
  };

  const handleDeleteRenameRule = (index: number) => {
    setRenameRules(renameRules.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入聚合名称');
      return;
    }

    const filterKeywords = filterKeywordsText
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const excludeKeywords = excludeKeywordsText
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const validRenameRules = renameRules.filter((r) => r.pattern.trim().length > 0);

    setError('');
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        subscriptionIds: selectedSubIds,
        protocols: selectedProtocols,
        filterKeywords,
        excludeKeywords,
        renameRules: validRenameRules,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-4 sm:p-6 text-slate-100 my-auto max-h-[92vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4 pr-8 shrink-0">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
            <Shuffle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-white">
              {initialData ? '编辑聚合分发规则' : '新建聚合分发规则'}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              定制多机场节点的筛选、去重与正则改名流水线
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs shrink-0 break-all">
            {error}
          </div>
        )}

        {/* Form Container with vertical scroll */}
        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Name & Target Format */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                聚合名称 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="例如: 🚀 全网极速精选聚合"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">默认导出格式</label>
              <select
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 text-xs sm:text-sm text-slate-100 outline-none"
              >
                <option value="clash">Clash / Mihomo</option>
                <option value="singbox">Sing-box</option>
                <option value="surge">Surge</option>
                <option value="loon">Loon</option>
                <option value="base64">V2Ray / Base64</option>
              </select>
            </div>
          </div>

          {/* Subscriptions multi-select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">选择包含的订阅源</label>
              <span className="text-[10px] sm:text-xs text-slate-500">（默认不勾选代表聚合全部可用订阅）</span>
            </div>
            {activeSubscriptions.length === 0 ? (
              <div className="p-3 text-center rounded-xl bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-500">
                暂无可用的启用状态订阅源
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 rounded-xl bg-slate-950 border border-slate-800/80">
                {activeSubscriptions.map((sub) => {
                  const isSelected = selectedSubIds.includes(sub.id);
                  return (
                    <div
                      key={sub.id}
                      onClick={() => handleToggleSub(sub.id)}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs cursor-pointer border transition active:scale-[0.98] ${
                        isSelected
                          ? 'bg-indigo-950/60 text-indigo-200 border-indigo-500/40 shadow-sm'
                          : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="truncate mr-2 font-medium">{sub.name}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">({sub.nodeCount} 节点)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Protocols multi-select */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">协议白名单</label>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {PROTOCOLS.map((proto) => {
                const isSelected = selectedProtocols.includes(proto.value);
                return (
                  <button
                    key={proto.value}
                    type="button"
                    onClick={() => handleToggleProtocol(proto.value)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition border active:scale-95 ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-semibold border-indigo-500 shadow-md shadow-indigo-600/20'
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                包含关键词 (逗号分隔)
              </label>
              <input
                type="text"
                placeholder="例如: 香港, 日本, 0.5x"
                value={filterKeywordsText}
                onChange={(e) => setFilterKeywordsText(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 outline-none"
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
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 outline-none"
              />
            </div>
          </div>

          {/* Quality & Deduplicate Options */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>质量、去重与延迟筛选 (基于探针测速结果)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deduplicate}
                  onChange={(e) => setDeduplicate(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                />
                <span className="text-xs text-slate-300 font-medium">智能去重 (IP+端口)</span>
              </label>

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
            </div>
          </div>

          {/* Renaming rules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>节点正则重命名规则</span>
              </label>
              <button
                type="button"
                onClick={handleAddRenameRule}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加规则</span>
              </button>
            </div>

            {renameRules.length === 0 ? (
              <div className="p-3 text-center rounded-xl bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-500">
                暂未添加重命名规则（支持正则表达式，按序执行替换）
              </div>
            ) : (
              <div className="space-y-2 max-h-36 overflow-y-auto p-1">
                {renameRules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="匹配正则 (如: 香港0(\d+))"
                      value={rule.pattern}
                      onChange={(e) => handleUpdateRenameRule(idx, 'pattern', e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="替换为 (如: HK VIP $1)"
                      value={rule.replace}
                      onChange={(e) => handleUpdateRenameRule(idx, 'replace', e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteRenameRule(idx)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition active:scale-95"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{initialData ? '保存修改' : '创建聚合'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
