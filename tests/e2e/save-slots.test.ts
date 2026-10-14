import { test, expect, Page } from "playwright/test";

const openEditor = async (page: Page) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForFunction(() => (window as any).editor !== undefined);
};

const runCommand = async (page: Page, input: string) => {
    await page.keyboard.press(":");
    const prompt = page.locator("#commandPrompt");
    await expect(prompt).toBeVisible();
    // Atomic fill, not per-character typing: immune to dropped keystrokes
    // under parallel-worker load. The typing path itself is covered by
    // vim-commands.test.ts; here only open/submit/feedback matter.
    await prompt.fill(input);
    await page.keyboard.press("Enter");
    await expect(prompt).toBeHidden();
};

const slotNames = (page: Page): Promise<string[]> =>
    page.evaluate(() => {
        const raw = localStorage.getItem("bcmap.v1.slots");
        if (!raw) return [];
        return Object.keys(
            (JSON.parse(raw) as { slots: Record<string, unknown> }).slots,
        );
    });

const paintLongGrassCenter = async (page: Page) => {
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
};

test("captureMapThumbnail returns a JPEG data URL of sane size", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const thumb: string = await page.evaluate(() =>
        (window as any).editor.captureMapThumbnail(),
    );
    expect(thumb.startsWith("data:image/jpeg;base64,")).toBe(true);
    // A 240px JPEG mini-map: far above an empty canvas, far below quota pain.
    expect(thumb.length).toBeGreaterThan(1000);
    expect(thumb.length).toBeLessThan(200000);
});

test(":w saves a slot and shows its name in the status bar", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w garage");
    expect(await slotNames(page)).toEqual(["garage"]);
    await expect(page.locator("#statusSlotName")).toHaveText("garage");
});

test("painting after a save marks the slot dirty", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w garage");
    await paintLongGrassCenter(page);
    await expect(page.locator("#statusSlotName")).toHaveText("garage [+]");
});

test(":w refuses a foreign existing name with E13; :w! overwrites", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w garage");
    await runCommand(page, "w depot");
    await paintLongGrassCenter(page);
    await runCommand(page, "w garage");
    await expect(page.locator("#statusVimMode")).toContainText("E13");
    expect(await slotNames(page)).toEqual(["garage", "depot"]);
    await runCommand(page, "w! garage");
    await expect(page.locator("#statusSlotName")).toHaveText("garage");
});

test("bare :w with no current name reports E32", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w");
    await expect(page.locator("#statusVimMode")).toContainText("E32");
    expect(await slotNames(page)).toEqual([]);
});

test("mode pill follows the vim mode", async ({ page }: { page: Page }) => {
    await openEditor(page);
    const pill = page.locator("#statusVimMode");
    await expect(pill).toHaveClass(/mode-normal/);
    await page.locator("#mapCanvas").click();
    await page.keyboard.press("v");
    await expect(pill).toHaveClass(/mode-visual/);
    await expect(pill).toContainText("-- VISUAL --");
    await page.keyboard.press("Escape");
    await expect(pill).toHaveClass(/mode-normal/);
});

test("Save menu opens the modal prefilled and saves", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w garage");
    await page.click("#menuMapToggle");
    await page.click("#menuSave");
    const modal = page.locator("#saveModal");
    await expect(modal).toBeVisible();
    await expect(page.locator("#saveName")).toHaveValue("garage");
    await page.fill("#saveName", "garage 2");
    await page.click("#btnSaveConfirm");
    await expect(modal).toBeHidden();
    expect(await slotNames(page)).toEqual(["garage", "garage 2"]);
    await expect(page.locator("#statusSlotName")).toHaveText("garage 2");
});
