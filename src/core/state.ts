import type { GameSettings, GameState, MiniGameId, MiniGameRecord, MiniGameResult, SceneId } from './types';

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'high',
  reducedMotion: typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  colorAssist: false,
  subtitles: true,
  masterVolume: 0.75,
  musicVolume: 0.55,
  effectsVolume: 0.7,
};

const emptyRecord = (): MiniGameRecord => ({ completed: false, bestScore: 0, mastery: false, attempts: 0 });

export function createInitialState(playerName = '拾界者', settings = DEFAULT_SETTINGS): GameState {
  return {
    schemaVersion: 2,
    saveRevision: 0,
    updatedAt: Date.now(),
    playerName: playerName.trim().slice(0, 16) || '拾界者',
    scene: 'awakening',
    position: { x: 230, y: 430 },
    activeLens: 'pixel',
    unlockedLenses: ['pixel'],
    storyFlags: [],
    cleansedNodes: [],
    resources: { lightDust: 0, sourceCores: 0, realmMaterial: 0 },
    courtLevel: 0,
    miniGames: {
      'slime-dodge': emptyRecord(),
      'ruin-push': emptyRecord(),
      'pollen-link': emptyRecord(),
      'firefly-rhythm': emptyRecord(),
    },
    settings: { ...settings },
    totalPlaySeconds: 0,
  };
}

const rewardByGame: Record<MiniGameId, { lightDust: number; realmMaterial: number; sourceCoreOnFirstWin: number }> = {
  'slime-dodge': { lightDust: 80, realmMaterial: 1, sourceCoreOnFirstWin: 1 },
  'ruin-push': { lightDust: 100, realmMaterial: 1, sourceCoreOnFirstWin: 1 },
  'pollen-link': { lightDust: 120, realmMaterial: 2, sourceCoreOnFirstWin: 1 },
  'firefly-rhythm': { lightDust: 160, realmMaterial: 2, sourceCoreOnFirstWin: 1 },
};

export interface Settlement {
  state: GameState;
  firstWin: boolean;
  awarded: { lightDust: number; realmMaterial: number; sourceCores: number };
  evolutions: string[];
}

export function settleMiniGame(current: GameState, result: MiniGameResult): Settlement {
  const state = structuredClone(current);
  const record = state.miniGames[result.id];
  record.attempts += 1;
  record.bestScore = Math.max(record.bestScore, Math.max(0, Math.floor(result.score)));
  record.mastery ||= result.mastery;
  const firstWin = result.won && !record.completed;
  const reward = rewardByGame[result.id];
  const awarded = { lightDust: 0, realmMaterial: 0, sourceCores: 0 };
  const evolutions: string[] = [];

  if (result.won) {
    record.completed = true;
    const repeatFactor = firstWin ? 1 : 0.2;
    awarded.lightDust = Math.max(10, Math.floor(reward.lightDust * repeatFactor));
    awarded.realmMaterial = firstWin ? reward.realmMaterial : 0;
    awarded.sourceCores = firstWin ? reward.sourceCoreOnFirstWin : 0;
    state.resources.lightDust += awarded.lightDust;
    state.resources.realmMaterial += awarded.realmMaterial;
    state.resources.sourceCores += awarded.sourceCores;
  }

  if (firstWin) {
    state.cleansedNodes.push(result.id);
    switch (result.id) {
      case 'slime-dodge':
        state.storyFlags.push('color-awakened', 'court-open');
        state.courtLevel = Math.max(state.courtLevel, 1);
        evolutions.push('色彩与环境音已经回到原初荒原', '纪元王庭的门厅重新点亮');
        break;
      case 'ruin-push':
        state.storyFlags.push('map-restored', 'garden-open');
        evolutions.push('旧地图与界门坐标已经复原', '森语庭院的道路已经显现');
        break;
      case 'pollen-link':
        state.storyFlags.push('watercolor-awakened');
        if (!state.unlockedLenses.includes('watercolor')) state.unlockedLenses.push('watercolor');
        state.activeLens = 'watercolor';
        state.courtLevel = Math.max(state.courtLevel, 2);
        evolutions.push('水彩透镜已经苏醒', '植物、情绪痕迹和隐藏水路现在可以显形');
        break;
      case 'firefly-rhythm':
        state.storyFlags.push('garden-cleansed');
        state.courtLevel = Math.max(state.courtLevel, 3);
        evolutions.push('森语庭院的完整旋律已经回归', '王庭演奏台开始运转');
        break;
    }
  }

  state.updatedAt = Date.now();
  state.saveRevision += 1;
  return { state, firstWin, awarded, evolutions };
}

export function hasFlag(state: GameState, flag: string): boolean {
  return state.storyFlags.includes(flag);
}

export function addFlag(current: GameState, flag: string): GameState {
  if (current.storyFlags.includes(flag)) return current;
  const state = structuredClone(current);
  state.storyFlags.push(flag);
  state.saveRevision += 1;
  state.updatedAt = Date.now();
  return state;
}

export function moveTo(current: GameState, scene: SceneId, x: number, y: number): GameState {
  const state = structuredClone(current);
  state.scene = scene;
  state.position = { x, y };
  state.saveRevision += 1;
  state.updatedAt = Date.now();
  return state;
}

export function canEnterGarden(state: GameState): boolean {
  return hasFlag(state, 'garden-open');
}

export function canFinishSlice(state: GameState): boolean {
  return state.miniGames['firefly-rhythm'].completed && hasFlag(state, 'wasteland-watercolor-cache');
}

export function completionPercent(state: GameState): number {
  const games = Object.values(state.miniGames).filter((record) => record.completed).length;
  const cache = hasFlag(state, 'wasteland-watercolor-cache') ? 1 : 0;
  return Math.round(((games + cache) / 5) * 100);
}
