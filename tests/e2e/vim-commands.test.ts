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

test(":w saves a slot; :export downloads the map as a file", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w e2e-map");
    const names = await page.evaluate(() =>
        Object.keys(
            JSON.parse(localStorage.getItem("bcmap.v1.slots") ?? '{"slots":{}}')
                .slots,
        ),
    );
    expect(names).toEqual(["e2e-map"]);
    const [download] = await Promise.all([
        page.waitForEvent("download"),
        runCommand(page, "export e2e-map"),
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

test("command line opens seamlessly without moving the status bar", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const bar = page.locator(".status-bar");
    const heightBefore = (await bar.boundingBox())?.height;
    await page.keyboard.press(":");
    const prompt = page.locator("#commandPrompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toBeFocused();
    await expect(page.locator("#commandPromptPrefix")).toBeVisible();
    await expect(page.locator("#commandPromptPrefix")).toHaveText(":");
    // No box chrome: transparent, borderless status typography.
    expect(
        await prompt.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    expect(
        await prompt.evaluate((el) => getComputedStyle(el).borderTopWidth),
    ).toBe("0px");
    // Zero layout shift while open and after running a command.
    expect((await bar.boundingBox())?.height).toBe(heightBefore);
    await page.keyboard.type("grid");
    await page.keyboard.press("Enter");
    await expect(prompt).toBeHidden();
    expect((await bar.boundingBox())?.height).toBe(heightBefore);
});

test("canvas focus ring stays off however focus arrives", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const canvas = page.locator("#mapCanvas");
    const outlineStyle = () =>
        canvas.evaluate((el) => getComputedStyle(el).outlineStyle);
    // Mouse-click focus, command-open blur, programmatic focus on close:
    // the gold cursor already signals focus, so no browser ring may pop.
    await canvas.click();
    expect(await outlineStyle()).toBe("none");
    await page.keyboard.press(":");
    expect(await outlineStyle()).toBe("none");
    await page.keyboard.press("Escape");
    await expect(canvas).toBeFocused();
    expect(await outlineStyle()).toBe("none");
});

test("clicking away cancels the command prompt and restores the mode", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await expect(page.locator("#commandPrompt")).toBeVisible();
    await page.locator("#mapCanvas").click();
    await expect(page.locator("#commandPrompt")).toBeHidden();
    await expect(page.locator("#statusVimMode")).toBeVisible();
});

test("Tab out of the prompt cancels it and restores the mode", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await expect(page.locator("#commandPrompt")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.locator("#commandPrompt")).toBeHidden();
    await expect(page.locator("#statusVimMode")).toBeVisible();
});

test("Esc after click-away keeps the mode visible", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await page.locator("#mapCanvas").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#commandPrompt")).toBeHidden();
    await expect(page.locator("#statusVimMode")).toBeVisible();
    expect(await modeText(page)).toBe("-- NORMAL --");
});
