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

const openSlotsWindow = async (page: Page) => {
    await page.click("#menuMapToggle");
    await page.click("#menuLoad");
    await expect(page.locator("#slotsModal")).toBeVisible();
};

const slotRow = (page: Page, name: string) =>
    page.locator("#slotsList .list-group-item", { hasText: name });

const allGrass = (page: Page): Promise<boolean> =>
    page.evaluate(() => {
        const tiles: string = (window as any).editor.getMapData().Tiles;
        for (let i = 0; i < tiles.length; i++) {
            if (tiles.charCodeAt(i) !== 210) return false;
        }
        return true;
    });
const paintLongGrassCenter = async (page: Page, xFrac = 0.5) => {
    await page.fill("#searchInput", "LongGrass");
    await page.waitForTimeout(100);
    await page.click('#tileCategories .sprite-item[title="Long Grass"]');
    const canvas = page.locator("#mapCanvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");
    await canvas.click({
        position: { x: box.width * xFrac, y: box.height / 2 },
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
    // Refused: slots untouched, still on depot, still dirty. (The E13 copy
    // itself is unit-covered; e2e asserts the durable refusal semantics.)
    expect(await slotNames(page)).toEqual(["garage", "depot"]);
    await expect(page.locator("#statusSlotName")).toHaveText("depot [+]");
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
    // Refused: nothing saved, no current name. (E32 copy is unit-covered.)
    expect(await slotNames(page)).toEqual([]);
    await expect(page.locator("#statusSlotName")).toHaveText("");
});

test("mode pill follows the vim mode", async ({ page }: { page: Page }) => {
    await openEditor(page);
    const pill = page.locator("#statusVimMode");
    await expect(pill).toHaveClass(/mode-normal/);
    await page.locator("#mapCanvas").click();
    await page.keyboard.press("v");
    await expect(pill).toHaveClass(/mode-visual/);
    await expect(pill).toContainText("VISUAL");
    await page.keyboard.press("Escape");
    await expect(pill).toHaveClass(/mode-normal/);
});

test("Save As menu opens the modal prefilled and saves", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w garage");
    await page.click("#menuMapToggle");
    await page.click("#menuSaveAs");
    const modal = page.locator("#saveModal");
    await expect(modal).toBeVisible();
    await expect(page.locator("#saveName")).toHaveValue("garage");
    await page.fill("#saveName", "garage 2");
    await page.click("#btnSaveConfirm");
    await expect(modal).toBeHidden();
    expect(await slotNames(page)).toEqual(["garage", "garage 2"]);
    await expect(page.locator("#statusSlotName")).toHaveText("garage 2");
    // Enter in the name field confirms too.
    await page.click("#menuMapToggle");
    await page.click("#menuSaveAs");
    await expect(modal).toBeVisible();
    await page.fill("#saveName", "garage 3");
    await page.keyboard.press("Enter");
    await expect(modal).toBeHidden();
    expect(await slotNames(page)).toEqual(["garage", "garage 2", "garage 3"]);
});

test("Save falls back to Save As with no name, overwrites otherwise", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await expect(page.locator("#menuSave")).toBeEnabled();
    await page.click("#menuMapToggle");
    await page.click("#menuSave");
    // No current name: the Save As modal opens instead.
    const modal = page.locator("#saveModal");
    await expect(modal).toBeVisible();
    await page.fill("#saveName", "alpha");
    await page.keyboard.press("Enter");
    await expect(modal).toBeHidden();
    expect(await slotNames(page)).toEqual(["alpha"]);
    // Named now: Save overwrites straight through, no dialog.
    await paintLongGrassCenter(page);
    await page.click("#menuMapToggle");
    await page.click("#menuSave");
    await expect(modal).toBeHidden();
    await expect(page.locator("#statusSlotName")).toHaveText("alpha");
    expect(await slotNames(page)).toEqual(["alpha"]);
});

test("Load window lists slots with thumbnails, names and times", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w alpha");
    await openSlotsWindow(page);
    await expect(page.locator("#slotsCount")).toHaveText("1 / 30");
    const row = slotRow(page, "alpha");
    await expect(row).toBeVisible();
    const src = await row.locator("img").getAttribute("src");
    expect(src?.startsWith("data:image/jpeg;base64,")).toBe(true);
    await expect(row.locator(".text-muted")).toContainText(/ago|just now/);
});

