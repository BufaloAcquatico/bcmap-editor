import { test, expect, Page } from "playwright/test";

const openEditor = async (page: Page) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForFunction(() => (window as any).editor !== undefined);
};

const tileAt = (page: Page, x: number, y: number) =>
    page.evaluate(
        ([x, y]) =>
            (window as any).editor.getMapData().Tiles.charCodeAt(x + y * 40),
        [x, y],
    );

const modeText = (page: Page) => page.locator("#statusVimMode").textContent();

const pressTimes = async (page: Page, key: string, times: number) => {
    for (let i = 0; i < times; i++) await page.keyboard.press(key);
};

const selectLongGrass = async (page: Page) => {
    await page.evaluate(() =>
        (window as any).editor.setSelectedTile({
            ID: 215,
            Type: "FloorExterior",
            Style: "LongGrass",
        }),
    );
};

test("v shows the VISUAL label with region size", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press("v");
    expect(await modeText(page)).toBe("-- VISUAL -- 1x1");
    await page.keyboard.press("l");
    expect(await modeText(page)).toBe("-- VISUAL -- 2x1");
});

test("y yanks both layers and p pastes them", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await selectLongGrass(page);
    // paint two cells at the top-left
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.keyboard.press(" ");
    await page.keyboard.press("l");
    await page.keyboard.press(" ");
    // select and yank them
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("y");
    expect(await modeText(page)).toBe("-- NORMAL --");
    // erase originals with x, then paste elsewhere
    await page.keyboard.press("x");
    await page.keyboard.press("h");
    await page.keyboard.press("x");
    expect(await tileAt(page, 0, 0)).toBe(210);
    expect(await tileAt(page, 1, 0)).toBe(210);

    await pressTimes(page, "j", 5);
    await page.keyboard.press("p");
    expect(await tileAt(page, 0, 5)).toBe(215);
    expect(await tileAt(page, 1, 5)).toBe(215);
});

test("d deletes the visual region", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await selectLongGrass(page);
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.keyboard.press(" ");
    await page.keyboard.press("l");
    await page.keyboard.press(" ");
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("d");
    expect(await tileAt(page, 0, 0)).toBe(210);
    expect(await tileAt(page, 1, 0)).toBe(210);
    expect(await modeText(page)).toBe("-- NORMAL --");
});

test("Escape exits visual mode", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await page.keyboard.press("v");
    expect(await modeText(page)).toBe("-- VISUAL -- 1x1");
    await page.keyboard.press("Escape");
    expect(await modeText(page)).toBe("-- NORMAL --");
});
