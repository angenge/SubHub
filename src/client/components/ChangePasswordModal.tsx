import React, { useState } from 'react';
import { X, Lock, KeyRound, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { changePassword } from '../api/index.js';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  hasPasswordEnv?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  hasPasswordEnv,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!oldPassword) {
      setError('请输入原密码');
      return;
    }
    if (newPassword.length < 4) {
      setError('新密码长度至少为 4 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '修改密码失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-4 sm:p-6 text-slate-100 my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">修改管理员密码</h3>
            <p className="text-xs text-slate-400">
              {hasPasswordEnv ? '当前密码受环境变量保护' : '修改后下次登录将使用新密码'}
            </p>
          </div>
        </div>

        {hasPasswordEnv ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs leading-relaxed">
              <p className="font-semibold mb-1 flex items-center gap-1.5 text-sky-200">
                <ShieldCheck className="w-4 h-4" /> 环境变量管理模式 (声明式配置)
              </p>
              当前系统的管理员密码由运行环境变量 <code className="px-1.5 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-200 font-mono text-[11px]">ADMIN_PASSWORD</code> 统一提供。根据云原生安全规范，不支持在 Web 界面在线覆写。如需修改，请在宿主机/容器环境变量中调整并重启服务。
            </div>
            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
              >
                我知道了
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">原管理员密码</label>
                <div className="relative">
                  <input
                    type={showOldPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 text-sm text-slate-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-3 top-2 text-slate-500 hover:text-slate-300 transition"
                    title={showOldPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">新密码</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="至少 4 位字符"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 text-sm text-slate-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2 text-slate-500 hover:text-slate-300 transition"
                    title={showNewPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">确认新密码</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 text-sm text-slate-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2 text-slate-500 hover:text-slate-300 transition"
                    title={showConfirmPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
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
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 transition disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  确认修改
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
