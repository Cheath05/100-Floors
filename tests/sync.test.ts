// Starts the real server in-process and has 4 bot clients (real SDK, real WebSockets) wander a room,
// then checks prediction and every client's view of the world agree.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from '@colyseus/core';
import { startServer } from '@floors/server';
import { runSyncCheck } from '../tools/botClient';

const PORT = 8190 + Math.floor(Math.random() * 50);
let server: Server;

beforeAll(async () => {
  server = await startServer({ port: PORT, host: '127.0.0.1', quiet: true });
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('4 clients in one room', () => {
  for (const room of ['town', 'field']) {
    it(`stay in sync in the ${room}`, async () => {
      const report = await runSyncCheck(`http://127.0.0.1:${PORT}`, room, 4, 3);
      expect(report.inputsSent).toBeGreaterThan(4 * 60);
      expect(report.maxSelfError).toBeLessThan(0.01);
      expect(report.maxViewDisagreement).toBeLessThan(0.01);
      // Prediction should agree with the server almost exactly (float32 rounding only).
      expect(report.maxCorrection).toBeLessThan(0.05);
    }, 20_000);
  }
});
