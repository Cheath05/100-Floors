// Joins N bot players to a running server, lets them wander, then checks that every client agrees
// on where everyone is.
//
//   npm run bots -- [count=4] [seconds=10] [room=town] [endpoint=http://localhost:8100]
import { SERVER_PORT } from '@floors/shared';
import { runSyncCheck } from './botClient';

const [countArg, secondsArg, roomArg, endpointArg] = process.argv.slice(2);
const count = Number(countArg) || 4;
const seconds = Number(secondsArg) || 10;
const room = roomArg || 'town';
const endpoint = endpointArg || `http://localhost:${SERVER_PORT}`;

console.log(`${count} bots in "${room}" at ${endpoint} for ${seconds}s...`);
const report = await runSyncCheck(endpoint, room, count, seconds);
console.log(`inputs sent: ${report.inputsSent}`);
console.log(`largest prediction correction: ${report.maxCorrection.toFixed(4)} m`);
console.log(`after stopping, own prediction vs server: ${report.maxSelfError.toFixed(5)} m`);
console.log(`after stopping, disagreement between clients: ${report.maxViewDisagreement.toFixed(5)} m`);
console.log(report.ok ? 'IN SYNC' : 'OUT OF SYNC');
process.exit(report.ok ? 0 : 1);
