import { chromium } from 'playwright';
import { getLoginCommand } from '../login.js';
export class ZaiClient {
    context;
    constructor(context) {
        this.context = context;
    }
    async waitForUsageQuotaResponse(page, timeout) {
        const response = await page.waitForResponse((candidate) => candidate.url().includes('api.z.ai/api/monitor/usage/quota/limit'), { timeout });
        return await response.json();
    }
    async closeBlockingDialogs(page) {
        const closeButton = page.locator('.ant-modal-close, [aria-label="Close"]').first();
        if (await closeButton.count() > 0) {
            await closeButton.click();
            await page.waitForTimeout(500);
        }
    }
    async clickUsageNavigation(page) {
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
            .filter((text) => Boolean(text))
            .slice(0, 20))
            .catch(() => []);
        const labels = navigationLabels.length > 0
            ? ` Visible navigation: ${navigationLabels.join(', ')}`
            : '';
        throw new Error(`Failed to find or click Usage navigation.${labels} Run: ${getLoginCommand('zai')}`);
    }
    async getUsageQuota() {
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
        }
        catch (error) {
            throw new Error(`Failed to launch Chrome: ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
            const page = await browserContext.newPage();
            let apiResponse = null;
            const responsePromise = this.waitForUsageQuotaResponse(page, usageResponseTimeout);
            await page.goto('https://z.ai/manage-apikey/coding-plan/personal/usage', {
                waitUntil: 'load',
                timeout
            });
            await this.closeBlockingDialogs(page);
            try {
                apiResponse = await responsePromise;
            }
            catch {
                const fallbackResponsePromise = this.waitForUsageQuotaResponse(page, usageResponseTimeout);
                await this.clickUsageNavigation(page);
                apiResponse = await fallbackResponsePromise;
            }
            if (!apiResponse.success || apiResponse.code !== 200) {
                throw new Error(`Z.ai API error: ${apiResponse.msg}`);
            }
            return apiResponse.data.limits;
        }
        finally {
            await browserContext.close();
        }
    }
}
//# sourceMappingURL=client.js.map