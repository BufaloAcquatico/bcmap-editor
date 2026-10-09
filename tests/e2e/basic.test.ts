import { test, expect, Page } from "playwright/test";

test("basic editor loads", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await expect(page).toHaveTitle("BCMap Editor");
});
