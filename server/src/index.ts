// Builds the game server. `main.ts` runs it; tests start it in-process on a spare port.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM } from '@floors/shared';
import express from 'express';
import { BossRoom, FieldRoom, TownRoom } from './rooms';

export { BossRoom, FieldRoom, TownRoom } from './rooms';
export { WorldRoom } from './rooms/WorldRoom';

const CLIENT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export interface StartOptions {
  port: number;
  host?: string;
  /** Serve the built client from client/dist (if it exists). */
  serveClient?: boolean;
  quiet?: boolean;
}

export async function startServer(opts: StartOptions): Promise<Server> {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: !opts.quiet,
    gracefullyShutdown: false,
    express: (app) => {
      app.get('/healthz', (_req, res) => {
        res.json({ ok: true });
      });
      if (opts.serveClient && existsSync(CLIENT_DIST)) {
        app.use(express.static(CLIENT_DIST, { index: 'index.html', maxAge: '1h' }));
        app.get(/^\/(?!matchmake).*/, (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
      }
    },
  });
  server.define(ROOM.town, TownRoom);
  server.define(ROOM.field, FieldRoom);
  server.define(ROOM.boss, BossRoom);
  await server.listen(opts.port, opts.host);
  return server;
}
