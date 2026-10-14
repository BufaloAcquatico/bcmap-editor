import { test, expect, Page } from "playwright/test";

async function tilesOf(page: Page): Promise<string> {
    return page.evaluate(() => {
        const editor = (
            window as unknown as {
                editor: { getMapData: () => { Tiles: string } };
            }
        ).editor;
        return editor.getMapData().Tiles;
    });
}

async function paintCenterTile(page: Page): Promise<void> {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.fill("#searchInput", "LongGrass");
    await page.waitForTimeout(100);
    await page.click('#tileCategories .sprite-item[title="Long Grass"]');
    const canvas = page.locator("#mapCanvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");
    await canvas.click({
        position: { x: box.width / 2, y: box.height / 2 },
    });
    await page.waitForTimeout(100);
}

test("one undo press reverts one painted tile (button)", async ({
    page,
}: {
    page: Page;
}) => {
    await paintCenterTile(page);
    const before = await tilesOf(page);

    // Paint must have changed exactly one cell and enabled Undo
    await expect(page.locator("#btnUndo")).toBeEnabled();
    await expect(page.locator("#btnRedo")).toBeDisabled();

    // A single undo press reverts the whole stroke
    await page.click("#menuEditToggle");
    await page.click("#btnUndo");
    await page.waitForTimeout(100);
    const afterUndo = await tilesOf(page);
    expect(afterUndo).not.toBe(before);
    expect(afterUndo.split("").every((c) => c.charCodeAt(0) === 210)).toBe(
        true,
    );
    await expect(page.locator("#btnUndo")).toBeDisabled();
    await expect(page.locator("#btnRedo")).toBeEnabled();

    // Redo re-applies it
    await page.click("#menuEditToggle");
    await page.click("#btnRedo");
    await page.waitForTimeout(100);
    expect(await tilesOf(page)).toBe(before);
});

test("undo/redo keybinds work (Ctrl+Z / Ctrl+Y)", async ({
    page,
}: {
    page: Page;
}) => {
    await paintCenterTile(page);
    const before = await tilesOf(page);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(100);
    expect(await tilesOf(page)).not.toBe(before);

    await page.keyboard.press("Control+y");
    await page.waitForTimeout(100);
    expect(await tilesOf(page)).toBe(before);
});
