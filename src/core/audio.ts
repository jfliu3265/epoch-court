import type { GameState } from './types';

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private voices: OscillatorNode[] = [];
  private transientNodes = 0;
  private started = false;

  async awaken(state: GameState): Promise<void> {
    if (!this.context) this.createGraph(state);
    if (this.context?.state === 'suspended') await this.context.resume();
    if (!this.started) {
      this.started = true;
      this.startAmbience();
    }
  }

  applyState(state: GameState): void {
    if (!this.context || !this.master || !this.music || !this.effects) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(state.settings.masterVolume, now, 0.08);
    this.music.gain.setTargetAtTime(state.settings.musicVolume * (state.storyFlags.includes('color-awakened') ? 1 : 0.22), now, 0.35);
    this.effects.gain.setTargetAtTime(state.settings.effectsVolume, now, 0.08);
    this.voices.forEach((voice, index) => {
      const unlocked = index === 0 || state.courtLevel >= index;
      const gain = (voice as OscillatorNode & { __gain?: GainNode }).__gain;
      gain?.gain.setTargetAtTime(unlocked ? 0.035 : 0, now, 0.5);
    });
  }

  play(type: 'interact' | 'success' | 'fail' | 'lens' | 'step'): void {
    if (!this.context || !this.effects) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const frequencies = { interact: 520, success: 740, fail: 120, lens: 920, step: 180 };
    oscillator.frequency.setValueAtTime(frequencies[type], now);
    if (type === 'success') oscillator.frequency.exponentialRampToValueAtTime(1180, now + 0.22);
    oscillator.type = type === 'fail' ? 'sawtooth' : 'sine';
    gain.gain.setValueAtTime(type === 'step' ? 0.018 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === 'success' ? 0.35 : 0.12));
    oscillator.connect(gain).connect(this.effects);
    this.transientNodes += 1;
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.transientNodes = Math.max(0, this.transientNodes - 1); };
    oscillator.start(now);
    oscillator.stop(now + 0.4);
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  dispose(): void {
    this.voices.forEach((voice) => voice.stop());
    this.voices = [];
    void this.context?.close();
    this.context = null;
    this.started = false;
    this.transientNodes = 0;
  }

  diagnostics(): { ambienceVoices: number; transientNodes: number } { return { ambienceVoices: this.voices.length, transientNodes: this.transientNodes }; }

  private createGraph(state: GameState): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.music = this.context.createGain();
    this.effects = this.context.createGain();
    this.music.connect(this.master);
    this.effects.connect(this.master);
    this.master.connect(this.context.destination);
    this.applyState(state);
  }

  private startAmbience(): void {
    if (!this.context || !this.music) return;
    const notes = [110, 164.81, 220, 329.63];
    this.voices = notes.map((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = index % 2 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index * 3;
      gain.gain.value = index === 0 ? 0.035 : 0;
      oscillator.connect(gain).connect(this.music!);
      (oscillator as OscillatorNode & { __gain?: GainNode }).__gain = gain;
      oscillator.start();
      return oscillator;
    });
  }
}
