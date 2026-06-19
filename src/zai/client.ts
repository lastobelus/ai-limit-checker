import { chromium, type Page } from 'playwright';
import type { ZaiUsageResponse, ZaiLimit } from './types.js';
import type { RunContext } from '../config/index.js';
import { getLoginCommand } from '../login.js';

export class ZaiClient {
  private context: RunContext;

  constructor(context: RunContext) {
    this.context = context;
  }

  private async waitForUsageQuotaResponse(page: Page, timeout: number): Promise<ZaiUsageResponse> {
    const response = await page.waitForResponse(
      (candidate) => candidate.url().includes('api.z.ai/api/monitor/usage/quota/limit'),
      { timeout }
    );

    return await response.json() as ZaiUsageResponse;
  }

  private async closeBlockingDialogs(page: Page): Promise<void> {
    const closeButton = page.locator('.ant-modal-close, [aria-label="Close"]').first();
    if (await closeButton.count() > 0) {
      await closeButton.click();
      await page.waitForTimeout(500);
    }
  }

  private async clickUsageNavigation(page: Page): Promise<void> {
    const usageTargets = [
      page.getByRole('link', { name: /^Usage$/i }).first(),
      page.getByRole('tab', { name: /Usage/i }).first(),
      page.locator('a[href*="/usage"]').first(),
      page.locator('[role="tab"]').filter({ hasText: /Usage/i }).first(),
    ];

    for (const target of usageTargets) {
      if (await target.count() === 0) {
        continue;
      }

      await target.click({ force: true, timeout: 10000 });
      return;
    }

    const navigationLabels = await page
      .locator('a, [role="tab"], button')
      .evaluateAll((nodes) => nodes
        .map((node) => node.textContent?.trim())
        .filter((text): text is string => Boolean(text))
        .slice(0, 20))
      .catch(() => []);

    const labels = navigationLabels.length > 0
      ? ` Visible navigation: ${navigationLabels.join(', ')}`
      : '';

    throw new Error(`Failed to find or click Usage navigation.${labels} Run: ${getLoginCommand('zai')}`);
  }

  async getUsageQuota(): Promise<ZaiLimit[]> {
    const timeout = this.context.timeouts.zai;
    const usageResponseTimeout = Math.min(timeout, 30000);
    const userDataDir = this.context.zai.userDataDir;
    
    let browserContext;
    try {
      browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        channel: 'chrome',
        args: [
          '--use-mock-keychain',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      });
    } catch (error) {
      throw new Error(`Failed to launch Chrome: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const page = await browserContext.newPage();

      let apiResponse: ZaiUsageResponse | null = null;

      const responsePromise = this.waitForUsageQuotaResponse(page, usageResponseTimeout);
      await page.goto('https://z.ai/manage-apikey/coding-plan/personal/usage', {
        waitUntil: 'load', 
        timeout 
      });

      await this.closeBlockingDialogs(page);

      try {
        apiResponse = await responsePromise;
      } catch {
        const fallbackResponsePromise = this.waitForUsageQuotaResponse(page, usageResponseTimeout);
        await this.clickUsageNavigation(page);
        apiResponse = await fallbackResponsePromise;
      }

      if (!apiResponse.success || apiResponse.code !== 200) {
        throw new Error(`Z.ai API error: ${apiResponse.msg}`);
      }

      return apiResponse.data.limits;
    } finally {
      await browserContext.close();
    }
  }
}
