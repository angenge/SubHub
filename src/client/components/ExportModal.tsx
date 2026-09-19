import React, { useState, useEffect } from 'react';
import { X, Check, Copy, ShieldCheck, Smartphone, Terminal, Server } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AggregateGroup } from '../../core/types/index.js';
import { getClashSecret } from '../../client/api/index.js';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  aggregate: AggregateGroup | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, aggregate }) => {
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [activeQrFormat, setActiveQrFormat] = useState<string>('clash');
  const [activeTab, setActiveTab] = useState<'links' | 'server'>('links');
  const [clashSecret, setClashSecret] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && activeTab === 'server') {
      getClashSecret()
        .then((res) => setClashSecret(res.secret))
        .catch(() => setClashSecret(null));
    }
  }, [isOpen, activeTab]);

  if (!isOpen || !aggregate) return null;

  const origin = window.location.origin;
  const baseUrl = `${origin}/sub/${aggregate.token}`;

  const links = [
    { label: 'Clash / Mihomo 订阅', format: 'clash', url: `${baseUrl}?target=clash`, badge: '推荐' },
    { label: 'Sing-box 订阅 (含Socks5/HTTP混用)', format: 'singbox', url: `${baseUrl}?target=singbox`, badge: '极简' },
    { label: 'Surge 订阅', format: 'surge', url: `${baseUrl}?target=surge` },
    { label: 'Loon 订阅', format: 'loon', url: `${baseUrl}?target=loon` },
    { label: 'V2Ray / Base64 订阅', format: 'base64', url: `${baseUrl}?target=base64` },
    { label: '自适应智能订阅 (根据UA)', format: 'auto', url: baseUrl, badge: '通用' },
  ];

  const activeLink = links.find((l) => l.format === activeQrFormat) || links[0];
  const singboxSubUrl = `${baseUrl}?target=singbox`;

  const dockerServerCmd = `docker run -d \\
  --name sing-box-proxy \\
  --restart unless-stopped \\
  -p 1080:1080 \\
  -p 9090:9090 \\
  -e SUBHUB_URL="${singboxSubUrl}" \\
  -e UPDATE_INTERVAL=7200 \\
  --entrypoint sh \\
  ghcr.io/sagernet/sing-box:v1.13.21 \\
  -c '
    wget -qO /config.json "$SUBHUB_URL" && sing-box run -c /config.json &
    PID=$!
    while true; do
      sleep "\${UPDATE_INTERVAL:-7200}"
      if wget -qO /config_new.json "$SUBHUB_URL"; then
        mv /config_new.json /config.json
        kill -SIGHUP $PID 2>/dev/null || true
      fi
    done
  '`;

  const handleCopy = (url: string, format: string) => {
    navigator.clipboard.writeText(url);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-4 sm:p-6 text-slate-100 my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4 pr-8">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-white">获取聚合订阅与部署命令</h3>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate max-w-xs sm:max-w-md">已为「{aggregate.name}」生成专属安全订阅地址与二维码</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('links')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition active:scale-95 ${
              activeTab === 'links'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            📋 客户端订阅与扫码
          </button>
          <button
            onClick={() => setActiveTab('server')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 ${
              activeTab === 'server'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>🚀 VPS / 本地 Sing-box 服务部署 (Socks5+HTTP混用)</span>
          </button>
        </div>

        {activeTab === 'links' ? (
          /* Links & QR Code Mode */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5">
            {/* Left: Link options (7 cols) */}
            <div className="md:col-span-7 space-y-2 sm:space-y-2.5 max-h-[320px] sm:max-h-96 overflow-y-auto pr-1">
              {links.map((item) => {
                const isCopied = copiedFormat === item.format;
                const isSelectedForQr = activeQrFormat === item.format;

                return (
                  <div
                    key={item.format}
                    onClick={() => setActiveQrFormat(item.format)}
                    className={`p-2.5 sm:p-3 rounded-xl border transition cursor-pointer active:scale-[0.99] ${
                      isSelectedForQr
                        ? 'bg-slate-950 border-sky-500/50 shadow-md shadow-sky-500/5 ring-1 ring-sky-500/20'
                        : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 sm:mb-1.5 gap-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                        <span className="text-xs font-semibold text-slate-200 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(item.url, item.format);
                        }}
                        className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shrink-0 active:scale-95"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 text-[11px] sm:text-xs">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[11px] sm:text-xs">复制</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="p-1.5 sm:p-2 rounded-lg bg-slate-900 text-[10px] sm:text-[11px] font-mono text-slate-400 truncate select-all border border-slate-800/60">
                      {item.url}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Interactive QR Code Card (5 cols) */}
            <div className="md:col-span-5 flex flex-col items-center justify-center p-4 sm:p-5 rounded-xl bg-slate-950 border border-slate-800/80 text-center space-y-2.5 sm:space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-400">
                <Smartphone className="w-4 h-4" />
                <span>手机扫码一键导入</span>
              </div>

              {/* Crisp QR Code Container */}
              <div className="p-2.5 sm:p-3 bg-white rounded-2xl shadow-xl shadow-black/40 inline-block ring-4 ring-slate-800">
                <QRCodeSVG
                  value={activeLink.url}
                  size={140}
                  level="M"
                  includeMargin={false}
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-200">{activeLink.label}</div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 max-w-[200px] leading-tight">
                  使用 Shadowrocket、Sing-box、Clash 或手机客户端扫描上方二维码
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Server & Mixed Mode (SOCKS5 + HTTP on port 1080) */
          <div className="space-y-3.5">
            <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5 text-white">
                <span>🛡️ 安全纯净 + 端口混用 + 自动定时热更新 (Zero Downtime)</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                无需担心整机路由被劫持（已完全移除 TUN 网卡模式，<strong className="text-emerald-400">VPS 的 SSH 端口与本地系统网络 100% 绝对安全</strong>）。
                同一个 <strong className="text-sky-400">1080 端口</strong> 自动兼容 <strong className="text-white">Socks5</strong> 和 <strong className="text-white">HTTP/HTTPS</strong> 协议，每隔 2 小时后台自动热重载最新节点，连接不中断！
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span className="flex items-center gap-1.5 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Docker 一键部署命令 (Sing-box v1.13.21 端口混用)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(dockerServerCmd, 'docker_gw')}
                  className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition active:scale-95"
                >
                  {copiedFormat === 'docker_gw' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFormat === 'docker_gw' ? '已复制命令' : '复制命令'}</span>
                </button>
              </div>

              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] sm:text-[11px] font-mono text-slate-300 overflow-x-auto select-all whitespace-pre-wrap">
                {dockerServerCmd}
              </pre>
            </div>

            {clashSecret && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                  <span className="flex items-center gap-1.5 font-mono">
                    <span>📊 Sing-box 状态可视化仪表盘 (yacd)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(clashSecret, 'clash_secret')}
                    className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition active:scale-95"
                  >
                    {copiedFormat === 'clash_secret' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFormat === 'clash_secret' ? '已复制' : '复制密钥'}</span>
                  </button>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">访问地址</span>
                    <span className="font-mono text-slate-200 select-all">http://&lt;服务器IP&gt;:9090/ui</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">登录密钥 (Secret)</span>
                    <span className="font-mono text-slate-200 select-all break-all text-right">{clashSecret}</span>
                  </div>
                  <p className="text-slate-500 leading-relaxed">
                    浏览器打开上方地址，输入 Secret 后可实时查看各节点延迟、当前选中节点与流量明细，并可在网页手动切换节点。Docker 命令已包含
                    <strong className="text-emerald-400"> -p 9090:9090 </strong>端口映射。
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-slate-800 text-[11px] sm:text-xs text-slate-400 text-center sm:text-left">
          <span>💡 提示: 同一个 1080 端口可同时填入浏览器 HTTP 代理或 Telegram Socks5 代理中直接使用。</span>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition active:scale-95"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
