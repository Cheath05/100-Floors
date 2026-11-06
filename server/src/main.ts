import { SERVER_PORT } from '@floors/shared';
import { startServer } from './index';

const port = Number(process.env.GAME_PORT) || SERVER_PORT;
const host = process.env.HOST || '0.0.0.0';
const serveClient = process.argv.includes('--serve-client');

const server = await startServer({ port, host, serveClient });
console.log(`100 Floors server on http://localhost:${port}${serveClient ? ' (serving the built client)' : ''}`);

const stop = async () => {
  await server.gracefullyShutdown(false);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
