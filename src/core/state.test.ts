import { describe, expect, it } from 'vitest';
import { addFlag, canFinishSlice, completionPercent, createInitialState, settleMiniGame } from './state';

describe('progression settlement', () => {
  it('awards first wins once and evolves the shared world', () => {
    const initial = createInitialState('测试拾界者');
    const first = settleMiniGame(initial, { id: 'slime-dodge', won: true, score: 900, mastery: true, durationSeconds: 40 });
    expect(first.firstWin).toBe(true);
    expect(first.state.resources.lightDust).toBe(80);
    expect(first.state.resources.sourceCores).toBe(1);
    expect(first.state.storyFlags).toContain('color-awakened');
    expect(first.state.courtLevel).toBe(1);

    const repeat = settleMiniGame(first.state, { id: 'slime-dodge', won: true, score: 1000, mastery: false, durationSeconds: 45 });
    expect(repeat.firstWin).toBe(false);
    expect(repeat.awarded.sourceCores).toBe(0);
    expect(repeat.state.resources.lightDust).toBe(96);
    expect(repeat.state.miniGames['slime-dodge'].bestScore).toBe(1000);
  });

  it('unlocks the watercolor lens and requires a return visit for the finale', () => {
    let state = createInitialState();
    for (const id of ['slime-dodge', 'ruin-push', 'pollen-link', 'firefly-rhythm'] as const) {
      state = settleMiniGame(state, { id, won: true, score: 1000, mastery: false, durationSeconds: 90 }).state;
    }
    expect(state.unlockedLenses).toContain('watercolor');
    expect(canFinishSlice(state)).toBe(false);
    expect(completionPercent(state)).toBe(80);
    state = addFlag(state, 'wasteland-watercolor-cache');
    expect(canFinishSlice(state)).toBe(true);
    expect(completionPercent(state)).toBe(100);
  });

  it('does not award a failed attempt', () => {
    const result = settleMiniGame(createInitialState(), { id: 'firefly-rhythm', won: false, score: 200, mastery: false, durationSeconds: 40 });
    expect(result.state.resources.lightDust).toBe(0);
    expect(result.state.miniGames['firefly-rhythm'].attempts).toBe(1);
    expect(result.state.miniGames['firefly-rhythm'].completed).toBe(false);
  });
});
