// Unified keyboard + mouse + gamepad input, read once per fixed tick.

export interface InputState {
  moveX: number; // -1..1, strafe right positive
  moveY: number; // -1..1, forward positive
  lookX: number; // radians this tick
  lookY: number;
  jump: boolean; // pressed this tick
  jumpHeld: boolean;
  fire: boolean; // held
  firePressed: boolean;
  kick: boolean; // pressed this tick
  lockOn: boolean; // held
  talk: boolean; // pressed this tick
  /** Menu navigation, pressed this tick. */
  left: boolean;
  right: boolean;
  confirm: boolean;
}

const MOUSE_SENS = 0.0025;
const STICK_LOOK_SPEED = 2.8; // rad/s at full deflection
const DEADZONE = 0.18;

function deadzone(v: number) {
  if (Math.abs(v) < DEADZONE) return 0;
  return Math.sign(v) * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE));
}

export class Input {
  private keys = new Set<string>();
  // Keys pressed since the last poll, so a tap shorter than a frame still counts.
  private tapped = new Set<string>();
  private mouseButtons = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private prev = { jump: false, fire: false, kick: false, talk: false, left: false, right: false, confirm: false };
  pointerLocked = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      this.tapped.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) {
        canvas.requestPointerLock();
        return;
      }
      this.mouseButtons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) this.mouseButtons.clear();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  private gamepad(): Gamepad | null {
    for (const pad of navigator.getGamepads?.() ?? []) if (pad?.connected) return pad;
    return null;
  }

  get gamepadConnected() {
    return this.gamepad() !== null;
  }

  poll(dt: number): InputState {
    const k = (c: string) => this.keys.has(c) || this.tapped.has(c);
    let moveX = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    let moveY = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    let lookX = this.mouseDX * MOUSE_SENS;
    let lookY = this.mouseDY * MOUSE_SENS;
    this.mouseDX = this.mouseDY = 0;

    let jump = k('Space');
    let fire = this.mouseButtons.has(0);
    let kick = k('KeyE');
    let lockOn = this.mouseButtons.has(2) || k('ShiftLeft');
    let talk = k('KeyF');
    let left = k('ArrowLeft') || k('KeyA');
    let right = k('ArrowRight') || k('KeyD');
    let confirm = k('Enter') || k('Space');

    const pad = this.gamepad();
    if (pad) {
      const b = (i: number) => pad.buttons[i]?.pressed ?? false;
      const sx = deadzone(pad.axes[0] ?? 0);
      const sy = deadzone(pad.axes[1] ?? 0);
      if (sx || sy) {
        moveX = sx;
        moveY = -sy;
      }
      lookX += deadzone(pad.axes[2] ?? 0) * STICK_LOOK_SPEED * dt;
      lookY += deadzone(pad.axes[3] ?? 0) * STICK_LOOK_SPEED * dt;
      // Standard mapping: 0 A, 1 B, 2 X, 6 LT, 7 RT.
      jump ||= b(0);
      kick ||= b(1);
      fire ||= b(2) || b(7);
      lockOn ||= b(6) || b(4);
      talk ||= b(3);
      confirm ||= b(0) || b(9);
      left ||= b(14) || (pad.axes[0] ?? 0) < -0.5;
      right ||= b(15) || (pad.axes[0] ?? 0) > 0.5;
    }

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    const state: InputState = {
      moveX,
      moveY,
      lookX,
      lookY,
      jump: jump && !this.prev.jump,
      jumpHeld: jump,
      fire,
      firePressed: fire && !this.prev.fire,
      kick: kick && !this.prev.kick,
      lockOn,
      talk: talk && !this.prev.talk,
      left: left && !this.prev.left,
      right: right && !this.prev.right,
      confirm: confirm && !this.prev.confirm,
    };
    this.prev = { jump, fire, kick, talk, left, right, confirm };
    this.tapped.clear();
    return state;
  }
}
