import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import crypto from 'crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory token revocation blacklist: token -> expiry timestamp (ms)
const revokedTokens = new Map<string, number>();

// Periodic cleanup of expired revoked tokens on Node.js (avoid global timers on CF Workers)
const isNodeEnv = typeof process !== 'undefined' && process.versions && !!process.versions.node && typeof (globalThis as any).WebSocketPair === 'undefined';
if (isNodeEnv && typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [token, exp] of revokedTokens) {
      if (now > exp) {
        revokedTokens.delete(token);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

function normalizeToken(token?: string | null): string {
  if (!token) return '';
  return token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
}

async function getOrInitSecret(): Promise<string> {
  try {
    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'session_secret'));
    const existing = rows[0];
    if (existing && existing.value) {
      return existing.value;
    }
    const newSecret = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    await db.insert(schema.settings).values({ key: 'session_secret', value: newSecret, updatedAt: now });
    return newSecret;
  } catch {
    return 'fallback_subhub_secret_key_fixed';
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex');
}

export async function getAuthStatus(): Promise<{ initialized: boolean; hasPasswordEnv: boolean }> {
  const envPass = process.env.ADMIN_PASSWORD;
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'admin_auth'));
  const dbSetting = rows[0];

  return {
    initialized: !!(envPass || dbSetting),
    hasPasswordEnv: !!envPass,
  };
}

export async function initOrUpdatePassword(password: string): Promise<boolean> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const value = JSON.stringify({ salt, hash });
  const now = new Date().toISOString();

  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'admin_auth'));
  const existing = rows[0];
  if (existing) {
    await db
      .update(schema.settings)
      .set({ value, updatedAt: now })
      .where(eq(schema.settings.key, 'admin_auth'));
  } else {
    await db
      .insert(schema.settings)
      .values({ key: 'admin_auth', value, updatedAt: now });
  }

  // Rotate session secret to invalidate older sessions upon password change
  const newSecret = crypto.randomBytes(32).toString('hex');
  const secretRows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'session_secret'));
  const existingSecret = secretRows[0];
  if (existingSecret) {
    await db.update(schema.settings).set({ value: newSecret, updatedAt: now }).where(eq(schema.settings.key, 'session_secret'));
  } else {
    await db.insert(schema.settings).values({ key: 'session_secret', value: newSecret, updatedAt: now });
  }

  return true;
}

export async function verifyPassword(password: string): Promise<boolean> {
  // 1. Check environment variable first if set
  if (process.env.ADMIN_PASSWORD) {
    return process.env.ADMIN_PASSWORD === password;
  }

  // 2. Check Database Setting
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'admin_auth'));
  const setting = rows[0];
  if (!setting) {
    return false;
  }

  try {
    const { salt, hash } = JSON.parse(setting.value);
    const checkHash = hashPassword(password, salt);
    return checkHash === hash;
  } catch {
    return false;
  }
}

export async function createSessionToken(): Promise<string> {
  const secret = await getOrInitSecret();
  const payload = {
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

export async function validateSessionToken(token?: string | null): Promise<boolean> {
  const cleanToken = normalizeToken(token);
  if (!cleanToken) return false;

  // Reject revoked (logged out) tokens
  if (revokedTokens.has(cleanToken)) return false;

  const parts = cleanToken.split('.');
  if (parts.length !== 2) return false;

  const [payloadB64, signature] = parts;
  try {
    const secret = await getOrInitSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    if (signature !== expectedSig) return false;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}

export function revokeSessionToken(token?: string | null) {
  const cleanToken = normalizeToken(token);
  if (!cleanToken) return;

  try {
    const payloadB64 = cleanToken.split('.')[0];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    const exp = typeof payload.exp === 'number' ? payload.exp : Date.now() + SESSION_TTL_MS;
    revokedTokens.set(cleanToken, exp);
  } catch {
    revokedTokens.set(cleanToken, Date.now() + SESSION_TTL_MS);
  }
}
