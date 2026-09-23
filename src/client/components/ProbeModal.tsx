import React, { useState, useEffect } from 'react';
import {
  X,
  Radio,
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  Activity,
  Terminal,
  Server,
  Loader2,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { getAgentConfig, rotateAgentSecret, AgentProbeConfig } from '../api/index.js';
import { formatDate } from '../lib/utils.js';

interface ProbeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSecretChanged?: () => void;
}

export const ProbeModal: React.FC<ProbeModalProps> = ({ isOpen, onClose, onSecretChanged }) => {
  const [config, setConfig] = useState<AgentProbeConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAgentConfig();
      setConfig(data);
    } catch (err: any) {
      setError(err.message || '获取探针配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      setCopiedField(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRotate = async () => {
    if (!confirm('重置探针密钥后，旧密钥运行中的所有探针将立即失效，确定继续吗？')) return;
    setRotating(true);
    try {
      const res = await rotateAgentSecret();
      if (config) {
        setConfig({ ...config, secret: res.secret });
      }
      if (onSecretChanged) onSecretChanged();
    } catch (err: any) {
      setError(err.message || '重置密钥失败');
    } finally {
      setRotating(false);
    }
  };

  const origin = window.location.origin;
  const secret = config?.secret || '********************************';

  const nodeCommand = `curl -fsSL ${origin}/probe.js -o probe.js && SUBHUB_URL="${origin}" AGENT_SECRET="${secret}" node probe.js`;
  const dockerCommand = `docker run -d --name subhub-probe --restart unless-stopped -e SUBHUB_URL="${origin}" -e AGENT_SECRET="${secret}" -e INTERVAL_MINUTES=15 node:20-alpine sh -c "wget -qO probe.js ${origin}/probe.js && node probe.js"`;

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
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
              <span>边缘探针服务配置 (Edge Probe Agent)</span>
              {config && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                    config.isOnline
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${config.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {config.isOnline ? '探针在线' : '等待探针连接'}
                </span>
              )}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              在本地软路由、NAS 或个人电脑上运行探针，获得真实本地宽带环境下的精准测速与连通性
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs shrink-0 break-all">
            {error}
          </div>
        )}

        <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
          {/* Heartbeat Status Panel */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 font-mono text-[11px]">
            <div className="space-y-0.5">
              <span className="text-slate-500 text-[10px]">运行状态</span>
              <div className="font-semibold text-slate-200">
                {config?.isOnline ? '🟢 正常活跃' : '⚪ 暂无心跳'}
              </div>
            </div>
            <div className="space-y-0.5 truncate">
              <span className="text-slate-500 text-[10px]">最近上报来源</span>
              <div className="text-slate-300 truncate" title={config?.lastHeartbeatIp}>
                {config?.lastHeartbeatIp || '未检测到'}
              </div>
            </div>
            <div className="space-y-0.5 col-span-2 sm:col-span-1">
              <span className="text-slate-500 text-[10px]">最近测速节点数</span>
              <div className="text-emerald-400 font-semibold">
                {config?.lastReportNodeCount !== undefined ? `${config.lastReportNodeCount} 个` : '-'}
              </div>
            </div>
            {config?.lastHeartbeatAt && (
              <div className="col-span-2 sm:col-span-3 pt-1 border-t border-slate-800/60 text-[10px] text-slate-400">
                最后心跳时间: {formatDate(config.lastHeartbeatAt)}
              </div>
            )}
          </div>

          {/* Secret Management Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-sky-400" />
                <span>探针访问密钥 (Agent Secret)</span>
              </label>
              <button
                type="button"
                onClick={handleRotate}
                disabled={rotating || loading}
                className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${rotating ? 'animate-spin' : ''}`} />
                <span>重置密钥</span>
              </button>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 focus-within:border-sky-500 transition">
              <div className="flex-1 font-mono text-xs text-slate-200 px-2 truncate select-all">
                {showSecret ? secret : '••••••••••••••••••••••••••••••••'}
              </div>
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-900 transition active:scale-95"
                title={showSecret ? '隐藏密钥' : '显示密钥'}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => handleCopy(secret, 'secret')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition shrink-0 active:scale-95"
              >
                {copiedField === 'secret' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Run Instructions */}
          <div className="space-y-3 pt-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>快速部署与运行探针</span>
            </h4>

            {/* Option 1: Node.js */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span>方式一：Node.js 本地单文件运行（全自动装载 Mihomo 内核，开箱即用）</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(nodeCommand, 'node')}
                  className="text-xs text-sky-400 hover:text-sky-300 transition flex items-center gap-1 active:scale-95"
                >
                  {copiedField === 'node' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'node' ? '已复制' : '复制命令'}</span>
                </button>
              </div>
              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] sm:text-[11px] font-mono text-slate-300 overflow-x-auto select-all">
                {nodeCommand}
              </pre>
            </div>

            {/* Option 2: Docker */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-sky-400" />
                  <span>方式二：Docker 一键全自动常驻（自动装载 Mihomo 内核，适合 NAS / 软路由）</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(dockerCommand, 'docker')}
                  className="text-xs text-sky-400 hover:text-sky-300 transition flex items-center gap-1 active:scale-95"
                >
                  {copiedField === 'docker' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'docker' ? '已复制' : '复制命令'}</span>
                </button>
              </div>
              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] sm:text-[11px] font-mono text-slate-300 overflow-x-auto select-all whitespace-pre-wrap">
                {dockerCommand}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800 text-xs text-slate-400 shrink-0">
          <span>💡 探针测速数据上报后，聚合订阅将自动按本地真实网络质量分发节点。</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition active:scale-95"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
