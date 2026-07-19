import type { Action } from '../../core/input';
import type { MiniGameContext, Playable } from '../contracts';
import { drawBackdrop, drawProgress, pressedDirection } from './shared';

interface Flower { x: number; y: number; symbol: string; color: string; }
const flowers: Flower[] = [
  { x: 350, y: 220, symbol: 'Ⅰ', color: '#ff9bc9' }, { x: 640, y: 170, symbol: 'Ⅱ', color: '#ffe576' },
  { x: 930, y: 235, symbol: 'Ⅲ', color: '#8fffe0' }, { x: 390, y: 500, symbol: 'Ⅳ', color: '#b8a2ff' },
  { x: 650, y: 565, symbol: 'Ⅴ', color: '#80ddff' }, { x: 920, y: 490, symbol: 'Ⅵ', color: '#ffa67f' },
];

class PollenLink implements Playable {
  private cursor = 0;
  private sequence: number[] = [];
  private entered: number[] = [];
  private round = 1;
  private mistakes = 0;
  private showing = 3.2;
  private elapsed = 0;
  private finished = false;

  constructor(private readonly game: MiniGameContext) {
    this.newRound();
    game.announce('记住花朵亮起的编号顺序，再移动光标并按空格重现。完成三轮；编号可避免只依赖颜色。');
  }

  update(delta: number): void {
    if (this.finished) return;
    this.elapsed += delta;
    if (this.showing > 0) { this.showing -= delta; return; }
    const direction = pressedDirection(this.game.input);
    if (direction) this.moveCursor(direction);
    if (this.game.input.wasPressed('primary')) this.choose();
  }

  render(context: CanvasRenderingContext2D): void {
    drawBackdrop(context, '#18322e', '#071614', '花粉连线', '倾听花朵的记忆，用正确顺序重新连接它们');
    drawProgress(context, (this.round - 1 + this.entered.length / this.sequence.length) / 3, `第 ${this.round}/3 轮 · 失误 ${this.mistakes}`);
    const revealIndex = this.showing > 0 ? Math.floor((3.2 - this.showing) / (3.2 / this.sequence.length)) : -1;
    for (let index = 0; index < flowers.length; index += 1) {
      const flower = flowers[index]!;
      const active = this.showing > 0 && this.sequence[revealIndex] === index;
      const selected = this.entered.includes(index);
      context.save(); context.translate(flower.x, flower.y);
      context.fillStyle = active || selected ? flower.color : '#1e4a42';
      context.shadowColor = flower.color; context.shadowBlur = active ? 35 : selected ? 18 : 0;
      for (let petal = 0; petal < 6; petal += 1) { context.rotate(Math.PI / 3); context.beginPath(); context.ellipse(0, -32, 15, 29, 0, 0, Math.PI * 2); context.fill(); }
      context.fillStyle = '#fff4b8'; context.beginPath(); context.arc(0, 0, 18, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#16312d'; context.font = '700 17px system-ui'; context.textAlign = 'center'; context.fillText(flower.symbol, 0, 6);
      if (index === this.cursor && this.showing <= 0) { context.strokeStyle = '#fff'; context.lineWidth = 4; context.beginPath(); context.arc(0, 0, 62, 0, Math.PI * 2); context.stroke(); }
      context.restore();
    }
    if (this.showing > 0) {
      context.fillStyle = 'rgba(3,13,12,.72)'; context.fillRect(420, 325, 440, 75);
      context.fillStyle = '#effff8'; context.font = '700 24px system-ui'; context.textAlign = 'center'; context.fillText('观察花粉记忆…', 640, 370); context.textAlign = 'left';
    }
  }

  dispose(): void { this.sequence = []; this.entered = []; }

  private newRound(): void {
    const length = 2 + this.round;
    this.sequence = [];
    while (this.sequence.length < length) {
      const next = Math.floor(Math.random() * flowers.length);
      if (this.sequence.at(-1) !== next) this.sequence.push(next);
    }
    this.entered = [];
    this.showing = 3.2 + this.round * .35;
  }

  private moveCursor(direction: Action): void {
    const col = this.cursor % 3; const row = Math.floor(this.cursor / 3);
    if (direction === 'left') this.cursor = row * 3 + (col + 2) % 3;
    if (direction === 'right') this.cursor = row * 3 + (col + 1) % 3;
    if (direction === 'up' || direction === 'down') this.cursor = ((row + 1) % 2) * 3 + col;
    this.game.audio.play('step');
  }

  private choose(): void {
    const expected = this.sequence[this.entered.length];
    if (this.cursor === expected) {
      this.entered.push(this.cursor); this.game.audio.play('interact'); this.game.particles.emit(flowers[this.cursor]!.x, flowers[this.cursor]!.y, 12);
      if (this.entered.length === this.sequence.length) {
        if (this.round === 3) this.finish(); else { this.round += 1; this.newRound(); }
      }
    } else {
      this.mistakes += 1; this.entered = []; this.showing = 2.4; this.game.audio.play('fail');
      if (this.mistakes >= 5) this.fail();
    }
  }

  private finish(): void { this.finished = true; this.game.audio.play('success'); this.game.finish({ id: 'pollen-link', won: true, score: Math.max(300, 1800 - this.mistakes * 200), mastery: this.mistakes === 0, durationSeconds: this.elapsed }); }
  private fail(): void { this.finished = true; this.game.finish({ id: 'pollen-link', won: false, score: Math.max(0, 400 - this.mistakes * 60), mastery: false, durationSeconds: this.elapsed }); }
}

export function create(context: MiniGameContext): Playable { return new PollenLink(context); }
