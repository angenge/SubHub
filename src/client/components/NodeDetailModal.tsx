import React, { useState } from 'react';
import { X, Copy, Check, Terminal, FileCode, Layers, ShieldCheck, Info } from 'lucide-react';
import { ProxyNode } from '../../core/types/index.js';
import { convertNodeToUri, convertToClashProxyObject, convertToSingboxOutbound } from '../../core/converters/index.js';
import YAML from 'yaml';
import { CountryBadge } from './CountryBadge.js';
import { LatencyBadge } from './LatencyBadge.js';
import { copyToClipboard } from '../lib/utils.js';

interface NodeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: ProxyNode | null;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ isOpen, onClose, node }) => {
  const [activeTab, setActiveTab] = useState<'uri' | 'clash' | 'singbox' | 'json' | 'params'>('uri');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !node) return null;

  const rawUri = node.rawUri || convertNodeToUri(node);
  const clashYaml = YAML.stringify(convertToClashProxyObject(node));
  const singboxJson = JSON.stringify(convertToSingboxOutbound(node), null, 2);
  const fullJson = JSON.stringify(node, null, 2);

  const handleCopy = async (text: string, key: string) => {
    await copyToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getActiveContent = () => {
    switch (activeTab) {
      case 'uri':
        return { text: rawUri, label: '原生协议链接 (URI)' };
      case 'clash':
        return { text: clashYaml, label: 'Clash Proxy (YAML)' };
      case 'singbox':
        return { text: singboxJson, label: 'Sing-box Outbound (JSON)' };
      case 'json':
        return { text: fullJson, label: 'SubHub 完整节点数据 (JSON)' };
      default:
        return { text: rawUri, label: '' };
    }
  };

  const current = getActiveContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-4 sm:p-6 text-slate-100 my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 mb-5 pr-8">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0 mt-0.5">
            <Terminal className="w-5 h-5" />
          </div>
          <div className="space-y-1 truncate">
            <div className="flex items-center gap-2 flex-wrap">
              <CountryBadge country={node.country} code={node.countryCode} />
              <h3 className="text-base font-bold text-white tracking-tight truncate max-w-md">
                {node.name}
              </h3>
              <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-slate-800 text-sky-400 border border-slate-700 font-semibold uppercase">
                {node.type}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 truncate">
              {node.server}:{node.port} · {node.network || 'tcp'} {node.tls ? '+ TLS' : ''}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-4 overflow-x-auto text-xs">
          {[
            { id: 'uri', label: '🔗 原生链接 (URI)' },
            { id: 'clash', label: '🐱 Clash YAML' },
            { id: 'singbox', label: '📦 Sing-box JSON' },
            { id: 'params', label: '📊 参数结构表' },
            { id: 'json', label: '{ } 原始对象' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        {activeTab === 'params' ? (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 max-h-80 overflow-y-auto space-y-2 text-xs">
            <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-500">节点名称:</span>
              <span className="col-span-2 text-slate-200 select-all font-sans">{node.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-500">协议类型:</span>
              <span className="col-span-2 text-sky-400 uppercase font-semibold">{node.type}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-500">服务器地址:</span>
              <span className="col-span-2 text-slate-200 select-all">{node.server}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-500">端口 (Port):</span>
              <span className="col-span-2 text-slate-200 select-all">{node.port}</span>
            </div>
            {node.uuid && (
              <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
                <span className="text-slate-500">UUID / 用户ID:</span>
                <span className="col-span-2 text-slate-200 select-all">{node.uuid}</span>
              </div>
            )}
            {node.password && (
              <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
                <span className="text-slate-500">密码 (Password):</span>
                <span className="col-span-2 text-slate-200 select-all">{node.password}</span>
              </div>
            )}
            {node.cipher && (
              <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
                <span className="text-slate-500">加密算法:</span>
                <span className="col-span-2 text-slate-200">{node.cipher}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-500">传输层网络:</span>
              <span className="col-span-2 text-slate-200">{node.network || 'tcp'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
              <span className="text-slate-500">TLS 安全传输:</span>
              <span className="col-span-2 text-slate-200">{node.tls ? '开启 (TLS)' : '关闭 (None)'}</span>
            </div>
            {node.sni && (
              <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
                <span className="text-slate-500">SNI / 域名:</span>
                <span className="col-span-2 text-slate-200 select-all">{node.sni}</span>
              </div>
            )}
            {node.reality && (
              <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
                <span className="text-slate-500">Reality 公钥:</span>
                <span className="col-span-2 text-emerald-400 select-all">{node.reality.publicKey}</span>
              </div>
            )}
            {node.wsOpts?.path && (
              <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-800/60 font-mono">
                <span className="text-slate-500">WS 路径 (Path):</span>
                <span className="col-span-2 text-slate-200 select-all">{node.wsOpts.path}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 py-1 font-mono">
              <span className="text-slate-500">延迟状态:</span>
              <div className="col-span-2">
                <LatencyBadge ping={node.ping} status={node.status} />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{current.label}</span>
              <button
                onClick={() => handleCopy(current.text, activeTab)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/20 transition"
              >
                {copiedKey === activeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>已复制到剪贴板</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制内容</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs font-mono text-slate-300 max-h-72 overflow-y-auto overflow-x-auto whitespace-pre-wrap break-all select-all">
              {current.text}
            </pre>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800 text-xs text-slate-500">
          <span>💡 原生链接可直接导入 v2rayN / Shadowrocket / Sing-box 进行单独测速。</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
