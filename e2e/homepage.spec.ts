import { test, expect } from '@playwright/test'

test('homepage loads and shows the ManTur brand', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/ManTur/)
  await expect(page.getByRole('link', { name: /ManTur/i }).first()).toBeVisible()
})
