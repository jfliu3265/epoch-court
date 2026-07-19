import type { InputManager, Action } from '../../core/input';

export function drawBackdrop(context: CanvasRenderingContext2D, top: string, bottom: string, title: string, subtitle: string): void {
  const gradient = context.createLinearGradient(0, 0, 0, 720);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1280, 720);
  context.fillStyle = 'rgba(2, 8, 16, .68)';
  context.fillRect(24, 22, 1232, 76);
  context.fillStyle = '#f6fff9';
  context.font = '700 28px system-ui';
  context.fillText(title, 48, 57);
  context.fillStyle = '#a9cfc6';
  context.font = '16px system-ui';
  context.fillText(subtitle, 48, 82);
}

export function drawProgress(context: CanvasRenderingContext2D, value: number, label: string, color = '#65f2c2'): void {
  context.fillStyle = 'rgba(255,255,255,.12)';
  context.fillRect(930, 48, 280, 16);
  context.fillStyle = color;
  context.fillRect(930, 48, 280 * Math.max(0, Math.min(1, value)), 16);
  context.fillStyle = '#eafff8';
  context.font = '13px system-ui';
  context.textAlign = 'right';
  context.fillText(label, 1210, 84);
  context.textAlign = 'left';
}

export function pressedDirection(input: InputManager): Action | null {
  for (const action of ['up', 'right', 'down', 'left'] as Action[]) if (input.wasPressed(action)) return action;
  return null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
