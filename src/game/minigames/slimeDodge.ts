import type { Vec2 } from '../../core/types';
import type { MiniGameContext, Playable } from '../contracts';
import { clamp, drawBackdrop, drawProgress } from './shared';

interface Slime extends Vec2 { vx: number; vy: number; radius: number; hue: number; }
interface Shard extends Vec2 { active: boolean; phase: number; }

class SlimeDodge implements Playable {
  private player = { x: 640, y: 380, radius: 15 };
  private slimes: Slime[] = [];
  private shards: Shard[] = [];
  private collected = 0;
  private hits = 0;
  private elapsed = 0;
  private invulnerable = 0;
  private spawnTimer = 0;
  private finished = false;

  constructor(private readonly game: MiniGameContext) {
    this.spawnSlime();
    this.spawnSlime();
    for (let index = 0; index < 9; index += 1) this.shards.push(this.newShard(index));
    game.announce('收集 7 枚源律碎片。方向键或 WASD 移动，Shift 冲刺；被撞三次会失败。');
  }

  update(delta: number): void {
    if (this.finished) return;
    this.elapsed += delta;
    this.invulnerable = Math.max(0, this.invulnerable - delta);
    const axis = this.game.input.axis();
    const speed = this.game.input.isDown('dash') ? 350 : 230;
    this.player.x = clamp(this.player.x + axis.x * speed * delta, 45, 1235);
    this.player.y = clamp(this.player.y + axis.y * speed * delta, 125, 675);
    this.spawnTimer += delta;
    if (this.spawnTimer > 5 && this.slimes.length < 7) {
      this.spawnTimer = 0;
      this.spawnSlime();
    }
    for (const slime of this.slimes) {
      const dx = this.player.x - slime.x;
      const dy = this.player.y - slime.y;
      const length = Math.hypot(dx, dy) || 1;
      slime.vx += (dx / length) * 26 * delta;
      slime.vy += (dy / length) * 26 * delta;
      const maxSpeed = 80 + this.elapsed * 1.25;
      const speedNow = Math.hypot(slime.vx, slime.vy) || 1;
      if (speedNow > maxSpeed) { slime.vx = slime.vx / speedNow * maxSpeed; slime.vy = slime.vy / speedNow * maxSpeed; }
      slime.x += slime.vx * delta;
      slime.y += slime.vy * delta;
      if (slime.x < slime.radius || slime.x > 1280 - slime.radius) slime.vx *= -1;
      if (slime.y < 112 + slime.radius || slime.y > 720 - slime.radius) slime.vy *= -1;
      if (this.invulnerable <= 0 && Math.hypot(dx, dy) < slime.radius + this.player.radius) {
        this.hits += 1;
        this.invulnerable = 1.25;
        this.game.audio.play('fail');
        this.game.particles.emit(this.player.x, this.player.y, 15, ['#ff5f7e', '#ffffff']);
        if (this.hits >= 3) this.finish(false);
      }
    }
    for (const shard of this.shards) {
      shard.phase += delta * 4;
      if (shard.active && Math.hypot(this.player.x - shard.x, this.player.y - shard.y) < 30) {
        shard.active = false;
        this.collected += 1;
        this.game.audio.play('interact');
        this.game.particles.emit(shard.x, shard.y, 18);
        if (this.collected >= 7) this.finish(true);
      }
    }
    if (this.elapsed >= 75) this.finish(this.collected >= 5);
  }

  render(context: CanvasRenderingContext2D): void {
    drawBackdrop(context, '#111a25', '#071117', '史莱姆闪避场', '让失控的守护软泥追逐你，同时收集源律碎片');
    drawProgress(context, this.collected / 7, `碎片 ${this.collected}/7 · 受击 ${this.hits}/3`);
    context.strokeStyle = 'rgba(101,242,194,.18)';
    context.lineWidth = 1;
    for (let x = 0; x < 1280; x += 64) { context.beginPath(); context.moveTo(x, 110); context.lineTo(x, 720); context.stroke(); }
    for (let y = 110; y < 720; y += 64) { context.beginPath(); context.moveTo(0, y); context.lineTo(1280, y); context.stroke(); }
    for (const shard of this.shards) {
      if (!shard.active) continue;
      const pulse = 9 + Math.sin(shard.phase) * 3;
      context.save(); context.translate(shard.x, shard.y); context.rotate(shard.phase * .15);
      context.fillStyle = '#8fffe0'; context.shadowColor = '#8fffe0'; context.shadowBlur = 18;
      context.beginPath(); context.moveTo(0, -pulse); context.lineTo(pulse * .7, 0); context.lineTo(0, pulse); context.lineTo(-pulse * .7, 0); context.closePath(); context.fill(); context.restore();
    }
    for (const slime of this.slimes) {
      context.fillStyle = `hsl(${slime.hue} 66% 47%)`;
      context.strokeStyle = '#ffd7ef'; context.lineWidth = 3;
      context.beginPath(); context.arc(slime.x, slime.y, slime.radius, 0, Math.PI * 2); context.fill(); context.stroke();
      context.fillStyle = '#061017'; context.fillRect(slime.x - 9, slime.y - 4, 5, 6); context.fillRect(slime.x + 4, slime.y - 4, 5, 6);
    }
    context.globalAlpha = this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 ? .25 : 1;
    context.fillStyle = '#f8fff9'; context.shadowColor = '#65f2c2'; context.shadowBlur = 22;
    context.beginPath(); context.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2); context.fill();
    context.shadowBlur = 0; context.globalAlpha = 1;
    this.game.particles.render(context);
  }

  dispose(): void { this.slimes = []; this.shards = []; }

  private finish(won: boolean): void {
    this.finished = true;
    this.game.audio.play(won ? 'success' : 'fail');
    this.game.finish({ id: 'slime-dodge', won, score: this.collected * 100 + Math.max(0, 300 - this.hits * 100), mastery: won && this.hits === 0, durationSeconds: this.elapsed });
  }

  private spawnSlime(): void {
    const edge = Math.floor(Math.random() * 4);
    const positions = [{ x: 30, y: 150 + Math.random() * 520 }, { x: 1250, y: 150 + Math.random() * 520 }, { x: 100 + Math.random() * 1080, y: 130 }, { x: 100 + Math.random() * 1080, y: 690 }];
    const position = positions[edge] ?? positions[0]!;
    this.slimes.push({ ...position, vx: (Math.random() - .5) * 70, vy: (Math.random() - .5) * 70, radius: 22 + Math.random() * 10, hue: 305 + Math.random() * 35 });
  }

  private newShard(index: number): Shard {
    return { x: 145 + (index % 3) * 485 + Math.random() * 80, y: 180 + Math.floor(index / 3) * 205 + Math.random() * 55, active: true, phase: index };
  }
}

export function create(context: MiniGameContext): Playable { return new SlimeDodge(context); }
