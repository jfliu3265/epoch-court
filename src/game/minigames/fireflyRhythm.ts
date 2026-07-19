import type { Action } from '../../core/input';
import type { MiniGameContext, Playable } from '../contracts';
import { drawBackdrop, drawProgress } from './shared';

const lanes: Action[] = ['left', 'up', 'down', 'right'];
const symbols: Record<string, string> = { left: '←', up: '↑', down: '↓', right: '→' };

class FireflyRhythm implements Playable {
  private notes: Action[] = [];
  private elapsed = 0;
  private noteIndex = 0;
  private hits = 0;
  private perfect = 0;
  private misses = 0;
  private finished = false;
  private readonly interval = .62;
  private readonly leadIn = 2.2;

  constructor(private readonly game: MiniGameContext) {
    for (let index = 0; index < 40; index += 1) this.notes.push(lanes[(index * 3 + Math.floor(index / 4) + 1) % lanes.length]!);
    game.announce('在萤火符号抵达光环时按对应方向。命中 65% 即可净化，90% 以上获得精通。');
  }

  update(delta: number): void {
    if (this.finished) return;
    this.elapsed += delta;
    const targetTime = this.leadIn + this.noteIndex * this.interval;
    for (const action of lanes) {
      if (!this.game.input.wasPressed(action)) continue;
      const error = Math.abs(this.elapsed - targetTime);
      if (error <= .23 && action === this.notes[this.noteIndex]) {
        this.hits += 1; if (error <= .09) this.perfect += 1;
        this.game.audio.play('interact'); this.game.particles.emit(640, 555, 10, ['#fff5a8', '#8fffe0']);
        this.noteIndex += 1;
      } else { this.misses += 1; this.game.audio.play('fail'); }
    }
    if (this.elapsed > targetTime + .3) { this.misses += 1; this.noteIndex += 1; }
    if (this.noteIndex >= this.notes.length) this.finish();
  }

  render(context: CanvasRenderingContext2D): void {
    drawBackdrop(context, '#14284a', '#07131d', '萤火节奏', '让失落的声部重新汇入森语庭院');
    drawProgress(context, this.noteIndex / this.notes.length, `命中 ${this.hits}/${this.notes.length} · 完美 ${this.perfect}`);
    const targetTime = this.leadIn + this.noteIndex * this.interval;
    const timeToTarget = targetTime - this.elapsed;
    context.strokeStyle = '#fff5a8'; context.lineWidth = 6; context.beginPath(); context.arc(640, 555, 70, 0, Math.PI * 2); context.stroke();
    for (let offset = 0; offset < 7; offset += 1) {
      const index = this.noteIndex + offset;
      if (index >= this.notes.length) break;
      const noteTime = this.leadIn + index * this.interval;
      const progress = 1 - (noteTime - this.elapsed) / 4.2;
      if (progress < -.1 || progress > 1.2) continue;
      const angle = -Math.PI / 2 + (index % 4) * Math.PI / 2;
      const radius = 70 + (1 - progress) * 440;
      const x = 640 + Math.cos(angle) * radius; const y = 555 + Math.sin(angle) * radius * .8;
      context.fillStyle = index === this.noteIndex ? '#fff5a8' : '#76d9c1'; context.shadowColor = '#fff5a8'; context.shadowBlur = 20;
      context.beginPath(); context.arc(x, y, index === this.noteIndex ? 26 : 19, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#10242f'; context.font = '700 25px system-ui'; context.textAlign = 'center'; context.fillText(symbols[this.notes[index]!] ?? '•', x, y + 9);
    }
    context.shadowBlur = 0; context.textAlign = 'center'; context.fillStyle = '#eafff8'; context.font = '700 24px system-ui';
    context.fillText(timeToTarget > .25 ? '听见光的脚步…' : symbols[this.notes[this.noteIndex] ?? ''] ?? '', 640, 680); context.textAlign = 'left';
    this.game.particles.render(context);
  }

  dispose(): void { this.notes = []; }

  private finish(): void {
    this.finished = true;
    const accuracy = this.hits / this.notes.length;
    const won = accuracy >= .65;
    this.game.audio.play(won ? 'success' : 'fail');
    this.game.finish({ id: 'firefly-rhythm', won, score: Math.floor(accuracy * 2000 + this.perfect * 12), mastery: accuracy >= .9, durationSeconds: this.elapsed });
  }
}

export function create(context: MiniGameContext): Playable { return new FireflyRhythm(context); }
