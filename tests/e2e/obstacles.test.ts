import { test, expect, Page } from "playwright/test";

const openEditor = async (page: Page) => {
    await page.goto("/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForFunction(() => (window as any).editor !== undefined);
};

const visible = (page: Page) =>
    page.evaluate(() => (window as any).editor.isObstaclesVisible());

test("obstacle overlay is off by default and X toggles it", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    expect(await visible(page)).toBe(false);
    await page.locator("#mapCanvas").focus();
    await page.keyboard.press("X");
    expect(await visible(page)).toBe(true);
    await page.keyboard.press("X");
    expect(await visible(page)).toBe(false);
    // Lowercase x is unbound and must not toggle.
    await page.keyboard.press("x");
    expect(await visible(page)).toBe(false);
});

test(":obstacles toggles and undo/redo restores the view flag", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await page.keyboard.type("obstacles");
    await page.keyboard.press("Enter");
    expect(await visible(page)).toBe(true);
    await page.keyboard.press("Control+z");
    expect(await visible(page)).toBe(false);
    await page.keyboard.press("Control+y");
    expect(await visible(page)).toBe(true);
});

test("the overlay does not change map data or dirty state", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const before = await page.evaluate(() => ({
        code: (window as any).editor.exportMap("probe"),
        dirty: (window as any).isMapDirty(),
    }));
    await page.locator("#mapCanvas").focus();
    await page.keyboard.press("X");
    const after = await page.evaluate(() => ({
        code: (window as any).editor.exportMap("probe"),
        dirty: (window as any).isMapDirty(),
    }));
    expect(after.code).toBe(before.code);
    expect(after.dirty).toBe(before.dirty);
});

test("fog does not suppress the obstacle overlay", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await page.keyboard.type("fog on");
    await page.keyboard.press("Enter");
    await page.locator("#mapCanvas").focus();
    await page.keyboard.press("X");
    expect(await visible(page)).toBe(true);
});
