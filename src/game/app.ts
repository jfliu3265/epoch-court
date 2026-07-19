import { AudioEngine } from '../core/audio';
import { detectCapabilities, recommendedSettings } from '../core/capabilities';
import { InputManager, type Action } from '../core/input';
import { ParticlePool } from '../core/particles';
import { SaveManager } from '../core/save';
import { addFlag, completionPercent, createInitialState, hasFlag, moveTo, settleMiniGame } from '../core/state';
import type { GameSettings, GameState, MiniGameId, MiniGameResult, RuntimeDiagnostics, SceneId } from '../core/types';
import type { Playable } from './contracts';
import { MINI_GAME_MANIFESTS } from './manifests';
import { ShaderRenderer } from './shaderRenderer';
import { WorldScene } from './world';

const LOGICAL_WIDTH = 1280;
const LOGICAL_HEIGHT = 720;

export class GameApp {
  private state: GameState = createInitialState();
  private readonly save = new SaveManager();
  private readonly audio = new AudioEngine();
  private readonly particles = new ParticlePool();
  private readonly capabilities = detectCapabilities();
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly shaderCanvas: HTMLCanvasElement;
  private readonly shader: ShaderRenderer;
  private readonly input: InputManager;
  private playable: Playable | null = null;
  private currentMiniGame: MiniGameId | null = null;
  private returnScene: SceneId = 'court';
  private running = false;
  private paused = false;
  private lastFrame = 0;
  private frameRequest = 0;
  private fpsWindow: number[] = [];
  private saveStatusTimer = 0;
  private announcementTimer = 0;
  private hasExistingSave = false;
  private diagnostics: RuntimeDiagnostics = { activeTimers: 0, activeListeners: 0, activeParticles: 0, activeMiniGame: null, webglContexts: 0, frames: 0, fps: 0 };

  private elements!: {
    start: HTMLElement; game: HTMLElement; name: HTMLInputElement; continueButton: HTMLButtonElement; newButton: HTMLButtonElement;
    sceneName: HTMLElement; quest: HTMLElement; resources: HTMLElement; lens: HTMLElement; progress: HTMLElement; prompt: HTMLElement; toast: HTMLElement;
    dialogue: HTMLDialogElement; dialogueSpeaker: HTMLElement; dialogueText: HTMLElement; dialogueClose: HTMLButtonElement;
    result: HTMLDialogElement; resultTitle: HTMLElement; resultBody: HTMLElement; retry: HTMLButtonElement; resultReturn: HTMLButtonElement;
    settings: HTMLDialogElement; pause: HTMLDialogElement; court: HTMLDialogElement; error: HTMLElement;
    saveStatus: HTMLElement; inputHint: HTMLElement; touch: HTMLElement; importInput: HTMLInputElement;
  };

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = this.template();
    this.bindElements();
    this.canvas = root.querySelector<HTMLCanvasElement>('#world-canvas')!;
    this.context = this.canvas.getContext('2d', { alpha: false })!;
    this.shaderCanvas = root.querySelector<HTMLCanvasElement>('#shader-canvas')!;
    this.input = new InputManager((source) => this.updateInputHint(source));
    this.shader = new ShaderRenderer(this.shaderCanvas, this.state.settings, (message) => this.showError(message));
    this.shader.resize(LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.bindUi();
  }

  async initialize(): Promise<void> {
    const loaded = await this.save.load();
    if (loaded) {
      this.state = loaded;
      this.hasExistingSave = true;
      this.elements.continueButton.hidden = false;
      this.elements.continueButton.textContent = `继续 · ${this.sceneLabel(loaded.scene)} · ${completionPercent(loaded)}%`;
    } else {
      const defaults = recommendedSettings(this.capabilities);
      this.state = createInitialState('拾界者', { ...createInitialState().settings, ...defaults });
    }
    this.shader.setSettings(this.state.settings);
    this.renderCapabilitySummary();
    this.updateHud();
    this.registerServiceWorker();
    this.exposeDiagnostics();
  }

