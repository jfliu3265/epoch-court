import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { createInitialState } from './state';

describe('save migration and validation', () => {
  it('migrates a v1 save into the complete v2 schema', () => {
    const migrated = migrateSave({ schemaVersion: 1, playerName: '旧旅者', scene: 'wasteland', resources: { lightDust: 42 }, storyFlags: ['color-awakened'] });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.playerName).toBe('旧旅者');
    expect(migrated.resources.lightDust).toBe(42);
    expect(migrated.miniGames['pollen-link']).toEqual({ completed: false, bestScore: 0, mastery: false, attempts: 0 });
  });

  it('sanitizes invalid numeric and list data without trusting runtime objects', () => {
    const save = createInitialState();
    const migrated = migrateSave({ ...save, resources: { lightDust: -12, sourceCores: Number.NaN, realmMaterial: 2 }, storyFlags: ['a', 'a', 9], scene: 'unknown' });
    expect(migrated.resources.lightDust).toBe(0);
    expect(migrated.resources.sourceCores).toBe(0);
    expect(migrated.storyFlags).toEqual(['a']);
    expect(migrated.scene).toBe('court');
  });

  it('rejects unknown schemas', () => {
    expect(() => migrateSave({ schemaVersion: 99 })).toThrow('无法识别');
  });
});
