import React from 'react';
import { cn } from '../lib/utils.js';

interface LatencyBadgeProps {
  ping?: number;
  status?: 'online' | 'slow' | 'timeout' | 'unknown';
  size?: 'sm' | 'md';
}

export const LatencyBadge: React.FC<LatencyBadgeProps> = ({ ping, status = 'unknown', size = 'sm' }) => {
  let color = 'bg-slate-800 text-slate-400 border-slate-700';
  let dotColor = 'bg-slate-500';
  let text = '未测试';

  if (ping !== undefined && ping > 0) {
    if (ping <= 180) {
      color = 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60';
      dotColor = 'bg-emerald-400';
      text = `${ping} ms`;
    } else if (ping <= 350) {
      color = 'bg-amber-950/80 text-amber-400 border-amber-800/60';
      dotColor = 'bg-amber-400';
      text = `${ping} ms`;
    } else {
      color = 'bg-orange-950/80 text-orange-400 border-orange-800/60';
      dotColor = 'bg-orange-400';
      text = `${ping} ms`;
    }
  } else if (status === 'timeout' || ping === -1) {
    color = 'bg-rose-950/80 text-rose-400 border-rose-800/60';
    dotColor = 'bg-rose-500';
    text = '超时';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono font-medium rounded-full border',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        color
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
      {text}
    </span>
  );
};
