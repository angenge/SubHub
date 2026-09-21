import { Hono } from 'hono';
import {
  generateAggregateSubscription,
  getAggregateByToken,
  recordAggregateAccess,
} from '../services/aggregateService.js';
import { getAllSubscriptions } from '../services/subscriptionService.js';
import { checkRateLimit, getClientIpFromContext } from '../utils/rateLimiter.js';

function asciiFilename(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe || 'subscription.yaml';
}

export const subRouter = new Hono();

function detectTargetFormat(ua: string): string | null {
  if (!ua) return null;
  const lowerUA = ua.toLowerCase();
  if (lowerUA.includes('clash') || lowerUA.includes('mihomo') || lowerUA.includes('stash')) {
    return 'clash';
  }
  if (lowerUA.includes('sing-box') || lowerUA.includes('singbox')) {
    return 'singbox';
  }
  if (lowerUA.includes('surge')) {
    return 'surge';
  }
  if (lowerUA.includes('loon')) {
    return 'loon';
  }
  if (lowerUA.includes('shadowrocket') || lowerUA.includes('quantumult') || lowerUA.includes('v2ray')) {
    return 'base64';
  }
  return null;
}

subRouter.get('/:token', async (c) => {
  const token = c.req.param('token');
  const targetParam = c.req.query('target') || c.req.query('format');
  const ua = c.req.header('User-Agent') || '';
  const clientIp = getClientIpFromContext(c);

  // Rate limiting for public subscription distribution: max 60 requests per minute per IP
  const rateLimit = checkRateLimit('sub_download', clientIp, { maxRequests: 60, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    return c.text(`Too Many Requests. Please retry in ${rateLimit.retryAfterSec} seconds.`, 429);
  }

  const group = await getAggregateByToken(token);
  if (!group || !group.enabled) {
    return c.text('Subscription Not Found or Disabled', 404);
  }

  const target = targetParam || detectTargetFormat(ua) || group.targetFormat || 'clash';

  try {
    const { content, contentType, filename, nodeCount } = await generateAggregateSubscription(token, target);

    // Record access audit log
    try {
      await recordAggregateAccess({
        aggregateId: group.id,
        aggregateToken: group.token,
        ip: clientIp,
        userAgent: ua,
        targetFormat: target,
        nodeCount,
      });
    } catch (e: any) {
      console.error('Failed to record access log:', e.message);
    }

    // Calculate aggregated traffic & expiration for userinfo header
    const allSubs = await getAllSubscriptions();
    const subs = allSubs.filter((s: any) => s.status !== 'disabled');
    let totalUpload = 0;
    let totalDownload = 0;
    let totalQuota = 0;
    let minExpire = 0;

    const activeSubIds = new Set(
      group.subscriptionIds.length > 0
        ? group.subscriptionIds.filter((id: string) => subs.some((s: any) => s.id === id))
        : subs.map((s: any) => s.id)
    );

    for (const sub of subs) {
      if (!activeSubIds.has(sub.id)) continue;
      if (sub.upload) totalUpload += sub.upload;
      if (sub.download) totalDownload += sub.download;
      if (sub.total) totalQuota += sub.total;
      if (sub.expire && sub.expire > 0) {
        if (minExpire === 0 || sub.expire < minExpire) {
          minExpire = sub.expire;
        }
      }
    }

    let minIntervalMin = Infinity;
    for (const sub of subs) {
      if (!activeSubIds.has(sub.id)) continue;
      const iv = sub.updateInterval && sub.updateInterval > 0 ? sub.updateInterval : 180;
      if (iv < minIntervalMin) minIntervalMin = iv;
    }
    const updateHours = Number.isFinite(minIntervalMin)
      ? Math.max(1, Math.min(24, Math.ceil(minIntervalMin / 60)))
      : 3;

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Profile-Update-Interval': String(updateHours),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    };

    if (totalQuota > 0 || totalUpload > 0 || totalDownload > 0) {
      headers['subscription-userinfo'] = `upload=${totalUpload}; download=${totalDownload}; total=${totalQuota}; expire=${minExpire}`;
    }

    return c.body(content, 200, headers);
  } catch (err: any) {
    return c.text(`Error generating subscription: ${err.message}`, 500);
  }
});
