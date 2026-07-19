import type { AudioEngine } from '../core/audio';
import type { InputManager } from '../core/input';
import type { ParticlePool } from '../core/particles';
import type { GameState, MiniGameId, MiniGameResult, RewardDefinition } from '../core/types';

export interface Playable {
  update(delta: number): void;
  render(context: CanvasRenderingContext2D): void;
  dispose(): void;
}

export interface MiniGameContext {
  readonly state: GameState;
  readonly input: InputManager;
  readonly audio: AudioEngine;
  readonly particles: ParticlePool;
  readonly width: number;
  readonly height: number;
  finish(result: MiniGameResult): void;
  announce(text: string): void;
}

export interface MiniGameFactory {
  create(context: MiniGameContext): Playable;
}

export interface MiniGameManifest {
  id: MiniGameId;
  title: string;
  realm: 'wasteland' | 'garden';
  estimatedMinutes: number;
  unlock: (state: GameState) => boolean;
  load: () => Promise<MiniGameFactory>;
  reward: RewardDefinition;
  accessibility: string[];
}