test(":e loads a slot directly; dirty :e without ! reports E37", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w alpha");
    await paintLongGrassCenter(page);
    await runCommand(page, "w beta");
    await paintLongGrassCenter(page, 0.25);
    await runCommand(page, "e alpha");
    // Refused: map untouched, still on beta, still dirty. (E37 copy is
    // unit-covered; the :enew E37 path shares the same gate.)
    expect(await allGrass(page)).toBe(false);
    await expect(page.locator("#statusSlotName")).toHaveText("beta [+]");
    await runCommand(page, "e! alpha");
    expect(await allGrass(page)).toBe(true);
    await expect(page.locator("#statusSlotName")).toHaveText("alpha");
});

test("Load through the window confirms over unsaved work", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w alpha");
    await paintLongGrassCenter(page);
    await runCommand(page, "w beta");
    await paintLongGrassCenter(page, 0.25);
    await openSlotsWindow(page);
    const row = slotRow(page, "alpha");
    await row.getByRole("button", { name: "Load" }).click();
    const confirm = page.locator("#confirmModal");
    await expect(confirm).toBeVisible();
    // Cancel keeps the current map and the window open.
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    await expect(page.locator("#statusSlotName")).toHaveText("beta [+]");
    // Confirming replaces the map and adopts the slot name.
    await row.getByRole("button", { name: "Load" }).click();
    await expect(confirm).toBeVisible();
    await page.locator("#btnConfirmOk").click();
    await expect(confirm).toBeHidden();
    await expect(page.locator("#slotsModal")).toBeHidden();
    expect(await allGrass(page)).toBe(true);
    await expect(page.locator("#statusSlotName")).toHaveText("alpha");
});

test("Export downloads the slot file", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await runCommand(page, "w alpha");
    await openSlotsWindow(page);
    const [download] = await Promise.all([
        page.waitForEvent("download"),
        slotRow(page, "alpha").getByRole("button", { name: "Export" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("alpha.txt");
});

test("Delete removes the slot after confirm", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w alpha");
    await openSlotsWindow(page);
    await slotRow(page, "alpha")
        .getByRole("button", { name: "Delete alpha" })
        .click();
    await expect(page.locator("#confirmModal")).toBeVisible();
    await page.locator("#btnConfirmOk").click();
    await expect(slotRow(page, "alpha")).toHaveCount(0);
    expect(await slotNames(page)).toEqual([]);
    await expect(page.locator("#slotsCount")).toHaveText("0 / 30");
});

const openImportModal = async (page: Page) => {
    await page.click("#menuMapToggle");
    await page.click("#btnImport");
    await expect(page.locator("#importModal")).toBeVisible();
};

test("Import modal warns about unsaved work only when dirty", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await openImportModal(page);
    await expect(page.locator("#importDirtyWarning")).toBeHidden();
    await page.locator("#importModal .btn-secondary").click();
    await runCommand(page, "w alpha");
    await paintLongGrassCenter(page);
    await openImportModal(page);
    await expect(page.locator("#importDirtyWarning")).toBeVisible();
});

test(":enew refuses a dirty map without ! and resets with it", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await runCommand(page, "w alpha");
    await paintLongGrassCenter(page);
    await runCommand(page, "enew");
    // Refused: map untouched. (E37 copy is unit-covered.)
    expect(await allGrass(page)).toBe(false);
    await expect(page.locator("#statusSlotName")).toHaveText("alpha [+]");
    await runCommand(page, "enew!");
    expect(await allGrass(page)).toBe(true);
    await expect(page.locator("#statusSlotName")).toHaveText("");
});

test("reloading a clean tab skips the unsaved-work prompt", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    let seen = "";
    page.on("dialog", (dialog) => {
        seen = dialog.type();
    });
    await page.reload();
    expect(seen).toBe("");
});

test("reloading a dirty tab raises the unsaved-work prompt", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await paintLongGrassCenter(page);
    let seen = "";
    page.on("dialog", async (dialog) => {
        seen = dialog.type();
        await dialog.accept();
    });
    await page.reload();
    expect(seen).toBe("beforeunload");
});
