import React, { useState } from 'react';
import { X, Check, Copy, ExternalLink, QrCode, ShieldCheck, Smartphone, Globe } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AggregateGroup } from '../../core/types/index.js';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  aggregate: AggregateGroup | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, aggregate }) => {
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [activeQrFormat, setActiveQrFormat] = useState<string>('clash');

  if (!isOpen || !aggregate) return null;

  const origin = window.location.origin;
  const baseUrl = `${origin}/sub/${aggregate.token}`;

  const links = [
    { label: 'Clash / Mihomo 订阅', format: 'clash', url: `${baseUrl}?target=clash`, badge: '推荐' },
    { label: 'Sing-box 订阅', format: 'singbox', url: `${baseUrl}?target=singbox`, badge: '现代' },
    { label: 'Surge 订阅', format: 'surge', url: `${baseUrl}?target=surge` },
    { label: 'Loon 订阅', format: 'loon', url: `${baseUrl}?target=loon` },
    { label: 'V2Ray / Base64 订阅', format: 'base64', url: `${baseUrl}?target=base64` },
    { label: '自适应智能订阅 (根据UA)', format: 'auto', url: baseUrl, badge: '极简' },
  ];

  const activeLink = links.find((l) => l.format === activeQrFormat) || links[0];

  const handleCopy = (url: string, format: string) => {
    navigator.clipboard.writeText(url);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">获取聚合订阅与手机扫码</h3>
            <p className="text-xs text-slate-400">已为「{aggregate.name}」生成专属安全订阅地址与二维码</p>
          </div>
        </div>

        {/* Main Grid: Left links list, Right QR code scanner card */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Left: Link options (7 cols) */}
          <div className="md:col-span-7 space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {links.map((item) => {
              const isCopied = copiedFormat === item.format;
              const isSelectedForQr = activeQrFormat === item.format;

              return (
                <div
                  key={item.format}
                  onClick={() => setActiveQrFormat(item.format)}
                  className={`p-3 rounded-xl border transition cursor-pointer ${
                    isSelectedForQr
                      ? 'bg-slate-950 border-sky-500/50 shadow-md shadow-sky-500/5 ring-1 ring-sky-500/20'
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">{item.label}</span>
                      {item.badge && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          {item.badge}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(item.url, item.format);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900 text-[11px] font-mono text-slate-400 truncate select-all border border-slate-800/60">
                    {item.url}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Interactive QR Code Card (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center p-5 rounded-xl bg-slate-950 border border-slate-800/80 text-center space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-400">
              <Smartphone className="w-4 h-4" />
              <span>手机扫码一键导入</span>
            </div>

            {/* Crisp QR Code Container */}
            <div className="p-3 bg-white rounded-2xl shadow-xl shadow-black/40 inline-block ring-4 ring-slate-800">
              <QRCodeSVG
                value={activeLink.url}
                size={160}
                level="M"
                includeMargin={false}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-200">{activeLink.label}</div>
              <p className="text-[11px] text-slate-500 max-w-[200px] leading-tight">
                使用 Shadowrocket (小火箭)、Sing-box、Clash Verge 或手机客户端扫描上方二维码
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800 text-xs text-slate-400">
          <span>💡 提示: 订阅支持各客户端直接导入，并会自动同步节点健康状态。</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
