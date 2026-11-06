// Temporary step-1 UI: a start panel (name, look, area), a click-to-play hint and a debug readout.
// The real SAO-style HUD and character creator arrive in step 3.
import { STARTER_MODELS, type JoinOptions } from '@floors/shared';

export interface StartChoice extends JoinOptions {
  room: string;
}

const AREAS: [string, string][] = [
  ['town', 'Town plaza (safe zone)'],
  ['field', 'Grassland field'],
  ['boss', 'Boss room arena'],
];

export function showStartPanel(root: HTMLElement): Promise<StartChoice> {
  const saved = JSON.parse(localStorage.getItem('floors.start') ?? '{}') as Partial<StartChoice>;
  const params = new URL(location.href).searchParams;
  const panel = document.createElement('div');
  panel.className = 'start-panel';
  panel.innerHTML = `
    <div class="start-card">
      <h1>100 Floors</h1>
      <p class="sub">Step 1 test build: movement, camera and multiplayer sync</p>
      <label>Name <input id="sp-name" maxlength="16" autocomplete="off" /></label>
      <label>Look <select id="sp-model">${STARTER_MODELS.map((m, i) => `<option value="${i}">${m.replace('_', ' ')}</option>`).join('')}</select></label>
      <label>Area <select id="sp-room">${AREAS.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label>
      <button id="sp-go">Link Start</button>
      <p class="hint">WASD move · mouse look · Space jump · Shift sprint · wheel zoom · Esc frees the mouse</p>
    </div>`;
  root.appendChild(panel);
  const name = panel.querySelector<HTMLInputElement>('#sp-name')!;
  const model = panel.querySelector<HTMLSelectElement>('#sp-model')!;
  const room = panel.querySelector<HTMLSelectElement>('#sp-room')!;
  name.value = params.get('name') ?? saved.name ?? '';
  model.value = String(saved.model ?? 0);
  room.value = params.get('room') ?? saved.room ?? 'town';
  name.focus();
  return new Promise((resolve) => {
    const go = () => {
      const choice: StartChoice = { name: name.value.trim(), model: Number(model.value), room: room.value };
      localStorage.setItem('floors.start', JSON.stringify(choice));
      panel.remove();
      resolve(choice);
    };
    panel.querySelector('#sp-go')!.addEventListener('click', go);
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
    if (params.has('auto')) go();
  });
}

export class DebugHud {
  private el: HTMLDivElement;
  private hint: HTMLDivElement;
  private frames = 0;
  private fps = 0;
  private lastFpsAt = performance.now();

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug-hud';
    root.appendChild(this.el);
    this.hint = document.createElement('div');
    this.hint.className = 'click-hint';
    this.hint.textContent = 'Click to control your character';
    root.appendChild(this.hint);
  }

  frame(info: { area: string; players: number; ping: number; correction: number; pending: number; locked: boolean; safe: boolean }): void {
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsAt >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsAt));
      this.frames = 0;
      this.lastFpsAt = now;
      this.el.innerHTML = [
        `<b>${info.area}</b>${info.safe ? ' <span class="safe">Inner Area</span>' : ' <span class="outer">Outer Field</span>'}`,
        `players ${info.players} · ping ${Math.round(info.ping)} ms · ${this.fps} fps`,
        `prediction fix ${(info.correction * 100).toFixed(1)} cm · inputs in flight ${info.pending}`,
      ].join('<br>');
    }
    this.hint.style.display = info.locked ? 'none' : 'block';
  }

  showError(message: string): void {
    const box = document.createElement('div');
    box.className = 'error-box';
    box.textContent = message;
    this.el.parentElement?.appendChild(box);
  }
}
