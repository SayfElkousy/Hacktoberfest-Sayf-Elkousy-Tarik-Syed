// Server-sent events: one-way live updates to students and the dashboard.

import type { Response } from 'express';

class Channel<T> {
  private clients = new Map<string, Set<Response>>();

  subscribe(key: string, res: Response, onClose?: () => void): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');

    const set = this.clients.get(key) ?? new Set();
    set.add(res);
    this.clients.set(key, set);

    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
    res.on('close', () => {
      clearInterval(heartbeat);
      set.delete(res);
      if (set.size === 0) this.clients.delete(key);
      onClose?.();
    });
  }

  send(key: string, event: T): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients.get(key) ?? []) res.write(payload);
  }

  has(key: string): boolean {
    return this.clients.has(key);
  }
}

export const studentChannel = new Channel<import('../shared/types.ts').StudentEvent>();
export const dashboardChannel = new Channel<import('../shared/types.ts').DashboardEvent>();
