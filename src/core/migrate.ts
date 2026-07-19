import { createInitialState, DEFAULT_SETTINGS } from './state';
import type { GameState, MiniGameId } from './types';

type UnknownRecord = Record<string, unknown>;

export function migrateSave(input: unknown): GameState {
  if (!input || typeof input !== 'object') throw new Error('存档格式无效');
  const raw = input as UnknownRecord;
  if (raw.schemaVersion === 2) return validateV2(raw);
  if (raw.schemaVersion === 1) {
    const next = createInitialState(typeof raw.playerName === 'string' ? raw.playerName : '拾界者');
    next.resources.lightDust = asNumber((raw.resources as UnknownRecord | undefined)?.lightDust, 0);
    next.storyFlags = asStringArray(raw.storyFlags);
    next.cleansedNodes = asStringArray(raw.cleansedNodes);
    next.scene = isScene(raw.scene) ? raw.scene : 'court';
    next.settings = { ...DEFAULT_SETTINGS, ...(isObject(raw.settings) ? raw.settings : {}) } as GameState['settings'];
    next.saveRevision = asNumber(raw.saveRevision, 0) + 1;
    return next;
  }
  throw new Error('无法识别的存档版本');
}

export function validateV2(raw: UnknownRecord): GameState {
  const baseline = createInitialState(typeof raw.playerName === 'string' ? raw.playerName : '拾界者');
  const miniGames = isObject(raw.miniGames) ? raw.miniGames : {};
  const ids: MiniGameId[] = ['slime-dodge', 'ruin-push', 'pollen-link', 'firefly-rhythm'];
  for (const id of ids) {
    const record = isObject(miniGames[id]) ? miniGames[id] : {};
    baseline.miniGames[id] = {
      completed: Boolean(record.completed),
      bestScore: Math.max(0, asNumber(record.bestScore, 0)),
      mastery: Boolean(record.mastery),
      attempts: Math.max(0, asNumber(record.attempts, 0)),
    };
  }
  baseline.saveRevision = Math.max(0, asNumber(raw.saveRevision, 0));
  baseline.updatedAt = asNumber(raw.updatedAt, Date.now());
  baseline.scene = isScene(raw.scene) ? raw.scene : 'court';
  const position = isObject(raw.position) ? raw.position : {};
  baseline.position = { x: asNumber(position.x, 640), y: asNumber(position.y, 430) };
  baseline.activeLens = raw.activeLens === 'watercolor' ? 'watercolor' : 'pixel';
  baseline.unlockedLenses = asStringArray(raw.unlockedLenses).filter((lens): lens is 'pixel' | 'watercolor' => lens === 'pixel' || lens === 'watercolor');
  if (!baseline.unlockedLenses.includes('pixel')) baseline.unlockedLenses.unshift('pixel');
  if (!baseline.unlockedLenses.includes(baseline.activeLens)) baseline.activeLens = 'pixel';
  baseline.storyFlags = [...new Set(asStringArray(raw.storyFlags))];
  baseline.cleansedNodes = [...new Set(asStringArray(raw.cleansedNodes))];
  const resources = isObject(raw.resources) ? raw.resources : {};
  baseline.resources = {
    lightDust: Math.max(0, asNumber(resources.lightDust, 0)),
    sourceCores: Math.max(0, asNumber(resources.sourceCores, 0)),
    realmMaterial: Math.max(0, asNumber(resources.realmMaterial, 0)),
  };
  baseline.courtLevel = Math.max(0, Math.min(3, asNumber(raw.courtLevel, 0)));
  baseline.totalPlaySeconds = Math.max(0, asNumber(raw.totalPlaySeconds, 0));
  baseline.settings = { ...DEFAULT_SETTINGS, ...(isObject(raw.settings) ? raw.settings : {}) } as GameState['settings'];
  return baseline;
}

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isScene(value: unknown): value is GameState['scene'] {
  return value === 'awakening' || value === 'court' || value === 'wasteland' || value === 'garden' || value === 'ending';
}
