import { chromium } from 'playwright';
import type { ZaiUsageResponse, ZaiLimit } from './types.js';
import type { RunContext } from '../config/index.js';

export class ZaiClient {
  private context: RunContext;

  constructor(context: RunContext) {
    this.context = context;
  }

  async getUsageQuota(): Promise<ZaiLimit[]> {
    const timeout = this.context.timeouts.zai;
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
      let responseResolve: (value: ZaiUsageResponse) => void;
      let responseReject: (error: Error) => void;
      
      const responsePromise = new Promise<ZaiUsageResponse>((resolve, reject) => {
        responseResolve = resolve;
        responseReject = reject;
      });

      const timeoutId = setTimeout(() => {
        responseReject!(new Error('Timeout waiting for usage API - you may need to log in to z.ai first'));
      }, timeout);

      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('api.z.ai/api/monitor/usage/quota/limit')) {
          clearTimeout(timeoutId);
          try {
            const body = await response.json();
            responseResolve!(body as ZaiUsageResponse);
          } catch (error) {
            responseReject!(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });

      await page.goto('https://z.ai/manage-apikey/subscription', { 
        waitUntil: 'load', 
        timeout 
      });

      await page.waitForTimeout(3000);

      // Close any modal dialogs that might be blocking
      const closeButton = page.locator('.ant-modal-close, [aria-label="Close"]').first();
      if (await closeButton.count() > 0) {
        await closeButton.click();
        await page.waitForTimeout(500);
      }

      try {
        const usageTab = page.locator('[role="tab"]').filter({ hasText: 'Usage' });
        await usageTab.click({ force: true, timeout: 10000 });
        await page.waitForTimeout(2000);
      } catch {
        clearTimeout(timeoutId);
        throw new Error('Failed to find or click Usage tab - you may need to log in to z.ai first');
      }

      apiResponse = await responsePromise;

      if (!apiResponse.success || apiResponse.code !== 200) {
        throw new Error(`Z.ai API error: ${apiResponse.msg}`);
      }

      return apiResponse.data.limits;
    } finally {
      await browserContext.close();
    }
  }
}
