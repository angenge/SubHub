import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const envStr = (k: string, d: string) => process.env[k] ?? d;
const envNum = (k: string, d: number) => {
  const raw = process.env[k];
  if (raw === undefined || raw === '') return d;
  const n = Number(raw);
  return Number.isFinite(n) ? n : d;
};

const CLASH_HOST = envStr('CLASH_HOST', 'http://192.168.68.100:9090').replace(/\/+$/, '');
const CLASH_SECRET = envStr('CLASH_SECRET', '');
const PROXY = envStr('PROXY', 'socks5h://192.168.68.100:1080');
const SPEED_URL = envStr('SPEED_URL', 'https://speed.cloudflare.com/__down?bytes=5242880');
const MIN_MBPS = envNum('MIN_SPEED_MBPS', 10);
const INTERVAL_SEC = envNum('INTERVAL_SEC', 90);
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_SWITCHES = envNum('MAX_SWITCHES', 3);
const SWITCH_WINDOW_MS = envNum('SWITCH_WINDOW_MIN', 5) * 60_000;
const BAD_COOLDOWN_MS = envNum('BAD_NODE_COOLDOWN_MIN', 10) * 60_000;
const PROBE_TIMEOUT_SEC = envNum('PROBE_TIMEOUT_SEC', 40);
const FAILOVER_TIMEOUT_SEC = envNum('FAILOVER_TIMEOUT_SEC', 20);
const MAX_TICKS = envNum('MAX_TICKS', 0);
const NULL_OUT = process.platform === 'win32' ? 'NUL' : '/dev/null';

const SELECTOR = '\u{1F680} \u8282\u70B9\u9009\u62E9';
const DIRECT = 'direct';

const badNodes = new Map<string, number>();
const switchTimes: number[] = [];
let holdUntil = 0;
let busy = false;

const log = (msg: string) => console.log(`[probe ${new Date().toISOString()}] ${msg}`);