  private async begin(newGame: boolean): Promise<void> {
    if (newGame) {
      if (this.hasExistingSave && !confirm('开始新旅程会替换当前继续进度。最近三个自动恢复点仍会保留，是否继续？')) return;
      const defaults = recommendedSettings(this.capabilities);
      this.state = createInitialState(this.elements.name.value, { ...createInitialState().settings, ...defaults });
      await this.save.save(this.state);
      this.hasExistingSave = true;
    }
    await this.audio.awaken(this.state);
    this.audio.applyState(this.state);
    this.elements.start.classList.add('is-hidden');
    this.elements.game.classList.remove('is-hidden');
    this.running = true;
    this.enterWorld(this.state.scene);
    this.lastFrame = performance.now();
    this.frameRequest = requestAnimationFrame(this.loop);
    if (this.state.scene === 'awakening' && !hasFlag(this.state, 'intro-seen')) {
      this.state = addFlag(this.state, 'intro-seen');
      this.announce('大静默抹去了颜色、音乐和选择。移动到远处唯一的光点，让第一个世界重新呼吸。', '弥光');
      void this.persist('序章开始');
    }
  }

  private enterWorld(scene: SceneId): void {
    this.disposePlayable();
    this.state.scene = scene;
    this.currentMiniGame = null;
    this.playable = new WorldScene(scene, {
      getState: () => this.state,
      setState: (state, reason) => { this.state = state; this.updateHud(); this.audio.applyState(state); void this.persist(reason); },
      launchMiniGame: (id) => void this.launchMiniGame(id),
      transition: (target, x, y) => this.transition(target, x, y),
      announce: (text, speaker) => this.announce(text, speaker),
      setPrompt: (text) => { this.elements.prompt.textContent = text ?? ''; this.elements.prompt.classList.toggle('is-visible', Boolean(text)); },
      evolve: (message, x, y) => this.evolve(message, x, y),
      openCourtBuild: () => this.openCourtBuild(),
      audio: this.audio,
      input: this.input,
    });
    this.updateHud();
  }

  private transition(scene: SceneId, x: number, y: number): void {
    this.state = moveTo(this.state, scene, x, y);
    this.audio.play('interact');
    this.shader.trigger(x / LOGICAL_WIDTH, y / LOGICAL_HEIGHT, .9);
    this.enterWorld(scene);
    void this.persist(`进入${this.sceneLabel(scene)}`);
    if (scene === 'ending' && !hasFlag(this.state, 'ending-seen')) {
      this.state = addFlag(this.state, 'ending-seen');
      setTimeout(() => this.announce('你让四种游戏不再是孤岛：闪避带回色彩，方构修好地图，花粉唤醒透镜，节奏让王庭重新歌唱。', '弥光'), 450);
    }
  }

  private async launchMiniGame(id: MiniGameId): Promise<void> {
    const manifest = MINI_GAME_MANIFESTS[id];
    if (!manifest.unlock(this.state)) { this.announce('这个仪式尚未解锁。先完成当前界域的净化。', '弥光'); return; }
    this.returnScene = this.state.scene;
    this.disposePlayable();
    this.currentMiniGame = id;
    this.elements.sceneName.textContent = manifest.title;
    this.elements.quest.textContent = `小游戏 · 预计 ${manifest.estimatedMinutes} 分钟`;
    this.elements.prompt.classList.remove('is-visible');
    try {
      const factory = await manifest.load();
      if (this.currentMiniGame !== id) return;
      this.playable = factory.create({
        state: this.state, input: this.input, audio: this.audio, particles: this.particles,
        width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT,
        finish: (result) => this.finishMiniGame(result),
        announce: (text) => this.toast(text, 6000),
      });
      this.diagnostics.activeMiniGame = id;
      this.toast(`${manifest.title} 已加载 · ${manifest.accessibility.join(' · ')}`, 5200);
    } catch (error) {
      this.showError(`小游戏加载失败：${error instanceof Error ? error.message : '未知错误'}。已返回最近安全场景。`);
      this.enterWorld(this.returnScene);
    }
  }

