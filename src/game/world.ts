import type { AudioEngine } from '../core/audio';
import type { InputManager } from '../core/input';
import { addFlag, canEnterGarden, canFinishSlice, hasFlag } from '../core/state';
import type { GameState, MiniGameId, SceneId, Vec2 } from '../core/types';
import type { Playable } from './contracts';

interface WorldServices {
  getState(): GameState;
  setState(state: GameState, reason: string): void;
  launchMiniGame(id: MiniGameId): void;
  transition(scene: SceneId, x: number, y: number): void;
  announce(text: string, speaker?: string): void;
  setPrompt(text: string | null): void;
  evolve(message: string, x?: number, y?: number): void;
  openCourtBuild(): void;
  audio: AudioEngine;
  input: InputManager;
}

interface Interaction {
  x: number; y: number; radius: number; label: string; action(): void; available?: () => boolean;
}

interface Wisp { x: number; y: number; vx: number; vy: number; life: number; }

export class WorldScene implements Playable {
  private position: Vec2;
  private interactions: Interaction[] = [];
  private wisps: Wisp[] = [];
  private elapsed = 0;
  private nearby: Interaction | null = null;
  private dashCooldown = 0;
  private pulse = 0;
  private lastStep = 0;

  constructor(private readonly scene: SceneId, private readonly services: WorldServices) {
    this.position = { ...services.getState().position };
    this.configure();
    if (scene === 'wasteland' && hasFlag(services.getState(), 'color-awakened')) {
      this.wisps = [{ x: 770, y: 300, vx: 35, vy: 22, life: 2 }, { x: 920, y: 520, vx: -28, vy: 31, life: 2 }];
    }
  }

  update(delta: number): void {
    this.elapsed += delta; this.dashCooldown = Math.max(0, this.dashCooldown - delta); this.pulse = Math.max(0, this.pulse - delta);
    const input = this.services.input;
    const axis = input.axis();
    let speed = this.scene === 'awakening' ? 150 : 205;
    if (input.isDown('dash') && this.dashCooldown <= 0) { speed = 425; this.dashCooldown = .7; this.services.audio.play('step'); }
    this.position.x = clamp(this.position.x + axis.x * speed * delta, 42, 1238);
    this.position.y = clamp(this.position.y + axis.y * speed * delta, 132, 672);
    if ((axis.x || axis.y) && this.elapsed - this.lastStep > .42) { this.lastStep = this.elapsed; this.services.audio.play('step'); }
    if (input.wasPressed('lens') && this.services.getState().unlockedLenses.length > 1) this.toggleLens();
    if (input.wasPressed('secondary') && this.scene === 'wasteland') this.castPulse();

    this.nearby = this.interactions.filter((item) => item.available?.() ?? true).sort((a, b) => distance(this.position, a) - distance(this.position, b))[0] ?? null;
    if (this.nearby && distance(this.position, this.nearby) <= this.nearby.radius) {
      this.services.setPrompt(`空格 / 行动：${this.nearby.label}`);
      if (input.wasPressed('primary')) this.nearby.action();
    } else { this.services.setPrompt(null); }
    this.updateWisps(delta);
  }

  render(context: CanvasRenderingContext2D): void {
    const state = this.services.getState();
    const watercolor = state.activeLens === 'watercolor';
    if (this.scene === 'awakening') this.renderAwakening(context);
    if (this.scene === 'court') this.renderCourt(context, state);
    if (this.scene === 'wasteland') this.renderWasteland(context, state, watercolor);
    if (this.scene === 'garden') this.renderGarden(context, state, watercolor);
    if (this.scene === 'ending') this.renderEnding(context);
    this.renderInteractions(context);
    this.renderWisps(context);
    this.renderPlayer(context, state);
    if (this.pulse > 0) { context.strokeStyle = `rgba(143,255,224,${this.pulse * 1.8})`; context.lineWidth = 8; context.beginPath(); context.arc(this.position.x, this.position.y, (1 - this.pulse) * 150, 0, Math.PI * 2); context.stroke(); }
  }

  dispose(): void { this.services.setPrompt(null); this.interactions = []; this.wisps = []; }

