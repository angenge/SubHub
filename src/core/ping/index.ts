import net from 'net';
import { ProxyNode, PingResult } from '../types/index.js';

export function tcpPing(host: string, port: number, timeoutMs = 2500): Promise<{ ping: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    let isResolved = false;

    const cleanup = () => {
      clearTimeout(hardTimer);
      socket.removeAllListeners();
      socket.destroy();
    };

    const finish = (result: { ping: number; error?: string }) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve(result);
    };

    // Hard fallback timer to guarantee no hang during unresolvable DNS lookups
    const hardTimer = setTimeout(() => {
      finish({ ping: -1, error: 'Timeout' });
    }, timeoutMs + 200);

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      const latency = Date.now() - startTime;
      finish({ ping: latency });
    });

    socket.once('timeout', () => {
      finish({ ping: -1, error: 'Timeout' });
    });

    socket.once('error', (err) => {
      finish({ ping: -1, error: err.message });
    });

    try {
      const cleanHost = host.replace(/^\[|\]$/g, '');
      socket.connect(port, cleanHost);
    } catch (err: any) {
      finish({ ping: -1, error: err?.message || 'Connection failed' });
    }
  });
}

export async function pingNode(node: ProxyNode, timeoutMs = 2500): Promise<PingResult> {
  const checkedAt = new Date().toISOString();
  
  if (!node.server || !node.port) {
    return {
      nodeId: node.id,
      ping: -1,
      status: 'timeout',
      checkedAt,
      error: 'Invalid host or port',
    };
  }

  const { ping, error } = await tcpPing(node.server, node.port, timeoutMs);

  let status: 'fast' | 'slow' | 'timeout' = 'timeout';
  if (ping > 0) {
    status = ping <= 300 ? 'fast' : 'slow';
  }

  return {
    nodeId: node.id,
    ping,
    status,
    checkedAt,
    error,
  };
}

export async function batchPingNodes(
  nodes: ProxyNode[],
  concurrency = 20,
  timeoutMs = 2500,
  onProgress?: (progress: { current: number; total: number; result: PingResult }) => void
): Promise<PingResult[]> {
  const results: PingResult[] = [];
  let index = 0;
  let activeCount = 0;
  const total = nodes.length;

  return new Promise((resolve) => {
    if (nodes.length === 0) {
      return resolve([]);
    }

    function runNext() {
      if (index >= total && activeCount === 0) {
        return resolve(results);
      }

      while (activeCount < concurrency && index < total) {
        const currentIndex = index++;
        const node = nodes[currentIndex];
        activeCount++;

        pingNode(node, timeoutMs)
          .then((res) => {
            results.push(res);
            if (onProgress) {
              onProgress({ current: results.length, total, result: res });
            }
          })
          .catch((err) => {
            const failRes: PingResult = {
              nodeId: node.id,
              ping: -1,
              status: 'timeout',
              checkedAt: new Date().toISOString(),
              error: err?.message || 'Unknown error',
            };
            results.push(failRes);
            if (onProgress) {
              onProgress({ current: results.length, total, result: failRes });
            }
          })
          .finally(() => {
            activeCount--;
            runNext();
          });
      }
    }

    runNext();
  });
}
