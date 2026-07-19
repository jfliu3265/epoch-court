import { hasFlag } from '../core/state';
import type { MiniGameId } from '../core/types';
import type { MiniGameManifest } from './contracts';

export const MINI_GAME_MANIFESTS: Record<MiniGameId, MiniGameManifest> = {
  'slime-dodge': {
    id: 'slime-dodge', title: '史莱姆闪避场', realm: 'wasteland', estimatedMinutes: 3,
    unlock: () => true,
    load: () => import('./minigames/slimeDodge'),
    reward: { lightDust: 80, realmMaterial: 1, sourceCoreOnFirstWin: 1 },
    accessibility: ['危险范围轮廓', '形状与颜色双重提示', '减少动态'],
  },
  'ruin-push': {
    id: 'ruin-push', title: '遗迹推箱', realm: 'wasteland', estimatedMinutes: 4,
    unlock: (state) => hasFlag(state, 'color-awakened'),
    load: () => import('./minigames/ruinPush'),
    reward: { lightDust: 100, realmMaterial: 1, sourceCoreOnFirstWin: 1 },
    accessibility: ['不限时', '撤销/重置', '网格高对比'],
  },
  'pollen-link': {
    id: 'pollen-link', title: '花粉连线', realm: 'garden', estimatedMinutes: 4,
    unlock: (state) => hasFlag(state, 'garden-open'),
    load: () => import('./minigames/pollenLink'),
    reward: { lightDust: 120, realmMaterial: 2, sourceCoreOnFirstWin: 1 },
    accessibility: ['编号提示', '无时间压力', '错误宽容'],
  },
  'firefly-rhythm': {
    id: 'firefly-rhythm', title: '萤火节奏', realm: 'garden', estimatedMinutes: 4,
    unlock: (state) => hasFlag(state, 'watercolor-awakened'),
    load: () => import('./minigames/fireflyRhythm'),
    reward: { lightDust: 160, realmMaterial: 2, sourceCoreOnFirstWin: 1 },
    accessibility: ['节奏宽容窗口', '视觉节拍', '非颜色方向符号'],
  },
};