async function run(args: string[]): Promise<{ ok: boolean; code: number; out: string; err: string }> {
  try {
    const { stdout, stderr } = await execFileP('curl', args, {
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, code: 0, out: stdout, err: stderr };
  } catch (e: any) {
    return { ok: false, code: e?.code ?? -1, out: e?.stdout ?? '', err: e?.stderr ?? String(e?.message ?? e) };
  }
}

async function clashApi(path: string, method: 'GET' | 'PUT' = 'GET', body?: object) {
  const args = ['-sS', '--max-time', '10', '-X', method];
  if (CLASH_SECRET) args.push('-H', `Authorization: Bearer ${CLASH_SECRET}`);
  args.push('-H', 'Content-Type: application/json');
  if (body !== undefined) args.push('-d', JSON.stringify(body));
  args.push(`${CLASH_HOST}${path}`);
  const r = await run(args);
  if (!r.ok) throw new Error(`${method} ${path} exited ${r.code}: ${r.err.trim()}`);
  if (!r.out.trim()) return undefined;
  try {
    return JSON.parse(r.out);
  } catch {
    return { raw: r.out };
  }
}

async function getSelectorState() {
  const data = await clashApi('/proxies');
  const proxies: any = data?.proxies ?? {};
  const sel: any = proxies[SELECTOR];
  if (!sel) throw new Error(`selector '${SELECTOR}' missing from /proxies`);
  const all: string[] = (sel.all ?? []).filter((n: string) => n !== DIRECT);
  const nowRaw: string = sel.now ?? sel.selected;
  const active = all.includes(nowRaw) ? nowRaw : (all[0] ?? '');
  const delay = new Map<string, number>();
  for (const n of all) {
    const last = proxies[n]?.history?.at(-1);
    if (typeof last?.delay === 'number' && last.delay > 0) delay.set(n, last.delay);
  }
  const ranked = [...all].sort((a, b) => {
    const da = delay.get(a);
    const db = delay.get(b);
    if (da === undefined && db === undefined) return 0;
    if (da === undefined) return 1;
    if (db === undefined) return -1;
    return da - db;
  });
  return { all, active, ranked, delay };
}

async function measureSpeed(timeoutSec = PROBE_TIMEOUT_SEC): Promise<{ ok: boolean; mbps: number; err: string }> {
  const args = [
    '-sS',
    '--max-time',
    String(timeoutSec),
    '-o',
    NULL_OUT,
    '-x',
    PROXY,
    '-w',
    '%{http_code} %{speed_download} %{time_total}',
    SPEED_URL,
  ];
  const r = await run(args);
  if (!r.ok) return { ok: false, mbps: 0, err: r.err.trim() || `exit ${r.code}` };
  const [code, spd] = r.out.trim().split(/\s+/);
  if (code !== '200') return { ok: false, mbps: 0, err: `http ${code}` };
  const bps = parseFloat(spd) || 0;
  return { ok: true, mbps: (bps * 8) / 1e6, err: '' };
}

async function switchTo(tag: string) {
  await clashApi(`/proxies/${encodeURIComponent(SELECTOR)}`, 'PUT', { name: tag });
}

function candidateList(active: string, ranked: string[]) {
  const now = Date.now();
  return ranked.filter((t) => {
    if (t === active) return false;
    const last = badNodes.get(t);
    if (last === undefined) return true;
    return now - last > BAD_COOLDOWN_MS;
  });
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const { all, active, ranked } = await getSelectorState();
    if (!active) {
      log('no candidate nodes');
      return;
    }
    const top = ranked.slice(0, 8).join(',');
    log(`active=${active} rank(top8)=${top}`);

    let probe = await measureSpeed();
    if (!probe.ok) {
      log(`active=${active} probe error (${probe.err}); rechecking once`);
      probe = await measureSpeed();
    }
    if (probe.ok && probe.mbps >= MIN_MBPS) {
      log(`active=${active} speed=${probe.mbps.toFixed(1)}Mbps => stay`);
      return;
    }
    const reason = probe.ok ? `slow(${probe.mbps.toFixed(1)}Mbps < ${MIN_MBPS})` : `down(${probe.err})`;
    badNodes.set(active, Date.now());
    log(`active=${active} ${reason} => need switch`);

    const now = Date.now();
    if (now < holdUntil) {
      log('hold: cooldown window active, keeping current selection');
      return;
    }
    const recent = switchTimes.filter((t) => now - t < SWITCH_WINDOW_MS).length;
    if (recent >= MAX_SWITCHES) {
      log(`hold: >=${MAX_SWITCHES} switches within ${SWITCH_WINDOW_MS / 60_000}min`);
      holdUntil = now + SWITCH_WINDOW_MS;
      return;
    }

    const list = candidateList(active, ranked);
    if (!list.length) {
      log('hold: no usable candidates');
      holdUntil = now + SWITCH_WINDOW_MS;
      return;
    }
    for (const tag of list) {
      if (DRY_RUN) {
        log(`dry-run: would switch to '${tag}' and validate`);
        continue;
      }
      try {
        await switchTo(tag);
        switchTimes.push(now);
        log(`switched to '${tag}'`);
        const pr = await measureSpeed(FAILOVER_TIMEOUT_SEC);
        if (pr.ok && pr.mbps >= MIN_MBPS) {
          log(`'${tag}' ok ${pr.mbps.toFixed(1)}Mbps => stay`);
          return;
        }
        badNodes.set(tag, now);
        log(`'${tag}' failed (${pr.ok ? pr.mbps.toFixed(1) + 'Mbps' : pr.err})`);
      } catch (e: any) {
        badNodes.set(tag, now);
        log(`switch to '${tag}' failed: ${e.message}`);
      }
    }
    if (!DRY_RUN) {
      log('ALL_CANDIDATES_FAILED => keep current selection, hold');
      holdUntil = Date.now() + SWITCH_WINDOW_MS;
    }
  } catch (e: any) {
    log(`cycle error: ${e.message}`);
  } finally {
    busy = false;
  }
}

if (!CLASH_SECRET) log('WARNING: CLASH_SECRET not set');
log(`start host=${CLASH_HOST} proxy=${PROXY} min=${MIN_MBPS}Mbps interval=${INTERVAL_SEC}s dryRun=${DRY_RUN}`);

await tick();
if (DRY_RUN || MAX_TICKS === 1) process.exit(0);
let cycles = 1;
setInterval(() => {
  tick();
  cycles += 1;
  if (MAX_TICKS > 0 && cycles >= MAX_TICKS) process.exit(0);
}, INTERVAL_SEC * 1000);