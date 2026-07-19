import type { MiniGameContext, Playable } from '../contracts';
import { drawBackdrop, drawProgress, pressedDirection } from './shared';

type Cell = 0 | 1;
interface Point { x: number; y: number; }

const GRID: Cell[][] = [
  [1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,0,1,0,0,0,1],
  [1,0,1,0,0,1,0,1,0,1],
  [1,0,0,0,0,0,0,1,0,1],
  [1,0,1,1,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1],
];

class RuinPush implements Playable {
  private player: Point = { x: 2, y: 6 };
  private crates: Point[] = [{ x: 4, y: 4 }, { x: 6, y: 5 }];
  private targets: Point[] = [{ x: 3, y: 1 }, { x: 6, y: 1 }];
  private moves = 0;
  private elapsed = 0;
  private finished = false;

  constructor(private readonly game: MiniGameContext) {
    game.announce('把两枚方构核心推到金色基座。方向键移动；E 重置。22 步内完成可获精通。');
  }

  update(delta: number): void {
    if (this.finished) return;
    this.elapsed += delta;
    if (this.game.input.wasPressed('secondary')) this.reset();
    const direction = pressedDirection(this.game.input);
    if (!direction) return;
    const deltaByDirection = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } } as const;
    const step = deltaByDirection[direction as keyof typeof deltaByDirection];
    if (!step) return;
    const next = { x: this.player.x + step.x, y: this.player.y + step.y };
    if (this.wall(next)) return;
    const crate = this.crates.find((item) => item.x === next.x && item.y === next.y);
    if (crate) {
      const beyond = { x: crate.x + step.x, y: crate.y + step.y };
      if (this.wall(beyond) || this.crates.some((item) => item.x === beyond.x && item.y === beyond.y)) return;
      crate.x = beyond.x; crate.y = beyond.y;
      this.game.audio.play('interact');
    }
    this.player = next;
    this.moves += 1;
    if (this.targets.every((target) => this.crates.some((crateItem) => crateItem.x === target.x && crateItem.y === target.y))) this.finish();
    else if (this.moves >= 70) this.fail();
  }

  render(context: CanvasRenderingContext2D): void {
    drawBackdrop(context, '#1a171f', '#080b12', '遗迹推箱', '重新排列方构核心，让失落地图重新通电');
    drawProgress(context, Math.min(1, this.moves / 70), `步数 ${this.moves}/70 · E 重置`, this.moves <= 22 ? '#ffd96a' : '#d08cff');
    const size = 68; const offsetX = 300; const offsetY = 120;
    for (let y = 0; y < GRID.length; y += 1) for (let x = 0; x < GRID[y]!.length; x += 1) {
      const px = offsetX + x * size; const py = offsetY + y * size;
      if (GRID[y]![x] === 1) {
        context.fillStyle = '#212b37'; context.fillRect(px, py, size - 3, size - 3);
        context.strokeStyle = '#3a5162'; context.strokeRect(px + 7, py + 7, size - 17, size - 17);
      } else { context.fillStyle = (x + y) % 2 ? '#111922' : '#0e151d'; context.fillRect(px, py, size - 3, size - 3); }
    }
    for (const target of this.targets) {
      const px = offsetX + target.x * size + size / 2; const py = offsetY + target.y * size + size / 2;
      context.strokeStyle = '#ffd96a'; context.lineWidth = 5; context.beginPath(); context.arc(px, py, 23, 0, Math.PI * 2); context.stroke();
      context.fillStyle = '#ffd96a'; context.font = '20px system-ui'; context.textAlign = 'center'; context.fillText('◇', px, py + 7);
    }
    for (const crate of this.crates) {
      const px = offsetX + crate.x * size + 9; const py = offsetY + crate.y * size + 9;
      context.fillStyle = '#c48cff'; context.shadowColor = '#c48cff'; context.shadowBlur = 15; context.fillRect(px, py, size - 21, size - 21);
      context.shadowBlur = 0; context.fillStyle = '#17111f'; context.font = '25px system-ui'; context.textAlign = 'center'; context.fillText('✦', px + (size - 21) / 2, py + 34);
    }
    const playerX = offsetX + this.player.x * size + size / 2; const playerY = offsetY + this.player.y * size + size / 2;
    context.fillStyle = '#eafff8'; context.beginPath(); context.arc(playerX, playerY, 19, 0, Math.PI * 2); context.fill();
    context.textAlign = 'left';
  }

  dispose(): void { this.crates = []; }

  private wall(point: Point): boolean { return GRID[point.y]?.[point.x] !== 0; }
  private reset(): void { this.player = { x: 2, y: 6 }; this.crates = [{ x: 4, y: 4 }, { x: 6, y: 5 }]; this.moves = 0; this.game.audio.play('lens'); }
  private finish(): void { this.finished = true; this.game.audio.play('success'); this.game.finish({ id: 'ruin-push', won: true, score: Math.max(200, 1500 - this.moves * 30), mastery: this.moves <= 22, durationSeconds: this.elapsed }); }
  private fail(): void { this.finished = true; this.game.audio.play('fail'); this.game.finish({ id: 'ruin-push', won: false, score: 0, mastery: false, durationSeconds: this.elapsed }); }
}

export function create(context: MiniGameContext): Playable { return new RuinPush(context); }
