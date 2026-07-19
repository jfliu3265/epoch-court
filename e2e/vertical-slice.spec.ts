import { expect, test } from '@playwright/test';

type DebugApi = {
  getState(): any;
  getDiagnostics(): any;
  jumpTo(scene: string): void;
  launchMiniGame(id: string): Promise<void>;
  completeMiniGame(id: string, mastery?: boolean): void;
  simulateContextLoss(): void;
};

const api = async (page: import('@playwright/test').Page, method: keyof DebugApi, ...args: unknown[]) => page.evaluate(
  ({ method, args }) => {
    const debug = (window as Window & { __EPOCH_COURT__: DebugApi }).__EPOCH_COURT__;
    const fn = debug[method] as (...values: unknown[]) => unknown;
    return fn(...args);
  },
  { method, args },
);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('epoch-court'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('new game completes the four-game shared-world loop and persists', async ({ page }) => {
  await page.getByLabel('拾界者名字').fill('巡光者');
  await page.getByRole('button', { name: '唤醒新世界' }).click();
  await page.getByRole('button', { name: '继续' }).click();

  await api(page, 'launchMiniGame', 'slime-dodge');
  await expect(page.getByText('史莱姆闪避场 已加载')).toBeVisible();
  await api(page, 'completeMiniGame', 'slime-dodge', true);
  await expect(page.getByRole('heading', { name: '净化完成' })).toBeVisible();
  await page.getByRole('button', { name: '返回世界' }).click();
  await expect(page.locator('#scene-name')).toHaveText('纪元王庭');

  await api(page, 'jumpTo', 'wasteland');
  await api(page, 'launchMiniGame', 'ruin-push');
  await api(page, 'completeMiniGame', 'ruin-push');
  await page.getByRole('button', { name: '返回世界' }).click();

  await api(page, 'jumpTo', 'garden');
  await api(page, 'launchMiniGame', 'pollen-link');
  await api(page, 'completeMiniGame', 'pollen-link', true);
  await page.getByRole('button', { name: '返回世界' }).click();
  await api(page, 'launchMiniGame', 'firefly-rhythm');
  await api(page, 'completeMiniGame', 'firefly-rhythm');
  await page.getByRole('button', { name: '返回世界' }).click();

  const progressed = await api(page, 'getState') as any;
  expect(progressed.playerName).toBe('巡光者');
  expect(progressed.unlockedLenses).toContain('watercolor');
  expect(progressed.miniGames['firefly-rhythm'].completed).toBe(true);

  await page.reload();
  await expect(page.getByRole('button', { name: /继续/ })).toBeVisible();
  await page.getByRole('button', { name: /继续/ }).click();
  const restored = await api(page, 'getState') as any;
  expect(restored.playerName).toBe('巡光者');
  expect(restored.miniGames['pollen-link'].completed).toBe(true);
});

test('settings expose low-quality fallback and accessibility preferences', async ({ page }) => {
  await page.getByRole('button', { name: '唤醒新世界' }).click();
  await page.getByRole('button', { name: '继续' }).click();
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('画质').selectOption('low');
  await page.getByLabel(/减少动态/).check();
  await page.getByLabel(/色彩辅助/).check();
  await expect(page.locator('html')).toHaveAttribute('data-quality', 'low');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-color-assist', 'true');
});

test('mini-game switching releases the previous module and context-loss is recoverable', async ({ page }) => {
  await page.getByRole('button', { name: '唤醒新世界' }).click();
  await page.getByRole('button', { name: '继续' }).click();
  for (const id of ['slime-dodge', 'ruin-push', 'pollen-link', 'firefly-rhythm']) {
    await api(page, 'launchMiniGame', id);
    await api(page, 'completeMiniGame', id);
    await page.getByRole('button', { name: '返回世界' }).click();
  }
  await page.waitForTimeout(120);
  const diagnostics = await api(page, 'getDiagnostics') as any;
  expect(diagnostics.activeMiniGame).toBeNull();
  expect(diagnostics.activeParticles).toBe(0);
  expect(diagnostics.activeAudioNodes).toBeLessThanOrEqual(4);
  await api(page, 'simulateContextLoss');
  await expect(page.getByRole('alert')).toContainText('安全暂停特效');
});

test('mobile viewport shows touch controls and remains playable', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: '唤醒新世界' }).click();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.locator('#touch-controls')).toBeVisible();
  await page.locator('[data-action="right"]').dispatchEvent('pointerdown', { pointerId: 1 });
  await page.waitForTimeout(300);
  await page.locator('[data-action="right"]').dispatchEvent('pointerup', { pointerId: 1 });
  const state = await api(page, 'getState') as any;
  expect(state.scene).toBe('awakening');
});