  private finishMiniGame(result: MiniGameResult): void {
    const settlement = settleMiniGame(this.state, result);
    this.state = settlement.state;
    this.audio.applyState(this.state);
    void this.persist(`${MINI_GAME_MANIFESTS[result.id].title}结算`);
    if (settlement.firstWin && result.won) {
      const message = settlement.evolutions.join('；');
      setTimeout(() => this.evolve(message), 300);
    }
    this.elements.resultTitle.textContent = result.won ? '净化完成' : '仪式中断';
    const reward = settlement.awarded;
    this.elements.resultBody.innerHTML = `
      <p><strong>${MINI_GAME_MANIFESTS[result.id].title}</strong></p>
      <p>得分 ${result.score} · ${result.mastery ? '✦ 精通达成' : '仍有精通挑战'}</p>
      <p>${result.won ? `获得 ${reward.lightDust} 光尘、${reward.realmMaterial} 界域材料、${reward.sourceCores} 源律核心` : '没有失去资源，可以立即重试。'}</p>
    `;
    this.elements.retry.dataset.game = result.id;
    this.elements.result.showModal();
    this.updateHud();
  }

  private returnFromMiniGame(): void {
    this.elements.result.close();
    const id = this.currentMiniGame;
    this.currentMiniGame = null;
    this.enterWorld(id === 'slime-dodge' && this.returnScene === 'awakening' && this.state.miniGames['slime-dodge'].completed ? 'court' : this.returnScene);
    if (id === 'slime-dodge' && this.returnScene === 'awakening' && this.state.miniGames['slime-dodge'].completed) {
      this.state = moveTo(this.state, 'court', 640, 530);
      this.enterWorld('court');
      void this.persist('抵达纪元王庭');
    }
  }

  private evolve(message: string, x = .5, y = .55): void {
    this.shader.trigger(x, y, 1.8);
    this.toast(`世界演化：${message}`, 7600, true);
    this.audio.play('success');
  }

  private openCourtBuild(): void {
    const built = hasFlag(this.state, 'court-archive-built');
    const button = this.elements.court.querySelector<HTMLButtonElement>('[data-build]')!;
    const body = this.elements.court.querySelector<HTMLElement>('[data-court-body]')!;
    body.innerHTML = built
      ? '<p>档案馆已经记录四个小游戏的最佳成绩、精通标记与世界年表。</p><p>每个玩法的成果都在同一座王庭中留下痕迹。</p>'
      : `<p>修复「源律档案馆」需要 60 光尘。</p><p>当前光尘：${this.state.resources.lightDust}</p><p>档案馆会让小游戏成绩成为王庭的永久陈列。</p>`;
    button.hidden = built;
    button.disabled = this.state.resources.lightDust < 60;
    button.textContent = button.disabled ? '光尘不足' : '修复档案馆 · 60 光尘';
    this.elements.court.showModal();
  }

  private buildCourtArchive(): void {
    if (this.state.resources.lightDust < 60 || hasFlag(this.state, 'court-archive-built')) return;
    this.state = addFlag(this.state, 'court-archive-built');
    this.state.resources.lightDust -= 60;
    this.state.courtLevel = Math.max(1, this.state.courtLevel);
    this.elements.court.close(); this.updateHud(); this.evolve('源律档案馆已经建成，小游戏记录被纳入王庭年表。', .5, .72);
    void this.persist('修复源律档案馆');
  }

  private updateHud(): void {
    this.elements.sceneName.textContent = this.sceneLabel(this.state.scene);
    this.elements.quest.textContent = this.questText();
    this.elements.resources.textContent = `光尘 ${this.state.resources.lightDust} · 核心 ${this.state.resources.sourceCores} · 材料 ${this.state.resources.realmMaterial}`;
    this.elements.lens.textContent = `透镜：${this.state.activeLens === 'pixel' ? '像素层' : '水彩层'}${this.state.unlockedLenses.length > 1 ? ' · Q 切换' : ''}`;
    this.elements.progress.textContent = `净化进度 ${completionPercent(this.state)}% · 王庭 ${this.state.courtLevel}/3`;
    document.documentElement.dataset.quality = this.state.settings.quality;
    document.documentElement.dataset.reducedMotion = String(this.state.settings.reducedMotion);
    document.documentElement.dataset.colorAssist = String(this.state.settings.colorAssist);
    this.shader.setSettings(this.state.settings);
    this.audio.applyState(this.state);
    this.syncSettingsForm();
  }

