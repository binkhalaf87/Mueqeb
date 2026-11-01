import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

// رسائل البريد (روابط التأكيد والاستعادة) تُكتب في ملف تقرؤه الاختبارات؛ للاختبارات فقط
process.env.EMAIL_LOG_FILE ??= join(tmpdir(), `mueqeb-e2e-emails-${PORT}.jsonl`);

/**
 * يتطلب Postgres محلياً مع بيانات seed: npm run db:start && npm run seed
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ar-SA",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // كل الاختبارات من عنوان IP واحد: نرفع حدود المعدل (لا يُضبط هذا أبداً في الإنتاج)
    env: { RATE_LIMIT_MULTIPLIER: "100", EMAIL_LOG_FILE: process.env.EMAIL_LOG_FILE },
  },
});
