import { describe, expect, it, vi } from 'vitest';
import { ParticlePool } from '../core/particles';
import { createInitialState } from '../core/state';
import { MINI_GAME_MANIFESTS } from './manifests';

describe('mini-game module contract', () => {
  it('loads every game independently and disposes without retaining particles', async () => {
    const input = { axis: () => ({ x: 0, y: 0 }), isDown: () => false, wasPressed: () => false } as any;
    const audio = { play: () => undefined } as any;
    const particles = new ParticlePool();
    const finish = vi.fn();
    for (const manifest of Object.values(MINI_GAME_MANIFESTS)) {
      const factory = await manifest.load();
      const playable = factory.create({ state: createInitialState(), input, audio, particles, width: 1280, height: 720, finish, announce: vi.fn() });
      expect(playable.update).toBeTypeOf('function');
      expect(playable.render).toBeTypeOf('function');
      playable.dispose();
      particles.clear();
      expect(particles.particles).toHaveLength(0);
    }
  });
});