  private questText(): string {
    if (!this.state.miniGames['slime-dodge'].completed) return '目标：触碰无声光点，完成第一场净化';
    if (!hasFlag(this.state, 'court-archive-built')) return '目标：用获得的光尘修复王庭档案馆';
    if (!this.state.miniGames['ruin-push'].completed) return '目标：原初荒原 · 修复方构地图核心';
    if (!this.state.miniGames['pollen-link'].completed) return '目标：森语庭院 · 连接花粉记忆';
    if (!this.state.miniGames['firefly-rhythm'].completed) return '目标：森语庭院 · 召回萤火旋律';
    if (!hasFlag(this.state, 'wasteland-watercolor-cache')) return '目标：切换水彩透镜，重返原初荒原寻找隐藏源泉';
    return this.state.scene === 'ending' ? '垂直切片完成 · 下一界域：蒸汽峡湾' : '目标：返回王庭，重启纪元之心';
  }

  private async persist(reason: string): Promise<void> {
    this.elements.saveStatus.textContent = '保存中…';
    try { await this.save.save(this.state); this.elements.saveStatus.textContent = `已保存 · ${reason}`; }
    catch { this.elements.saveStatus.textContent = '保存失败 · 可在设置中导出备份'; }
    clearTimeout(this.saveStatusTimer); this.saveStatusTimer = window.setTimeout(() => { this.elements.saveStatus.textContent = '自动存档已开启'; }, 2600);
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    const delta = Math.min(.05, Math.max(0, (now - this.lastFrame) / 1000)); this.lastFrame = now;
    this.input.pollGamepad();
    if (this.input.wasPressed('pause') && !this.elements.result.open && !this.elements.dialogue.open) this.togglePause();
    if (!this.paused && !this.anyDialogOpen()) {
      this.playable?.update(delta);
      this.particles.update(delta);
      this.state.totalPlaySeconds += delta;
    }
    this.context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.playable?.render(this.context);
    this.shader.render(now);
    this.input.endFrame();
    this.sampleDiagnostics(delta);
    this.frameRequest = requestAnimationFrame(this.loop);
  };

  private sampleDiagnostics(delta: number): void {
    this.diagnostics.frames += 1;
    this.fpsWindow.push(delta);
    if (this.fpsWindow.length > 90) this.fpsWindow.shift();
    const total = this.fpsWindow.reduce((sum, value) => sum + value, 0);
    this.diagnostics.fps = total > 0 ? Math.round(this.fpsWindow.length / total) : 0;
    this.diagnostics.activeParticles = this.particles.particles.length;
    this.diagnostics.activeMiniGame = this.currentMiniGame;
    this.diagnostics.webglContexts = this.capabilities.webgl2 && this.state.settings.quality === 'high' ? 1 : 0;
  }

