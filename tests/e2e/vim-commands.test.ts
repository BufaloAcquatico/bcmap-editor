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

const runCommand = async (page: Page, input: string) => {
    await page.keyboard.press(":");
    const prompt = page.locator("#commandPrompt");
    await expect(prompt).toBeVisible();
    await page.keyboard.type(input);
    await page.keyboard.press("Enter");
    await expect(prompt).toBeHidden();
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

test(": opens the command prompt in the mode slot", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await expect(page.locator("#commandPrompt")).toBeVisible();
    await expect(page.locator("#statusVimMode")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("#commandPrompt")).toBeHidden();
    await expect(page.locator("#statusVimMode")).toBeVisible();
});

test(":grid and :help toggle their features", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "grid");
    expect(
        await page.evaluate(() => (window as any).editor.getGridVisible()),
    ).toBe(false);
    await runCommand(page, "grid");
    expect(
        await page.evaluate(() => (window as any).editor.getGridVisible()),
    ).toBe(true);
    await runCommand(page, "help");
    await expect(page.locator("#controlsHelp")).toBeHidden();
});

test(":w exports the map as a download", async ({ page }: { page: Page }) => {
    await openEditor(page);
    const [download] = await Promise.all([
        page.waitForEvent("download"),
        (async () => {
            await page.keyboard.press(":");
            await page.keyboard.type("w e2e-map");
            await page.keyboard.press("Enter");
        })(),
    ]);
    expect(download.suggestedFilename()).toBe("e2e-map.txt");
});

test(":line paints a straight line on the active layer", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await selectLongGrass(page);
    await runCommand(page, "line 5,5 9,5");
    expect(await tileAt(page, 5, 5)).toBe(215);
    expect(await tileAt(page, 7, 5)).toBe(215);
    expect(await tileAt(page, 9, 5)).toBe(215);
    expect(await tileAt(page, 10, 5)).toBe(210);
});

test("unknown commands show a transient E492 message", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "nope");
    await expect(page.locator("#statusVimMode")).toHaveText(
        "E492: Not an editor command: nope",
    );
});

test("/ focuses the picker search box", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await page.keyboard.press("/");
    await expect(page.locator("#searchInput")).toBeFocused();
    await page.keyboard.press("Escape");
});
