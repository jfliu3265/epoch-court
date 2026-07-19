export type SceneId = 'awakening' | 'court' | 'wasteland' | 'garden' | 'ending';
export type LensId = 'pixel' | 'watercolor';
export type MiniGameId = 'slime-dodge' | 'ruin-push' | 'pollen-link' | 'firefly-rhythm';
export type InputSource = 'keyboard' | 'touch' | 'gamepad';
export type Quality = 'low' | 'high';

export interface Vec2 {
  x: number;
  y: number;
}

export interface GameSettings {
  quality: Quality;
  reducedMotion: boolean;
  colorAssist: boolean;
  subtitles: boolean;
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
}

export interface MiniGameRecord {
  completed: boolean;
  bestScore: number;
  mastery: boolean;
  attempts: number;
}

export interface GameState {
  schemaVersion: 2;
  saveRevision: number;
  updatedAt: number;
  playerName: string;
  scene: SceneId;
  position: Vec2;
  activeLens: LensId;
  unlockedLenses: LensId[];
  storyFlags: string[];
  cleansedNodes: string[];
  resources: {
    lightDust: number;
    sourceCores: number;
    realmMaterial: number;
  };
  courtLevel: number;
  miniGames: Record<MiniGameId, MiniGameRecord>;
  settings: GameSettings;
  totalPlaySeconds: number;
}

export interface MiniGameResult {
  id: MiniGameId;
  won: boolean;
  score: number;
  mastery: boolean;
  durationSeconds: number;
}

export interface RewardDefinition {
  lightDust: number;
  realmMaterial: number;
  sourceCoreOnFirstWin?: number;
}

export interface Capabilities {
  webgl2: boolean;
  webgpu: boolean;
  offscreenCanvas: boolean;
  touch: boolean;
  gamepad: boolean;
  reducedMotion: boolean;
  deviceMemory?: number;
}

export interface RuntimeDiagnostics {
  activeTimers: number;
  activeListeners: number;
  activeParticles: number;
  activeMiniGame: MiniGameId | null;
  webglContexts: number;
  frames: number;
  fps: number;
}
