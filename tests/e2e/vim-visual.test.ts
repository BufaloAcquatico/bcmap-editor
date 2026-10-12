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

const selectGrass = async (page: Page) => {
    await page.evaluate(() =>
        (window as any).editor.setSelectedTile({
            ID: 210,
            Type: "FloorExterior",
            Style: "Grass",
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
    // erase originals with the grass brush, then paste elsewhere
    await selectGrass(page);
    await page.keyboard.press(" ");
    await page.keyboard.press("h");
    await page.keyboard.press(" ");
    expect(await tileAt(page, 0, 0)).toBe(210);
    expect(await tileAt(page, 1, 0)).toBe(210);

    await pressTimes(page, "j", 5);
    await page.keyboard.press("p");
    expect(await tileAt(page, 0, 5)).toBe(215);
    expect(await tileAt(page, 1, 5)).toBe(215);
});

test("Space fills the visual region with the brush", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await selectLongGrass(page);
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.keyboard.press(" ");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press(" ");
    // fill the 3-wide region (0..2, 0), including the grass gap at (1, 0)
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press(" ");
    expect(await tileAt(page, 0, 0)).toBe(215);
    expect(await tileAt(page, 1, 0)).toBe(215);
    expect(await tileAt(page, 2, 0)).toBe(215);
    expect(await modeText(page)).toBe("-- NORMAL --");
    // one undo reverts the fill only: the gap returns to grass
    await page.keyboard.press("u");
    expect(await tileAt(page, 0, 0)).toBe(215);
    expect(await tileAt(page, 1, 0)).toBe(210);
    expect(await tileAt(page, 2, 0)).toBe(215);
});

test("p tiles the yank over the visual region", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await selectLongGrass(page);
    // yank a 2x1 pattern: [long grass, grass]
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await page.keyboard.press(" ");
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("y");
    // tile it over a 4-wide region five rows down
    await pressTimes(page, "j", 5);
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("p");
    expect(await tileAt(page, 1, 5)).toBe(215);
    expect(await tileAt(page, 2, 5)).toBe(210);
    expect(await tileAt(page, 3, 5)).toBe(215);
    expect(await tileAt(page, 4, 5)).toBe(210);
    expect(await modeText(page)).toBe("-- NORMAL --");
    // one undo reverts the whole tiling
    await page.keyboard.press("u");
    expect(await tileAt(page, 1, 5)).toBe(210);
    expect(await tileAt(page, 3, 5)).toBe(210);
});

test("visual boot clamps an out-of-bounds mouse hover", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const box = await page.locator("#mapCanvas").boundingBox();
    if (!box) throw new Error("no canvas box");
    // Pan far so empty (out-of-map) area sits under the cursor.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, {
        steps: 10,
    });
    await page.mouse.up({ button: "right" });
    await page.mouse.move(box.x + 4, box.y + 4, { steps: 5 });
    await page.keyboard.press("v");
    const cursor = await page.evaluate(() =>
        (window as any).editor.vim.getCursor(),
    );
    expect(cursor.X).toBeGreaterThanOrEqual(0);
    expect(cursor.X).toBeLessThan(40);
    expect(cursor.Y).toBeGreaterThanOrEqual(0);
    expect(cursor.Y).toBeLessThan(40);
    const region = await page.evaluate(() =>
        (window as any).editor.vim.getRegion(),
    );
    expect(region.from.X).toBeGreaterThanOrEqual(0);
    expect(region.to.X).toBeLessThan(40);
    expect(region.from.Y).toBeGreaterThanOrEqual(0);
    expect(region.to.Y).toBeLessThan(40);
    expect(await modeText(page)).toMatch(/-- VISUAL --/);
});

test("Escape exits visual mode", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await page.keyboard.press("v");
    expect(await modeText(page)).toBe("-- VISUAL -- 1x1");
    await page.keyboard.press("Escape");
    expect(await modeText(page)).toBe("-- NORMAL --");
});
