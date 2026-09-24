import { test, expect } from '@playwright/test';
test('mobile audience submission and refresh retain the same receipt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PUT YOUR NAME ON THE WALL' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBeTruthy();
  await page.getByLabel('YOUR NAME. YOUR MOMENT.').fill('BROWSER QA');
  await page.getByRole('button', { name: 'SUBMIT', exact: true }).click();
  await expect(page.locator('.ticket-name')).toHaveText('BROWSER QA');
  await page.reload();
  await expect(page.locator('.ticket-name')).toHaveText('BROWSER QA');
});
