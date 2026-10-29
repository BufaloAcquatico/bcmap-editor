import { test, expect, Page } from "playwright/test";

const openEditor = async (page: Page) => {
    await page.goto("/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForFunction(() => (window as any).editor !== undefined);
};

const runCommand = async (page: Page, input: string) => {
    await page.keyboard.press(":");
    const prompt = page.locator("#commandPrompt");
    await expect(prompt).toBeVisible();
    await page.keyboard.type(input);
    await page.keyboard.press("Enter");
    await expect(prompt).toBeHidden();
};

const exportedFog = (page: Page, name = "e2e-fog") =>
    page.evaluate((n) => {
        const editor = (window as any).editor;
        const code = editor.exportMap(n);
        const base = code.split("@")[0];
        const json = (window as any).LZString.decompressFromBase64(base);
        const parsed = JSON.parse(json);
        return parsed.Fog;
    }, name);

test("map menu toggles fog and its checkmark", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await expect(page.locator("#fogCheck")).toHaveClass(/invisible/);

    await page.click("#menuMapToggle");
    await page.click("#btnToggleFog");
    await expect(page.locator("#fogCheck")).not.toHaveClass(/invisible/);
    expect(
        await page.evaluate(() => (window as any).editor.isFogEnabled()),
    ).toBe(true);

    await page.click("#menuMapToggle");
    await page.click("#btnToggleFog");
    await expect(page.locator("#fogCheck")).toHaveClass(/invisible/);
    expect(
        await page.evaluate(() => (window as any).editor.isFogEnabled()),
    ).toBe(false);
});

test(":fog command toggles, sets and clears fog", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "fog");
    expect(
        await page.evaluate(() => (window as any).editor.isFogEnabled()),
    ).toBe(true);
    await runCommand(page, "fog off");
    expect(
        await page.evaluate(() => (window as any).editor.isFogEnabled()),
    ).toBe(false);
    await runCommand(page, "fog on");
    expect(
        await page.evaluate(() => (window as any).editor.isFogEnabled()),
    ).toBe(true);
});

test("export modal mirrors and updates fog live", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "fog on");

    await page.click("#menuMapToggle");
    await page.click("#btnExport");
    const checkbox = page.locator("#exportFog");
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    expect(
        await page.evaluate(() => (window as any).editor.isFogEnabled()),
    ).toBe(false);
    await expect(checkbox).not.toBeChecked();

    await page.keyboard.press("Escape");
});

test("undo and redo restore fog and its UI", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "fog on");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(100);
    expect(
        await page.evaluate(() => (window as any).editor.isFogEnabled()),
    ).toBe(false);
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(100);
    expect(
        await page.evaluate(() => (window as any).editor.isFogEnabled()),
    ).toBe(true);
});

test("exported map carries the fog boolean", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "fog on");
    expect(await exportedFog(page)).toBe(true);

    await runCommand(page, "fog off");
    expect(await exportedFog(page)).toBeUndefined();
});
