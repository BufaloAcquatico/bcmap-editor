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

const selectLongGrass = async (page: Page) => {
    await page.evaluate(() =>
        (window as any).editor.setSelectedTile({
            ID: 215,
            Type: "FloorExterior",
            Style: "LongGrass",
        }),
    );
};

test("Space paints the cursor cell with the selected tile", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await selectLongGrass(page);
    await page.keyboard.press(" ");
    expect(await tileAt(page, 20, 20)).toBe(215);
});

test("x erases the cursor cell back to grass", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await selectLongGrass(page);
    await page.keyboard.press(" ");
    await page.keyboard.press("x");
    expect(await tileAt(page, 20, 20)).toBe(210);
});

test("u undoes the last edit", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await selectLongGrass(page);
    await page.keyboard.press(" ");
    await page.keyboard.press("u");
    expect(await tileAt(page, 20, 20)).toBe(210);
});

test("a key-repeat erase burst is one undo entry", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await selectLongGrass(page);
    // paint a row of cells, then burst-erase them with x
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    for (let i = 0; i < 3; i++) await page.keyboard.press(" ");
    for (let i = 0; i < 2; i++) {
        await page.keyboard.press("l");
        await page.keyboard.press(" ");
    }
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press("x");
        await page.keyboard.press("h");
    }
    await page.keyboard.press("u");
    expect(await tileAt(page, 0, 0)).toBe(215);
    expect(await tileAt(page, 1, 0)).toBe(215);
    expect(await tileAt(page, 2, 0)).toBe(215);
});

test("erasing unchanged content leaves the history empty", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press("x"); // grass over grass
    await page.waitForTimeout(500); // let the empty burst flush
    expect(await page.evaluate(() => (window as any).editor.canUndo())).toBe(
        false,
    );
});
