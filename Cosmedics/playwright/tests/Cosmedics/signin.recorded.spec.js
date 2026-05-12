import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://dev.cosmedicenter.com/auth/signin');
  await page.getByRole('heading', { name: 'Sign In' }).click();
  await page.getByRole('textbox', { name: 'Email Address' }).click();
  await page.getByRole('textbox', { name: 'Email Address' }).fill('pateint@gmail.com');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('Password123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Invalid credentials.').click();
  await page.getByRole('textbox', { name: 'Email Address' }).click();
  await page.getByRole('textbox', { name: 'Email Address' }).fill('patient@gmail.com');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('password123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Invalid credentials.').click();
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('Password123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('You have successfully logged').click();
});