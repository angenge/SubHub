import React, { useState, useEffect } from 'react';
import { ExternalLink, RefreshCw, Settings, Check, Eye, EyeOff, Sparkles, RotateCcw } from 'lucide-react';
import { AggregateGroup } from '../../core/types/index.js';
import {
  getGatewayClashSecret,
  rotateGatewayClashSecret,
  getDashboardConnectionConfig,
  saveDashboardConnectionConfig,
} from '../api/index.js';

interface DashboardTabProps {
  aggregates?: AggregateGroup[];
}

const STORAGE_KEY_PROTOCOL = 'subhub_clash_api_protocol';
const STORAGE_KEY_HOST = 'subhub_clash_api_host';
const STORAGE_KEY_PORT = 'subhub_clash_api_port';
const STORAGE_KEY_SECRET = 'subhub_clash_api_secret';

export const DashboardTab: React.FC<DashboardTabProps> = ({ aggregates = [] }) => {
  const [apiProtocol, setApiProtocol] = useState<'http' | 'https'>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PROTOCOL);
    return saved === 'https' ? 'https' : 'http';
  });
  const [apiHost, setApiHost] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_HOST) || '';
  });
  const [apiPort, setApiPort] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_PORT) || '9090';
  });
  const [apiSecret, setApiSecret] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_SECRET) || '';
  });

  const [showSecret, setShowSecret] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isLoadingSecret, setIsLoadingSecret] = useState(false);
  const [isRotatingSecret, setIsRotatingSecret] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Load server-persisted connection configuration on mount
  useEffect(() => {
    getDashboardConnectionConfig()
      .then((cfg) => {
        if (cfg) {
          if (cfg.protocol) setApiProtocol(cfg.protocol);
          if (cfg.host) setApiHost(cfg.host);
          if (cfg.port) setApiPort(cfg.port);
          if (cfg.secret) setApiSecret(cfg.secret);

          // Update local cache
          localStorage.setItem(STORAGE_KEY_PROTOCOL, cfg.protocol);
          localStorage.setItem(STORAGE_KEY_HOST, cfg.host);
          localStorage.setItem(STORAGE_KEY_PORT, cfg.port);
          localStorage.setItem(STORAGE_KEY_SECRET, cfg.secret);
        }
      })
      .catch((e) => console.warn('Failed to load server dashboard config:', e.message));
  }, []);

  const handleFetchSystemSecret = async () => {
    setIsLoadingSecret(true);
    try {
      const secret = await getGatewayClashSecret();
      if (secret) {
        setApiSecret(secret);
      }
    } catch (e: any) {
      console.error('Failed to fetch gateway clash secret:', e.message);
    } finally {
      setIsLoadingSecret(false);
    }
  };

  const handleRotateSystemSecret = async () => {
    if (!window.confirm('确定要轮换重置全局 Clash API 密钥吗？\n重置后，后续下发订阅的控制密钥将更新，本地内核在下一次更新时也会同步生效。')) {
      return;
    }
    setIsRotatingSecret(true);
    try {
      const newSecret = await rotateGatewayClashSecret();
      if (newSecret) {
        setApiSecret(newSecret);
        // Persist to server
        await saveDashboardConnectionConfig({
          protocol: apiProtocol,
          host: cleanHost,
          port: apiPort,
          secret: newSecret,
        });
      }
    } catch (e: any) {
      console.error('Failed to rotate gateway clash secret:', e.message);
    } finally {
      setIsRotatingSecret(false);
    }
  };

  // Clean host (strip http/https prefix if typed by user, and strip trailing colons/ports)
  let cleanHost = apiHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (cleanHost.includes(':') && !cleanHost.includes('[')) {
    const [h, p] = cleanHost.split(':');
    cleanHost = h;
  }

  // If host is provided by user, append setup parameters for auto-login.
  // Otherwise, load plain /ui/ without pre-filled host.
  const protocolParam = apiProtocol === 'http' ? 'http=true' : 'https=true';
  const queryParts: string[] = [protocolParam];
  if (cleanHost) queryParts.push(`hostname=${encodeURIComponent(cleanHost)}`);
  if (apiPort) queryParts.push(`port=${encodeURIComponent(apiPort)}`);
  if (apiSecret) queryParts.push(`secret=${encodeURIComponent(apiSecret)}`);

  const metacubexdUrl = cleanHost
    ? `/ui/#/setup?${queryParts.join('&')}`
    : `/ui/`;
  const fullExternalUrl = `${window.location.origin}${metacubexdUrl}`;

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);

    // 1. Persist to local browser
    localStorage.setItem(STORAGE_KEY_PROTOCOL, apiProtocol);
    localStorage.setItem(STORAGE_KEY_HOST, cleanHost);
    localStorage.setItem(STORAGE_KEY_PORT, apiPort);
    localStorage.setItem(STORAGE_KEY_SECRET, apiSecret);

    // 2. Persist to server (D1 database) so other browsers/devices get this config
    try {
      await saveDashboardConnectionConfig({
        protocol: apiProtocol,
        host: cleanHost,
        port: apiPort,
        secret: apiSecret,
      });
    } catch (e: any) {
      console.warn('Failed to sync dashboard config to server:', e.message);
    } finally {
      setIsSavingConfig(false);
    }

    setSavedSuccess(true);
    setIframeKey((prev) => prev + 1);
    setTimeout(() => {
      setSavedSuccess(false);
      setIsConfigOpen(false);
    }, 800);
  };

  const [iframeLoaded, setIframeLoaded] = useState(false);

  const handleReload = () => {
    setIframeLoaded(false);
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenNewWindow = () => {
    window.open(fullExternalUrl, '_blank', 'noopener,noreferrer');
  };

  const isConfigured = Boolean(cleanHost);

  return (
    <div className="flex flex-col h-[calc(100dvh-12.5rem)] md:h-[calc(100vh-7rem)] min-h-[420px] w-full gap-2">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2 min-w-0 max-w-[65%] sm:max-w-[70%]">
          {isConfigured ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium min-w-0 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate">核心 API: {apiProtocol}://{cleanHost}{apiPort ? `:${apiPort}` : ''}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium min-w-0 truncate">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="truncate">未设置后端 API（点击连接设置填写）</span>
            </div>
          )}
          <span className="hidden md:inline text-xs text-slate-500">|</span>
          <span className="hidden md:inline text-xs text-slate-400 truncate">
            Metacubexd 节点控制台
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95"
            title="修改后端 API 连接地址与密钥"
          >
            <Settings className="w-3.5 h-3.5 text-sky-400" />
            <span>{isConfigured ? '连接设置' : '配置后端'}</span>
          </button>

          <button
            onClick={handleReload}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition active:scale-95"
            title="刷新控制面板"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleOpenNewWindow}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/20 transition active:scale-95"
            title="在新窗口中独立打开面板"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">独立窗口</span>
          </button>
        </div>
      </div>

      {/* Connection Setting Drawer/Form */}
      {isConfigOpen && (
        <form
          onSubmit={handleSaveConfig}
          className="p-3.5 sm:p-4 bg-slate-900 border border-sky-500/30 rounded-xl shadow-xl space-y-3 shrink-0 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="col-span-1">
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                协议 (Protocol)
              </label>
              <select
                value={apiProtocol}
                onChange={(e) => setApiProtocol(e.target.value as 'http' | 'https')}
                className="w-full px-2.5 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500"
              >
                <option value="http">http:// (内网)</option>
                <option value="https">https:// (公网)</option>
              </select>
            </div>

            <div className="col-span-1">
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                端口 (Port)
              </label>
              <input
                type="text"
                value={apiPort}
                onChange={(e) => setApiPort(e.target.value)}
                placeholder="例如: 9090"
                className="w-full px-2.5 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                后端 Host (内网 IP / 公网域名)
              </label>
              <input
                type="text"
                value={apiHost}
                onChange={(e) => setApiHost(e.target.value)}
                placeholder="例如: 192.168.68.111 或 proxy.hiz.one"
                className="w-full px-2.5 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <div className="col-span-2 sm:col-span-4">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-slate-400">
                  Secret 密钥 (Clash API Token)
                </label>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={handleFetchSystemSecret}
                    disabled={isLoadingSecret || isRotatingSecret}
                    className="flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-medium transition disabled:opacity-50"
                    title="自动拉取 SubHub 为当前 Sing-box/Clash 订阅下发的统一密钥"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>{isLoadingSecret ? '获取中…' : '填入系统密钥'}</span>
                  </button>
                  <span className="text-slate-600 text-[10px]">/</span>
                  <button
                    type="button"
                    onClick={handleRotateSystemSecret}
                    disabled={isLoadingSecret || isRotatingSecret}
                    className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-medium transition disabled:opacity-50"
                    title="轮换并生成全新的全局 Clash API 密钥"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>{isRotatingSecret ? '重置中…' : '重置密钥'}</span>
                  </button>
                </div>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="无密钥则留空"
                  className="w-full pl-2.5 pr-8 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 text-slate-400 hover:text-slate-200 transition p-0.5"
                  title={showSecret ? '隐藏密钥' : '显示明文密钥'}
                >
                  {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsConfigOpen(false)}
              className="flex-1 sm:flex-none px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSavingConfig}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-md transition active:scale-95 disabled:opacity-50"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>已保存</span>
                </>
              ) : (
                <span>保存并重载</span>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Embedded Metacubexd Iframe Container with Skeleton Loader */}
      <div className="flex-1 w-full h-full bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl relative">
        {!iframeLoaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm gap-3 animate-in fade-in duration-200">
            <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium text-slate-400 animate-pulse">
              正在极速载入 Metacubexd 控制台...
            </p>
          </div>
        )}
        <iframe
          key={iframeKey}
          src={metacubexdUrl}
          title="Metacubexd Dashboard"
          onLoad={() => setIframeLoaded(true)}
          className={`w-full h-full border-0 bg-slate-950 transition-opacity duration-300 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
};
