import { defineConfig, devices } from "playwright/test";
import { register } from "ts-node";

// Transpile (do not type-check) test files using the lenient test tsconfig.
register({ transpileOnly: true, project: "tsconfig.test.json" });

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "html",
    use: {
        baseURL: "http://localhost:8080",
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        command: "npx http-server . -p 8080 -s",
        url: "http://localhost:8080",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});