  private configure(): void {
    const s = this.services;
    if (this.scene === 'awakening') {
      this.interactions.push({ x: 1030, y: 350, radius: 78, label: '触碰无声光点', action: () => { s.announce('这里曾有颜色，也曾有歌声。先证明你能在噪蚀中守住这些碎片。', '弥光'); s.launchMiniGame('slime-dodge'); } });
    }
    if (this.scene === 'court') {
      this.interactions.push(
        { x: 280, y: 360, radius: 76, label: '进入原初荒原', action: () => s.transition('wasteland', 1080, 410) },
        { x: 1000, y: 360, radius: 76, label: canEnterGarden(s.getState()) ? '进入森语庭院' : '查看沉睡界门', action: () => canEnterGarden(s.getState()) ? s.transition('garden', 190, 430) : s.announce('这座界门缺少地图坐标。原初荒原的方构遗迹保存着坐标核心。', '弥光') },
        { x: 640, y: 485, radius: 85, label: '修复王庭设施', action: () => s.openCourtBuild(), available: () => hasFlag(s.getState(), 'court-open') },
        { x: 640, y: 250, radius: 90, label: canFinishSlice(s.getState()) ? '重启纪元之心' : '倾听纪元之心', action: () => canFinishSlice(s.getState()) ? s.transition('ending', 640, 520) : s.announce(this.heartHint(), '纪元之心') },
      );
    }
    if (this.scene === 'wasteland') {
      this.interactions.push(
        { x: 1130, y: 420, radius: 70, label: '返回纪元王庭', action: () => s.transition('court', 330, 405) },
        { x: 290, y: 315, radius: 78, label: s.getState().miniGames['slime-dodge'].completed ? '重试史莱姆闪避场' : '净化软泥祭坛', action: () => s.launchMiniGame('slime-dodge') },
        { x: 720, y: 510, radius: 82, label: s.getState().miniGames['ruin-push'].completed ? '重试遗迹推箱' : '进入方构遗迹', action: () => s.launchMiniGame('ruin-push'), available: () => hasFlag(s.getState(), 'color-awakened') },
        { x: 165, y: 580, radius: 75, label: '读取水彩隐藏源泉', available: () => s.getState().activeLens === 'watercolor' && !hasFlag(s.getState(), 'wasteland-watercolor-cache'), action: () => {
          let next = addFlag(s.getState(), 'wasteland-watercolor-cache'); next.resources.lightDust += 180; next.resources.realmMaterial += 2; next.saveRevision += 1;
          s.setState(next, '发现旧区域隐藏源泉'); s.evolve('水彩透镜让干涸河床显出真正的源泉。重访闭环已经完成。', .13, .8);
        } },
      );
    }
    if (this.scene === 'garden') {
      this.interactions.push(
        { x: 120, y: 430, radius: 70, label: '返回纪元王庭', action: () => s.transition('court', 950, 405) },
        { x: 520, y: 300, radius: 82, label: s.getState().miniGames['pollen-link'].completed ? '重试花粉连线' : '唤醒花粉记忆', action: () => s.launchMiniGame('pollen-link') },
        { x: 970, y: 450, radius: 82, label: s.getState().miniGames['firefly-rhythm'].completed ? '重试萤火节奏' : '召回庭院旋律', action: () => s.launchMiniGame('firefly-rhythm'), available: () => hasFlag(s.getState(), 'watercolor-awakened') },
      );
    }
    if (this.scene === 'ending') this.interactions.push({ x: 640, y: 260, radius: 95, label: '聆听下一纪元', action: () => s.announce('蒸汽峡湾的齿轮已经在界海深处转动。纵向切片至此完成，但王庭的帝国才刚刚开始。', '弥光') });
  }

  private toggleLens(): void {
    const state = structuredClone(this.services.getState());
    state.activeLens = state.activeLens === 'pixel' ? 'watercolor' : 'pixel'; state.saveRevision += 1; state.updatedAt = Date.now();
    this.services.setState(state, '切换时代透镜'); this.services.audio.play('lens');
    this.services.announce(state.activeLens === 'watercolor' ? '水彩层展开：植物、情绪痕迹与隐藏水路显形。' : '像素层展开：网格、方构机关与旧通道显形。', '时代透镜');
  }

  private castPulse(): void {
    if (this.pulse > 0) return; this.pulse = .55; this.services.audio.play('lens');
    for (const wisp of this.wisps) if (distance(this.position, wisp) < 145) wisp.life -= 1;
    this.wisps = this.wisps.filter((wisp) => wisp.life > 0);
  }

  private updateWisps(delta: number): void {
    for (const wisp of this.wisps) {
      const dx = this.position.x - wisp.x; const dy = this.position.y - wisp.y; const length = Math.hypot(dx, dy) || 1;
      wisp.vx += dx / length * 12 * delta; wisp.vy += dy / length * 12 * delta; wisp.x += wisp.vx * delta; wisp.y += wisp.vy * delta;
      if (distance(this.position, wisp) < 34) { this.position.x -= dx / length * 45; this.position.y -= dy / length * 45; }
    }
  }

