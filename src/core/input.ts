import type { InputSource } from './types';

export type Action = 'up' | 'down' | 'left' | 'right' | 'primary' | 'secondary' | 'dash' | 'lens' | 'pause';

const keyMap: Record<string, Action> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'primary', Enter: 'primary', KeyE: 'secondary', ShiftLeft: 'dash', ShiftRight: 'dash', KeyQ: 'lens', Escape: 'pause',
};

export class InputManager {
  private held = new Set<Action>();
  private pressed = new Set<Action>();
  private touchHeld = new Set<Action>();
  private gamepadPrevious = new Set<Action>();
  source: InputSource = 'keyboard';

  constructor(private readonly onSourceChange: (source: InputSource) => void = () => undefined) {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clear);
    this.clear();
  }

  setTouch(action: Action, down: boolean): void {
    this.setSource('touch');
    if (down) {
      if (!this.touchHeld.has(action)) this.pressed.add(action);
      this.touchHeld.add(action);
      this.held.add(action);
    } else {
      this.touchHeld.delete(action);
      this.held.delete(action);
    }
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action);
  }

  axis(): { x: number; y: number } {
    let x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    let y = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find(Boolean);
    if (!pad) return;
    const current = new Set<Action>();
    if ((pad.axes[1] ?? 0) < -0.35 || pad.buttons[12]?.pressed) current.add('up');
    if ((pad.axes[1] ?? 0) > 0.35 || pad.buttons[13]?.pressed) current.add('down');
    if ((pad.axes[0] ?? 0) < -0.35 || pad.buttons[14]?.pressed) current.add('left');
    if ((pad.axes[0] ?? 0) > 0.35 || pad.buttons[15]?.pressed) current.add('right');
    if (pad.buttons[0]?.pressed) current.add('primary');
    if (pad.buttons[2]?.pressed) current.add('secondary');
    if (pad.buttons[1]?.pressed) current.add('dash');
    if (pad.buttons[4]?.pressed) current.add('lens');
    if (pad.buttons[9]?.pressed) current.add('pause');
    for (const action of current) {
      if (!this.gamepadPrevious.has(action)) this.pressed.add(action);
      this.held.add(action);
    }
    for (const action of this.gamepadPrevious) if (!current.has(action) && !this.touchHeld.has(action)) this.held.delete(action);
    if (current.size > 0) this.setSource('gamepad');
    this.gamepadPrevious = current;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  private setSource(source: InputSource): void {
    if (source === this.source) return;
    this.source = source;
    this.onSourceChange(source);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const action = keyMap[event.code];
    if (!action) return;
    event.preventDefault();
    this.setSource('keyboard');
    if (!this.held.has(action)) this.pressed.add(action);
    this.held.add(action);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    const action = keyMap[event.code];
    if (action && !this.touchHeld.has(action)) this.held.delete(action);
  };

  private clear = (): void => {
    this.held.clear();
    this.pressed.clear();
    this.touchHeld.clear();
    this.gamepadPrevious.clear();
  };
}
