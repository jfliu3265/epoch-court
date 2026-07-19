import type { Capabilities, GameSettings } from './types';

export function detectCapabilities(): Capabilities {
  const canvas = document.createElement('canvas');
  let webgl2 = false;
  try {
    webgl2 = Boolean(canvas.getContext('webgl2'));
  } catch {
    webgl2 = false;
  }
  const nav = navigator as Navigator & { gpu?: unknown; deviceMemory?: number };
  return {
    webgl2,
    webgpu: Boolean(nav.gpu),
    offscreenCanvas: 'OffscreenCanvas' in globalThis,
    touch: navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis,
    gamepad: 'getGamepads' in navigator,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    deviceMemory: nav.deviceMemory,
  };
}

export function recommendedSettings(capabilities: Capabilities): Partial<GameSettings> {
  const lowMemory = capabilities.deviceMemory !== undefined && capabilities.deviceMemory <= 4;
  return {
    quality: !capabilities.webgl2 || lowMemory ? 'low' : 'high',
    reducedMotion: capabilities.reducedMotion,
  };
}