  private bindUi(): void {
    this.elements.continueButton.addEventListener('click', () => void this.begin(false));
    this.elements.newButton.addEventListener('click', () => void this.begin(true));
    this.root.querySelectorAll<HTMLElement>('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => (button.closest('dialog') as HTMLDialogElement)?.close()));
    this.elements.dialogueClose.addEventListener('click', () => this.elements.dialogue.close());
    this.elements.resultReturn.addEventListener('click', () => this.returnFromMiniGame());
    this.elements.retry.addEventListener('click', () => { const id = this.elements.retry.dataset.game as MiniGameId; this.elements.result.close(); void this.launchMiniGame(id); });
    this.root.querySelectorAll('[data-settings]').forEach((button) => button.addEventListener('click', () => {
      if (this.elements.pause.open) { this.elements.pause.close(); this.paused = false; }
      if (!this.elements.settings.open) this.elements.settings.showModal();
    }));
    this.root.querySelector('[data-pause]')?.addEventListener('click', () => this.togglePause());
    this.root.querySelector('[data-resume]')?.addEventListener('click', () => this.togglePause(false));
    this.root.querySelector('[data-restart]')?.addEventListener('click', () => void this.restart());
    this.root.querySelector('[data-build]')?.addEventListener('click', () => this.buildCourtArchive());
    this.root.querySelector('[data-export]')?.addEventListener('click', () => this.exportSave());
    this.root.querySelector('[data-import]')?.addEventListener('click', () => this.elements.importInput.click());
    this.elements.importInput.addEventListener('change', () => void this.importSave());
    this.root.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => input.addEventListener('input', () => this.readSettingsForm()));
    this.root.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => this.bindTouchButton(button, button.dataset.action as Action));
    document.addEventListener('visibilitychange', () => { if (document.hidden) void this.audio.suspend(); else void this.audio.awaken(this.state); });
    window.addEventListener('beforeunload', () => { if (this.running) void this.save.save(this.state); });
  }

  private bindTouchButton(button: HTMLElement, action: Action): void {
    const down = (event: Event) => { event.preventDefault(); button.setPointerCapture?.((event as PointerEvent).pointerId); this.input.setTouch(action, true); };
    const up = (event: Event) => { event.preventDefault(); this.input.setTouch(action, false); };
    button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('pointerleave', up);
  }

  private bindElements(): void {
    const q = <T extends Element>(selector: string) => this.root.querySelector<T>(selector)!;
    this.elements = {
      start: q('#start-screen'), game: q('#game-shell'), name: q('#player-name'), continueButton: q('#continue-game'), newButton: q('#new-game'),
      sceneName: q('#scene-name'), quest: q('#quest'), resources: q('#resources'), lens: q('#lens'), progress: q('#progress'), prompt: q('#prompt'), toast: q('#toast'),
      dialogue: q('#dialogue'), dialogueSpeaker: q('#dialogue-speaker'), dialogueText: q('#dialogue-text'), dialogueClose: q('#dialogue-close'),
      result: q('#result-dialog'), resultTitle: q('#result-title'), resultBody: q('#result-body'), retry: q('#retry-game'), resultReturn: q('#return-world'),
      settings: q('#settings-dialog'), pause: q('#pause-dialog'), court: q('#court-dialog'), error: q('#error-banner'),
      saveStatus: q('#save-status'), inputHint: q('#input-hint'), touch: q('#touch-controls'), importInput: q('#import-file'),
    };
  }

  private togglePause(force?: boolean): void {
    this.paused = force ?? !this.paused;
    if (this.paused && !this.elements.pause.open) this.elements.pause.showModal();
    if (!this.paused && this.elements.pause.open) this.elements.pause.close();
  }

  private anyDialogOpen(): boolean { return this.elements.dialogue.open || this.elements.result.open || this.elements.settings.open || this.elements.pause.open || this.elements.court.open; }
  private disposePlayable(): void { this.playable?.dispose(); this.playable = null; this.particles.clear(); this.diagnostics.activeMiniGame = null; }
  private announce(text: string, speaker = '弥光'): void { this.elements.dialogueSpeaker.textContent = speaker; this.elements.dialogueText.textContent = text; if (!this.elements.dialogue.open) this.elements.dialogue.showModal(); }

  private toast(text: string, duration = 4200, important = false): void {
    clearTimeout(this.announcementTimer); this.elements.toast.textContent = text; this.elements.toast.classList.add('is-visible'); this.elements.toast.classList.toggle('is-important', important);
    this.announcementTimer = window.setTimeout(() => this.elements.toast.classList.remove('is-visible'), duration);
  }

  private showError(message: string | null): void { this.elements.error.textContent = message ?? ''; this.elements.error.hidden = !message; }

  private updateInputHint(source: string): void {
    const labels: Record<string, string> = { keyboard: '键盘：WASD / 方向键 · 空格行动 · Q 透镜 · Esc 暂停', touch: '触屏控制已启用', gamepad: '手柄：左摇杆移动 · A 行动 · LB 透镜 · Start 暂停' };
    this.elements.inputHint.textContent = labels[source] ?? labels.keyboard ?? 'WASD / 方向键移动';
    this.elements.touch.classList.toggle('force-visible', source === 'touch');
  }

  private sceneLabel(scene: SceneId): string { return ({ awakening: '无声残片', court: '纪元王庭', wasteland: '原初荒原', garden: '森语庭院', ending: '第一纪元：苏醒' })[scene]; }

  private syncSettingsForm(): void {
    const set = (name: string, value: string | boolean) => { const input = this.root.querySelector<HTMLInputElement>(`[name="${name}"]`); if (!input) return; if (typeof value === 'boolean') input.checked = value; else input.value = value; };
    set('quality', this.state.settings.quality); set('reducedMotion', this.state.settings.reducedMotion); set('colorAssist', this.state.settings.colorAssist); set('subtitles', this.state.settings.subtitles);
    set('masterVolume', String(this.state.settings.masterVolume)); set('musicVolume', String(this.state.settings.musicVolume)); set('effectsVolume', String(this.state.settings.effectsVolume));
  }

  private readSettingsForm(): void {
    const get = (name: string) => this.root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    const settings: GameSettings = {
      quality: get('quality').value === 'low' ? 'low' : 'high', reducedMotion: get('reducedMotion').checked, colorAssist: get('colorAssist').checked, subtitles: get('subtitles').checked,
      masterVolume: Number(get('masterVolume').value), musicVolume: Number(get('musicVolume').value), effectsVolume: Number(get('effectsVolume').value),
    };
    this.state.settings = settings; this.state.saveRevision += 1; this.updateHud(); void this.persist('设置更新');
  }

  private exportSave(): void {
    const blob = new Blob([this.save.export(this.state)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `epoch-court-save-${Date.now()}.json`; anchor.click(); URL.revokeObjectURL(url); this.toast('存档备份已导出');
  }

  private async importSave(): Promise<void> {
    const file = this.elements.importInput.files?.[0]; if (!file) return;
    try { this.state = await this.save.import(await file.text()); this.updateHud(); this.enterWorld(this.state.scene); this.toast('存档已校验并导入', 4500, true); this.elements.settings.close(); }
    catch (error) { this.showError(`导入失败：${error instanceof Error ? error.message : '文件无效'}。原存档未被覆盖。`); }
    this.elements.importInput.value = '';
  }

  private async restart(): Promise<void> {
    if (!confirm('确定清除当前进度并重新开始吗？已导出的备份不受影响。')) return;
    await this.save.clear(); location.reload();
  }

  private renderCapabilitySummary(): void {
    const element = this.root.querySelector<HTMLElement>('#capability-summary')!;
    element.textContent = `${this.capabilities.webgl2 ? 'WebGL 2 特效可用' : 'Canvas 兼容模式'} · ${this.capabilities.webgpu ? 'WebGPU 增强入口可用' : 'WebGPU 非必需'} · ${this.capabilities.touch ? '支持触屏' : '键鼠/手柄'}`;
  }

  private registerServiceWorker(): void {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    if (import.meta.env.DEV) { void navigator.serviceWorker.getRegistrations().then((items) => Promise.all(items.map((item) => item.unregister()))); return; }
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).catch(() => undefined);
  }

  private exposeDiagnostics(): void {
    const diagnostics: Record<string, unknown> = {
      getState: () => structuredClone(this.state), getDiagnostics: () => structuredClone(this.diagnostics),
      jumpTo: (scene: SceneId) => this.transition(scene, 640, 430), launchMiniGame: (id: MiniGameId) => this.launchMiniGame(id),
      simulateContextLoss: () => this.shaderCanvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
    };
    if (import.meta.env.DEV) diagnostics.completeMiniGame = (id: MiniGameId, mastery = false) => this.finishMiniGame({ id, won: true, score: mastery ? 2400 : 1200, mastery, durationSeconds: 120 });
    (window as Window & { __EPOCH_COURT__?: unknown }).__EPOCH_COURT__ = diagnostics;
  }

  private template(): string {
    return `
      <main class="app-frame">
        <section id="start-screen" class="start-screen" aria-labelledby="game-title">
          <div class="start-stars" aria-hidden="true"></div>
          <div class="title-mark" aria-hidden="true"><span></span><span></span><span></span></div>
          <p class="eyebrow">一个会随你苏醒的 Web 游戏帝国</p>
          <h1 id="game-title"><small>万象净界</small>纪元王庭</h1>
          <p class="start-copy">穿过失色的界域，完成四种游戏仪式。每一次胜利都会让色彩、声音、规则与王庭永久改变。</p>
          <label class="name-field">拾界者名字 <input id="player-name" maxlength="16" value="拾界者" autocomplete="off" /></label>
          <div class="start-actions"><button id="continue-game" class="primary" hidden>继续游戏</button><button id="new-game" class="secondary">唤醒新世界</button></div>
          <p id="capability-summary" class="capability-summary">正在检测浏览器能力…</p>
          <p class="start-note">单人 · 自动存档 · 可离线 · 键鼠 / 触屏 / 手柄</p>
        </section>

        <section id="game-shell" class="game-shell is-hidden" aria-label="游戏">
          <header class="top-hud">
            <div><span id="scene-name" class="scene-name">无声残片</span><span id="quest" class="quest"></span></div>
            <div class="hud-actions"><span id="save-status">自动存档已开启</span><button data-settings aria-label="设置">⚙</button><button data-pause aria-label="暂停">Ⅱ</button></div>
          </header>
          <div class="canvas-wrap">
            <canvas id="world-canvas" width="1280" height="720" aria-label="游戏世界画面"></canvas>
            <canvas id="shader-canvas" width="1280" height="720" hidden aria-hidden="true"></canvas>
            <div id="error-banner" class="error-banner" role="alert" hidden></div>
            <div id="toast" class="toast" role="status" aria-live="polite"></div>
            <div id="prompt" class="interaction-prompt"></div>
          </div>
          <footer class="bottom-hud">
            <span id="resources"></span><span id="lens"></span><span id="progress"></span><span id="input-hint">键盘：WASD / 方向键 · 空格行动 · Q 透镜 · Esc 暂停</span>
          </footer>
          <div id="touch-controls" class="touch-controls" aria-label="触屏控制">
            <div class="touch-dpad"><button data-action="up">▲</button><button data-action="left">◀</button><button data-action="down">▼</button><button data-action="right">▶</button></div>
            <div class="touch-actions"><button data-action="lens">透镜</button><button data-action="dash">冲刺</button><button data-action="primary" class="touch-primary">行动</button></div>
          </div>
        </section>
      </main>

      <dialog id="dialogue" class="game-dialog dialogue"><p id="dialogue-speaker" class="speaker">弥光</p><p id="dialogue-text"></p><button id="dialogue-close" class="primary">继续</button></dialog>
      <dialog id="result-dialog" class="game-dialog"><h2 id="result-title">净化完成</h2><div id="result-body"></div><div class="dialog-actions"><button id="retry-game" class="secondary">再次挑战</button><button id="return-world" class="primary">返回世界</button></div></dialog>
      <dialog id="court-dialog" class="game-dialog"><p class="speaker">王庭修复台</p><h2>源律档案馆</h2><div data-court-body></div><div class="dialog-actions"><button data-close-dialog class="secondary">稍后</button><button data-build class="primary">修复</button></div></dialog>
      <dialog id="pause-dialog" class="game-dialog"><p class="speaker">世界暂停</p><h2>在安全点停一会儿</h2><p>进度已经自动保存。任何非联网玩法都可以暂停。</p><div class="dialog-actions column"><button data-resume class="primary">继续游戏</button><button data-settings class="secondary">设置</button><button data-export class="secondary">导出存档</button></div></dialog>
      <dialog id="settings-dialog" class="game-dialog settings-dialog"><p class="speaker">设置与无障碍</p><h2>让世界适合你</h2>
        <label>画质 <select name="quality" data-setting><option value="high">High · 完整 Shader 与粒子</option><option value="low">Low · Canvas 兼容模式</option></select></label>
        <label class="check"><input type="checkbox" name="reducedMotion" data-setting /> 减少动态、震屏和快速扭曲</label>
        <label class="check"><input type="checkbox" name="colorAssist" data-setting /> 色彩辅助：强化轮廓与图案</label>
        <label class="check"><input type="checkbox" name="subtitles" data-setting /> 字幕与文字提示</label>
        <label>总音量 <input type="range" name="masterVolume" data-setting min="0" max="1" step="0.05" /></label>
        <label>音乐 <input type="range" name="musicVolume" data-setting min="0" max="1" step="0.05" /></label>
        <label>音效 <input type="range" name="effectsVolume" data-setting min="0" max="1" step="0.05" /></label>
        <div class="dialog-actions wrap"><button data-export class="secondary">导出存档</button><button data-import class="secondary">导入存档</button><button data-restart class="danger">重新开始</button><button data-close-dialog class="primary">完成</button></div>
        <input id="import-file" type="file" accept="application/json" hidden />
      </dialog>
    `;
  }
}
