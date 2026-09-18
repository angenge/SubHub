import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes?: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(dateStr?: string | number | null): string {
  if (!dateStr) return '从未';
  let date: Date;
  if (typeof dateStr === 'number') {
    // Check if seconds or ms
    date = new Date(dateStr > 1e11 ? dateStr : dateStr * 1000);
  } else {
    date = new Date(dateStr);
  }
  if (isNaN(date.getTime())) return '未知';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatExpireDate(timestamp?: number): string {
  if (!timestamp || timestamp === 0) return '永久有效 / 未知';
  const date = new Date(timestamp > 1e11 ? timestamp : timestamp * 1000);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const formatted = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  if (diffDays < 0) {
    return `${formatted} (已过期)`;
  }
  if (diffDays <= 7) {
    return `${formatted} (剩余 ${diffDays} 天 ⚠️)`;
  }
  return `${formatted} (剩余 ${diffDays} 天)`;
}
