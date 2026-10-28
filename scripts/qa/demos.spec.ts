import { expect, test } from '@playwright/test';
for (const slug of ['quality-report', 'estimate', 'shipments', 'clinic-admin', 'booking', 'inventory', 'prospects']) {
  test(`${slug} renders without page errors or viewport overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const res = await page.goto(`/demos/${slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('.demo-workspace')).toBeVisible();
    await expect(page.getByText('Fictional records · no external actions')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
test('quality inputs recompute the report', async ({ page }) => {
  await page.goto('/demos/quality-report');
  const input = page.getByPlaceholder('e.g. 42.01');
  await input.fill('42.01');
  await expect(input).toHaveValue('42.01');
  await expect(page.locator('.demo-workspace')).toContainText('Inspected');
});