  private renderAwakening(c: CanvasRenderingContext2D): void {
    c.fillStyle = '#050708'; c.fillRect(0, 0, 1280, 720);
    c.strokeStyle = '#323738'; c.lineWidth = 2; for (let x = 0; x < 1280; x += 48) { c.beginPath(); c.moveTo(x, 110); c.lineTo(x, 720); c.stroke(); }
    for (let y = 110; y < 720; y += 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(1280, y); c.stroke(); }
    c.fillStyle = '#101516'; for (let i = 0; i < 14; i += 1) c.fillRect(80 + i * 90, 250 + Math.sin(i) * 110, 45, 45);
    c.fillStyle = '#f7fff9'; c.shadowColor = '#fff'; c.shadowBlur = 22 + Math.sin(this.elapsed * 3) * 10; c.beginPath(); c.arc(1030, 350, 17, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    this.drawSceneTitle(c, '无声残片', '移动到唯一的光点。世界还没有颜色，也没有音乐。');
  }

  private renderCourt(c: CanvasRenderingContext2D, state: GameState): void {
    const gradient = c.createLinearGradient(0, 0, 0, 720); gradient.addColorStop(0, '#102b3a'); gradient.addColorStop(.55, '#0b1825'); gradient.addColorStop(1, '#050b12'); c.fillStyle = gradient; c.fillRect(0, 0, 1280, 720);
    this.drawStars(c, 65, '#92ddff');
    c.fillStyle = '#162b36'; c.beginPath(); c.ellipse(640, 660, 620, 140, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#315265'; c.lineWidth = 5; c.beginPath(); c.arc(640, 360, 240, Math.PI, Math.PI * 2); c.stroke();
    this.drawPortal(c, 280, 360, '#e0b35d', '原初'); this.drawPortal(c, 1000, 360, canEnterGarden(state) ? '#70e5ba' : '#314952', '森语');
    const levelColors = ['#27343a', '#ffd96a', '#8fffe0', '#d7a4ff'];
    c.fillStyle = levelColors[state.courtLevel] ?? '#fff'; c.shadowColor = c.fillStyle; c.shadowBlur = 26; c.beginPath(); c.moveTo(640, 180); c.lineTo(690, 260); c.lineTo(640, 325); c.lineTo(590, 260); c.closePath(); c.fill(); c.shadowBlur = 0;
    c.fillStyle = '#223844'; c.fillRect(510, 465, 260, 130); c.strokeStyle = state.storyFlags.includes('court-archive-built') ? '#ffd96a' : '#53707b'; c.lineWidth = 4; c.strokeRect(525, 480, 230, 100);
    if (state.storyFlags.includes('court-archive-built')) { c.fillStyle = '#ffd96a'; c.font = '42px system-ui'; c.textAlign = 'center'; c.fillText('⌁', 640, 545); c.textAlign = 'left'; }
    this.drawSceneTitle(c, '纪元王庭', `繁荣度 ${state.courtLevel}/3 · 这里记录每一次净化带来的永久改变`);
  }

  private renderWasteland(c: CanvasRenderingContext2D, state: GameState, watercolor: boolean): void {
    const awakened = hasFlag(state, 'color-awakened');
    const top = !awakened ? '#17191a' : watercolor ? '#5a8ca0' : '#874d38'; const bottom = !awakened ? '#080a0a' : watercolor ? '#bfd1a1' : '#d49d58';
    const gradient = c.createLinearGradient(0, 0, 0, 720); gradient.addColorStop(0, top); gradient.addColorStop(1, bottom); c.fillStyle = gradient; c.fillRect(0, 0, 1280, 720);
    c.fillStyle = awakened ? watercolor ? 'rgba(232,247,187,.55)' : '#372a27' : '#222'; for (let i = 0; i < 22; i += 1) { const x = i * 73 - 30; const h = 70 + (i * 37 % 150); c.fillRect(x, 720 - h, 52, h); }
    if (awakened) { c.fillStyle = watercolor ? 'rgba(97,173,151,.55)' : '#80654e'; c.beginPath(); c.moveTo(0, 580); c.quadraticCurveTo(330, 510, 620, 610); c.quadraticCurveTo(950, 690, 1280, 540); c.lineTo(1280, 720); c.lineTo(0, 720); c.fill(); }
    if (watercolor) { c.strokeStyle = 'rgba(91,210,205,.75)'; c.lineWidth = 28; c.beginPath(); c.moveTo(0, 650); c.bezierCurveTo(220, 490, 360, 710, 610, 620); c.bezierCurveTo(850, 530, 980, 650, 1280, 540); c.stroke(); }
    this.drawShrine(c, 290, 315, state.miniGames['slime-dodge'].completed ? '#8fffe0' : '#a74b88');
    this.drawRuin(c, 720, 510, state.miniGames['ruin-push'].completed ? '#ffd96a' : '#8d68ae');
    this.drawPortal(c, 1130, 420, '#e0b35d', '王庭');
    this.drawSceneTitle(c, '原初荒原', watercolor ? '水彩层：干涸河床正在显露隐藏的源泉' : '像素层：方构遗迹与旧网格清晰可见 · E 发出净化脉冲');
  }

  private renderGarden(c: CanvasRenderingContext2D, state: GameState, watercolor: boolean): void {
    const gradient = c.createLinearGradient(0, 0, 0, 720); gradient.addColorStop(0, watercolor ? '#7399a7' : '#193e3c'); gradient.addColorStop(1, watercolor ? '#e9c798' : '#0a1919'); c.fillStyle = gradient; c.fillRect(0, 0, 1280, 720);
    c.fillStyle = watercolor ? 'rgba(232,248,194,.7)' : '#183f31'; c.beginPath(); c.moveTo(0, 650); for (let x = 0; x <= 1280; x += 80) c.lineTo(x, 610 - Math.sin(x * .018) * 75); c.lineTo(1280, 720); c.lineTo(0, 720); c.fill();
    for (let index = 0; index < 24; index += 1) { const x = 50 + index * 53; const y = 570 + Math.sin(index * 1.7) * 55; c.fillStyle = ['#ff9bc9','#ffe576','#8fffe0','#b8a2ff'][index % 4]!; c.beginPath(); c.arc(x, y, 8 + (index % 3) * 3, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = watercolor ? 'rgba(255,246,183,.72)' : '#2d735e'; c.lineWidth = watercolor ? 18 : 9; for (let index = 0; index < 6; index += 1) { c.beginPath(); c.moveTo(index * 230, 720); c.bezierCurveTo(index * 210 + 80, 480, index * 235 - 30, 250, index * 200 + 120, 100); c.stroke(); }
    this.drawShrine(c, 520, 300, state.miniGames['pollen-link'].completed ? '#8fffe0' : '#ff9bc9');
    this.drawShrine(c, 970, 450, state.miniGames['firefly-rhythm'].completed ? '#fff5a8' : '#4d8f7d');
    this.drawPortal(c, 120, 430, '#e0b35d', '王庭');
    this.drawSceneTitle(c, '森语庭院', watercolor ? '水彩层：植物的情绪痕迹构成可见道路' : '像素层：花粉节点与节拍网格正在等待连接');
  }

  private renderEnding(c: CanvasRenderingContext2D): void {
    const gradient = c.createRadialGradient(640, 330, 20, 640, 360, 700); gradient.addColorStop(0, '#fff6b9'); gradient.addColorStop(.12, '#66e7c0'); gradient.addColorStop(.45, '#263e63'); gradient.addColorStop(1, '#050812'); c.fillStyle = gradient; c.fillRect(0, 0, 1280, 720);
    this.drawStars(c, 120, '#ffffff'); c.fillStyle = '#0d1c28'; c.beginPath(); c.ellipse(640, 700, 550, 170, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.shadowColor = '#8fffe0'; c.shadowBlur = 55; c.beginPath(); c.moveTo(640, 140); c.lineTo(735, 285); c.lineTo(640, 420); c.lineTo(545, 285); c.closePath(); c.fill(); c.shadowBlur = 0;
    this.drawSceneTitle(c, '第一纪元：苏醒', '四种仪式已经相连。原初荒原、森语庭院与王庭开始共享同一颗心。');
  }

  private renderInteractions(c: CanvasRenderingContext2D): void {
    for (const item of this.interactions) {
      if (!(item.available?.() ?? true)) continue;
      const near = distance(this.position, item) <= item.radius;
      c.strokeStyle = near ? '#ffffff' : 'rgba(143,255,224,.35)'; c.lineWidth = near ? 4 : 2;
      c.beginPath(); c.arc(item.x, item.y, 31 + Math.sin(this.elapsed * 3) * 3, 0, Math.PI * 2); c.stroke();
      if (near) { c.fillStyle = 'rgba(4,13,18,.82)'; c.fillRect(item.x - 92, item.y - 64, 184, 30); c.fillStyle = '#eafff8'; c.font = '14px system-ui'; c.textAlign = 'center'; c.fillText(item.label, item.x, item.y - 43); c.textAlign = 'left'; }
    }
  }

  private renderWisps(c: CanvasRenderingContext2D): void { for (const wisp of this.wisps) { c.fillStyle = '#ad5cff'; c.shadowColor = '#ad5cff'; c.shadowBlur = 18; c.beginPath(); c.arc(wisp.x, wisp.y, 14 + Math.sin(this.elapsed * 6) * 3, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; c.strokeStyle = '#ffb6fc'; c.beginPath(); c.arc(wisp.x, wisp.y, 25, 0, Math.PI * 2); c.stroke(); } }

  private renderPlayer(c: CanvasRenderingContext2D, state: GameState): void {
    c.save(); c.translate(this.position.x, this.position.y);
    const color = state.activeLens === 'watercolor' ? '#ffe9a8' : '#eafff8'; c.fillStyle = color; c.shadowColor = state.activeLens === 'watercolor' ? '#ff9bc9' : '#8fffe0'; c.shadowBlur = 18;
    c.beginPath(); c.arc(0, -12, 12, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(-18, 2); c.lineTo(0, -3); c.lineTo(18, 2); c.lineTo(12, 34); c.lineTo(-12, 34); c.closePath(); c.fill(); c.shadowBlur = 0;
    c.fillStyle = '#102027'; c.fillRect(-7, -15, 4, 5); c.fillRect(3, -15, 4, 5); c.restore();
  }

  private drawSceneTitle(c: CanvasRenderingContext2D, title: string, subtitle: string): void { c.fillStyle = 'rgba(3,9,14,.72)'; c.fillRect(22, 18, 820, 76); c.fillStyle = '#f4fff9'; c.font = '700 27px system-ui'; c.fillText(title, 45, 52); c.fillStyle = '#b4d5ce'; c.font = '15px system-ui'; c.fillText(subtitle, 45, 79); }
  private drawPortal(c: CanvasRenderingContext2D, x: number, y: number, color: string, label: string): void { c.save(); c.translate(x, y); c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = 24; c.lineWidth = 10; c.beginPath(); c.ellipse(0, 0, 48, 90, 0, 0, Math.PI * 2); c.stroke(); c.fillStyle = `${color}22`; c.fill(); c.shadowBlur = 0; c.fillStyle = '#eafff8'; c.font = '15px system-ui'; c.textAlign = 'center'; c.fillText(label, 0, 8); c.restore(); }
  private drawShrine(c: CanvasRenderingContext2D, x: number, y: number, color: string): void { c.fillStyle = '#19252b'; c.fillRect(x - 55, y + 18, 110, 38); c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 22; c.beginPath(); c.moveTo(x, y - 45); c.lineTo(x + 35, y); c.lineTo(x, y + 25); c.lineTo(x - 35, y); c.closePath(); c.fill(); c.shadowBlur = 0; }
  private drawRuin(c: CanvasRenderingContext2D, x: number, y: number, color: string): void { c.fillStyle = '#20242c'; c.fillRect(x - 85, y - 50, 170, 110); c.strokeStyle = color; c.lineWidth = 5; for (let i = -1; i <= 1; i += 1) c.strokeRect(x + i * 48 - 18, y - 20, 36, 36); }
  private drawStars(c: CanvasRenderingContext2D, count: number, color: string): void { c.fillStyle = color; for (let i = 0; i < count; i += 1) { const x = (i * 97 + 31) % 1280; const y = (i * 53 + 27) % 390; const size = i % 7 === 0 ? 2.3 : 1; c.globalAlpha = .35 + (i % 5) * .12; c.fillRect(x, y, size, size); } c.globalAlpha = 1; }

  private heartHint(): string {
    const state = this.services.getState();
    if (!state.miniGames['ruin-push'].completed) return '纪元之心需要原初荒原的地图核心。';
    if (!state.miniGames['pollen-link'].completed) return '森语庭院仍有花粉记忆未被连接。';
    if (!state.miniGames['firefly-rhythm'].completed) return '庭院最后的旋律仍被噪蚀吞没。';
    if (!hasFlag(state, 'wasteland-watercolor-cache')) return '新透镜可以揭示旧土地的真相。返回原初荒原寻找隐藏源泉。';
    return '所有源律已经就位。';
  }
}

function distance(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
