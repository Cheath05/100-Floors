import * as THREE from 'three';
import { TICK_DT, INTERP_DELAY_MS, animFor, getMap } from '@floors/shared';
import { Connection, type RemotePlayer } from './net/connection';
import { createScene } from './render/scene';
import { buildWorld, type WorldView } from './render/world';
import { Avatar, preloadCharacters } from './render/characters';
import { ThirdPersonCamera } from './render/camera';
import { Input } from './input/input';
import { DebugHud, showStartPanel } from './ui/hud';

const app = document.getElementById('app')!;
const kit = createScene(app);
const input = new Input(kit.renderer.domElement);
const cam = new ThirdPersonCamera(kit.camera);
const hud = new DebugHud(app);
const avatars = new Map<string, Avatar>();
let world: WorldView | null = null;
void preloadCharacters();

const conn = new Connection({
  onPlayerAdded(p: RemotePlayer, isLocal: boolean) {
    const avatar = new Avatar(p.model, p.name, isLocal);
    avatars.set(p.id, avatar);
    kit.scene.add(avatar.root);
  },
  onPlayerRemoved(id: string) {
    avatars.get(id)?.dispose();
    avatars.delete(id);
  },
  onDisconnected(code: number) {
    hud.showError(`Disconnected from the server (code ${code}). Reload the page to reconnect.`);
  },
});
// Dev-only handle for poking at the scene from the console (camera angles, screenshots).
if (import.meta.env.DEV) Object.assign(window, { __game: { kit, cam, conn } });

let acc = 0;
let last = performance.now();
let started = false;

function simulate(): void {
  const { forward, right } = input.moveAxes();
  const b = cam.basis();
  let dx = b.fx * forward + b.rx * right;
  let dz = b.fz * forward + b.rz * right;
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }
  const jump = input.takeJump();
  const sent = conn.mover.applyLocal(dx, dz, jump && input.locked, input.sprinting());
  conn.sendInput(sent);
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!started) {
    kit.render();
    return;
  }
  const mouse = input.takeMouse();
  cam.applyMouse(mouse.dx, mouse.dy, mouse.wheel);

  acc += dt;
  let steps = 0;
  while (acc >= TICK_DT && steps < 5) {
    simulate();
    acc -= TICK_DT;
    steps++;
  }
  if (acc > TICK_DT) acc = 0;

  // Local player: blend between the last two predicted ticks.
  const alpha = acc / TICK_DT;
  const a = conn.mover.prev;
  const s = conn.mover.state;
  const lx = a.x + (s.x - a.x) * alpha;
  const ly = a.y + (s.y - a.y) * alpha;
  const lz = a.z + (s.z - a.z) * alpha;
  let df = s.facing - a.facing;
  while (df > Math.PI) df -= Math.PI * 2;
  while (df < -Math.PI) df += Math.PI * 2;
  const lf = a.facing + df * alpha;

  const renderTime = now - INTERP_DELAY_MS;
  for (const [id, avatar] of avatars) {
    if (id === conn.sessionId) {
      avatar.update(dt, lx, ly, lz, lf, animFor(s), Math.hypot(s.vx, s.vz));
      continue;
    }
    const remote = conn.players.get(id);
    const snap = remote?.buffer.sample(renderTime);
    if (snap) {
      const prev = remote!.buffer.sample(renderTime - 50) ?? snap;
      const speed = Math.hypot(snap.x - prev.x, snap.z - prev.z) / 0.05;
      avatar.update(dt, snap.x, snap.y, snap.z, snap.facing, snap.anim, speed);
    }
  }

  cam.update(lx, ly, lz, dt, conn.map);
  kit.followShadow(lx, lz);
  world?.update(now / 1000);
  kit.render();
  hud.frame({
    area: conn.map.title,
    players: avatars.size,
    ping: conn.ping,
    correction: conn.mover.lastCorrection,
    pending: conn.mover.pendingCount,
    locked: input.locked,
    safe: conn.map.safeZone,
  });
}

async function start(): Promise<void> {
  // Show something behind the start panel.
  kit.camera.position.set(14, 6, 22);
  kit.camera.lookAt(0, 3, 0);
  world = buildWorld(getMap('town'));
  kit.scene.add(world.group);
  requestAnimationFrame(frame);

  const choice = await showStartPanel(app);
  try {
    await conn.join(choice.room, { name: choice.name, model: choice.model });
  } catch (err) {
    hud.showError(`Could not reach the game server: ${String(err)}. Is it running (npm run dev)?`);
    return;
  }
  if (conn.map.id !== 'town') {
    kit.scene.remove(world.group);
    world.dispose();
    world = buildWorld(conn.map);
    kit.scene.add(world.group);
  }
  kit.setAmbience(conn.map.ground === 'stone' ? 'dungeon' : 'day');
  cam.faceAlong(conn.mover.state.facing);
  last = performance.now();
  started = true;
  // Expose a little state for automated browser checks.
  (window as unknown as { floors: unknown }).floors = { conn, avatars, cam, THREE };
}

void start();
