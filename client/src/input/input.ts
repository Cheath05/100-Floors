// Keyboard and mouse. The mouse orbits the camera while the pointer is locked (click the game to
// lock it, Esc to release).
export class Input {
  private keys = new Set<string>();
  /** Mouse movement since the last call to takeMouse(). */
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private jumpQueued = false;
  locked = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.jumpQueued = true;
        e.preventDefault();
      }
      if (e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('mousedown', () => {
      if (!this.locked) void target.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === target;
      if (!this.locked) this.keys.clear();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    target.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** Movement axes from WASD: forward (+1 = W) and right (+1 = D). */
  moveAxes(): { forward: number; right: number } {
    const forward = (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
    const right = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    return { forward, right };
  }

  sprinting(): boolean {
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }

  /** True once per Space press (held Space doesn't bunny-hop). */
  takeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  takeMouse(): { dx: number; dy: number; wheel: number } {
    const out = { dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheel };
    this.mouseDX = this.mouseDY = this.wheel = 0;
    return out;
  }
}
