import { test, expect, Page } from "playwright/test";

// Motion assertions read end states: run reduced-motion so ring fades
// and smooth scroll settle instantly instead of mid-transition.
test.use({ reducedMotion: "reduce" });

const openEditor = async (page: Page) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForFunction(() => (window as any).editor !== undefined);
};

const activeId = (page: Page) =>
    page.evaluate(
        () =>
            document.activeElement?.id ??
            document.activeElement?.className ??
            "none",
    );

test("picker items are real buttons with accessible names", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const item = page.locator("#tileCategories .sprite-item").first();
    await expect(item).toHaveJSProperty("tagName", "BUTTON");
    await expect(item).toHaveAttribute("tabindex", "-1");
    await expect(item).toHaveAttribute("aria-pressed", /true|false/);
    const header = page.locator("#tileCategories .category-header").first();
    await expect(header).toHaveJSProperty("tagName", "BUTTON");
    await expect(header).toHaveAttribute("aria-expanded", /true|false/);
});

test("menu toggles wear the default Bootstrap size", async ({ page }) => {
    await openEditor(page);
    const btn = page.locator("#menuMapToggle");
    const size = await btn.evaluate((el) => {
        const s = getComputedStyle(el);
        return { font: s.fontSize, pad: `${s.paddingTop} ${s.paddingLeft}` };
    });
    // Bootstrap default btn: 1rem/16px font, .375rem/.75rem -> 6px 12px padding.
    // btn-sm was 14px / 4px 8px.
    expect(size).toEqual({ font: "16px", pad: "6px 12px" });
    // Still a comfortable hit target.
    const box = await btn.boundingBox();
    expect(box!.height).toBeGreaterThan(30);
    // The wider buttons must not wrap or overflow a narrow viewport.
    await page.setViewportSize({ width: 800, height: 600 });
    const toolbar = await page.locator(".toolbar").evaluate((el) => ({
        scroll: el.scrollWidth,
        client: el.clientWidth,
    }));
    expect(toolbar.scroll).toBeLessThanOrEqual(toolbar.client);
    await page.setViewportSize({ width: 1280, height: 720 });
});

test("category headers wear the thin theme border on all sides", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const header = page.locator("#tileCategories .category-header").first();
    const border = await header.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
            top: s.borderTopWidth,
            right: s.borderRightWidth,
            bottom: s.borderBottomWidth,
            left: s.borderLeftWidth,
            color: s.borderTopColor,
        };
    });
    expect(border).toEqual({
        top: "1px",
        right: "1px",
        bottom: "1px",
        left: "1px",
        color: "rgb(42, 42, 74)",
    });
});

test("all outlines share the hover white; glow marks selection", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const white = "rgba(255, 255, 255, 0.9)";
    // Focused header ring is the white.
    const header = page.locator("#tileCategories .category-header").first();
    await header.click();
    await expect(header).toBeFocused();
    expect(
        await header.evaluate((el) => getComputedStyle(el).outlineColor),
    ).toBe(white);
    // Selected sprite: white border plus white glow.
    const sprite = page.locator("#tileCategories .sprite-item").first();
    await sprite.click();
    const selected = await sprite.evaluate((el) => {
        const s = getComputedStyle(el);
        return { border: s.borderTopColor, shadow: s.boxShadow };
    });
    expect(selected.border).toBe(white);
    expect(selected.shadow).toContain("rgba(255, 255, 255, 0.5)");
    // Focus leaves for the map: selection keeps white border and glow.
    await page.keyboard.press("Tab");
    await expect(page.locator("#mapCanvas")).toBeFocused();
    const kept = await sprite.evaluate((el) => {
        const s = getComputedStyle(el);
        return { border: s.borderTopColor, shadow: s.boxShadow };
    });
    expect(kept.border).toBe(white);
    expect(kept.shadow).toContain("rgba(255, 255, 255, 0.5)");
});

test("selecting a sprite marks it pressed", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.locator("#tileCategories .category-header").first().click();
    const item = page.locator("#tileCategories .sprite-item").first();
    await item.click();
    await expect(item).toHaveAttribute("aria-pressed", "true");
});

test("visual grid: Right walks the row, Up from first row lands on header", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    // expand the first tile category
    await page.locator("#tileCategories .category-header").first().click();
    // click a sprite to put focus inside the sidebar
    const firstSprite = page.locator("#tileCategories .sprite-item").first();
    await firstSprite.click();
    // Right moves to the next sprite in the row
    await page.keyboard.press("ArrowRight");
    expect(
        await page.evaluate(() =>
            document.activeElement?.isSameNode(
                document.querySelectorAll("#tileCategories .sprite-item")[1],
            ),
        ),
    ).toBe(true);
    // Left returns to the first sprite; Left at the first column pins
    await page.keyboard.press("ArrowLeft");
    expect(
        await page.evaluate(() =>
            document.activeElement?.isSameNode(
                document.querySelectorAll("#tileCategories .sprite-item")[0],
            ),
        ),
    ).toBe(true);
    await page.keyboard.press("ArrowLeft");
    expect(
        await page.evaluate(() =>
            document.activeElement?.isSameNode(
                document.querySelectorAll("#tileCategories .sprite-item")[0],
            ),
        ),
    ).toBe(true);
    // Up from the first row lands on the category header
    await page.keyboard.press("ArrowUp");
    const focusedIsHeader = await page.evaluate(() =>
        document.activeElement?.classList.contains("category-header"),
    );
    expect(focusedIsHeader).toBe(true);
    // Down from the header returns to the first sprite
    await page.keyboard.press("ArrowDown");
    expect(
        await page.evaluate(() =>
            document.activeElement?.isSameNode(
                document.querySelectorAll("#tileCategories .sprite-item")[0],
            ),
        ),
    ).toBe(true);
});

test("left/right collapse and expand the focused category", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const header = page.locator("#tileCategories .category-header").first();
    await header.click(); // expand
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowRight");
    await expect(header).toHaveAttribute("aria-expanded", "true");
});

test("typing in the sidebar focuses search; Escape returns to the map", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.locator("#tileCategories .category-header").first().click();
    await page.keyboard.press("f");
    await expect(page.locator("#searchInput")).toBeFocused();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator("#mapCanvas")).toBeFocused();
});

test("modals expose dialog roles", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await expect(page.locator("#importModal")).toHaveAttribute(
        "aria-modal",
        "true",
    );
    await expect(page.locator("#importModal")).toHaveAttribute(
        "role",
        "dialog",
    );
    await expect(page.locator("#searchInput")).toHaveAttribute(
        "aria-label",
        "Search tiles and objects",
    );
});

test("help card shows the tracked surface slice", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const help = page.locator("#controlsHelp");
    const surface = () => page.evaluate(() => (window as any).appSurface.get());
    // Map surface: paint keys, no picker grid row.
    await page.locator("#mapCanvas").click();
    expect(await surface()).toBe("map");
    await expect(help).toContainText("Move around the map");
    await expect(help).toContainText("Type a command");
    await expect(help).toContainText("Zoom in");
    await expect(help).toContainText("Zoom out");
    await expect(help).not.toContainText("Move through the tile list");
    // Sectioned layout: surface label plus one shared key grid.
    await expect(help.locator(".help-surface-label")).toHaveText("Map keys");
    await expect(help.locator(".help-section-label")).toContainText([
        "Mouse",
        "Cursor",
    ]);
    await expect(help.locator(".help-sections").first()).toHaveCSS(
        "display",
        "grid",
    );
    // Picker surface via keyboard: grid row appears, map row hides.
    await page.keyboard.press("Tab");
    expect(await surface()).toBe("picker");
    await expect(help).toContainText("Move through the tile list");
    await expect(help).not.toContainText("Move around the map");
    await expect(help.locator(".help-surface-label")).toHaveText(
        "Sidebar keys",
    );
    await expect(help.locator(".help-section-label")).toContainText([
        "Mouse",
        "Navigate",
    ]);
    // Picker surface via mouse: clicking a sprite tracks too.
    await page.locator("#tileCategories .category-header").first().click();
    await page.locator("#tileCategories .sprite-item").first().click();
    expect(await surface()).toBe("picker");
    await expect(help).toContainText("Move through the tile list");
    // Search surface via mouse: first-match row, no map row.
    await page.locator("#searchInput").click();
    expect(await surface()).toBe("search");
    await expect(help).toContainText("Pick the tile");
    await expect(help).not.toContainText("Move around the map");
    // Bracket layer-switch keys are map-scoped and dead inside editable
    // targets, so the search slice must not list them.
    // Show-all toggle restores the full registry list.
    await help.getByRole("button", { name: /show all keys/i }).click();
    await expect(help).toContainText("Move around the map");
    await expect(help).toContainText("Move through the tile list");
    await expect(help.locator(".help-surface-label")).toHaveText("All keys");
});

test("help keeps a note while a visual region leaves the map", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const help = page.locator("#controlsHelp");
    await page.locator("#mapCanvas").click();
    await page.keyboard.press("v");
    await page.keyboard.press("Tab");
    await expect(help).toContainText("Your selection is kept");
    await expect(page.locator("#mapCanvas")).not.toBeFocused();
});

test("modal focus tracks as chrome with dialog help", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const help = page.locator("#controlsHelp");
    await page.locator("#menuMapToggle").click();
    await page.locator("#btnImport").click();
    await page.locator("#importCode").click();
    expect(await page.evaluate(() => (window as any).appSurface.get())).toBe(
        "chrome",
    );
    await expect(help).toContainText("Close and go back");
    await expect(help).not.toContainText("Move around the map");
});

test.describe("layer switch with motion allowed", () => {
    // The file defaults to reduced motion (instant rings/fades); the
    // sliding thumb needs the normal tier to observe its transition.
    test.use({ reducedMotion: "no-preference" });

    test("layer switch slides its thumb over the shared token", async ({
        page,
    }: {
        page: Page;
    }) => {
        await openEditor(page);
        const switchEl = page.locator(".layer-switch");
        const thumb = page.locator(".layer-switch-thumb");
        const tileThumb = await thumb.evaluate(
            (el) => getComputedStyle(el).transform,
        );
        await page.keyboard.press("]");
        await expect(page.locator("#layerObject")).toBeChecked();
        // Slides over the shared motion token (init.ts mirrors 150ms).
        await expect(thumb).toHaveCSS("transition-duration", "0.15s");
        await expect(thumb).toHaveCSS("transform", /matrix/);
        await page.waitForTimeout(400); // MOTION_MS + slack
        const objectThumb = await thumb.evaluate(
            (el) => getComputedStyle(el).transform,
        );
        expect(objectThumb).not.toBe(tileThumb);
        // Still real labels with accessible names, not decorative divs.
        await expect(switchEl.getByText("Tile")).toBeVisible();
        await expect(switchEl.getByText("Object")).toBeVisible();
    });
});

test("layer switch thumb does not animate under reduced motion", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const thumb = page.locator(".layer-switch-thumb");
    await expect(thumb).toHaveCSS("transition-duration", "0s");
    await page.keyboard.press("]");
    await expect(page.locator("#layerObject")).toBeChecked();
});

test("[ and ] switch the picker layer from the keyboard", async ({ page }) => {
    await openEditor(page);
    await page.locator("#mapCanvas").click();
    const tileRadio = page.locator("#layerTile");
    const objectRadio = page.locator("#layerObject");
    await expect(tileRadio).toBeChecked();
    await page.keyboard.press("]");
    await expect(objectRadio).toBeChecked();
    await expect(page.locator("#objectCategories")).toBeVisible();
    await expect(page.locator("#tileCategories")).not.toBeVisible();
    await page.keyboard.press("[");
    await expect(tileRadio).toBeChecked();
    await expect(page.locator("#tileCategories")).toBeVisible();
    // Typing brackets in the search box must not switch layers.
    await page.keyboard.press("/");
    await page.locator("#searchInput").fill("[");
    await expect(tileRadio).toBeChecked();
    await page.keyboard.press("Escape");
});

test("status bar keeps fixed sections as the selection text changes", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.locator("#mapCanvas").click();
    // The mode *section*: #statusVimMode is now a shrink-to-fit pill, so the
    // thirds invariant is measured on its section, as the intent requires.
    const mode = page.locator(".status-mode");
    const position = page.locator("#statusPosition");
    const selection = page.locator("#statusSelection");
    // Baseline positions with a short selection text.
    const centerOffset = () =>
        selection.evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const text = range.getBoundingClientRect();
            const section = el.getBoundingClientRect();
            return Math.abs(
                (text.left + text.right) / 2 -
                    (section.left + section.right) / 2,
            );
        });
    const boxes = () =>
        Promise.all(
            [mode, selection, position].map((loc) => loc.boundingBox()),
        );
    // The three sections split the bar into equal thirds.
    const [modeBox, selectionBox, positionBox] = await boxes();
    expect(selectionBox!.width).toBeGreaterThan(0);
    expect(Math.abs(modeBox!.width - selectionBox!.width)).toBeLessThan(4);
    expect(Math.abs(positionBox!.width - selectionBox!.width)).toBeLessThan(4);
    // Short text sits in the middle of the middle section.
    expect(await centerOffset()).toBeLessThan(6);
    // A long selection must not move anything else…
    await selection.evaluate((el) => {
        el.textContent =
            "An extremely long object selection name that must be ellipsized";
    });
    await expect(selection).toHaveCSS("text-overflow", "ellipsis");
    // …and neither must a longer position readout: widths stay put.
    await position.evaluate((el) => {
        el.textContent = "Position: (39, 39) zoomed";
    });
    const [modeAfter, selectionAfter, positionAfter] = await boxes();
    for (const [a, b] of [
        [modeBox, modeAfter],
        [selectionBox, selectionAfter],
        [positionBox, positionAfter],
    ]) {
        expect(a!.x).toBe(b!.x);
        expect(a!.width).toBe(b!.width);
    }
    // Clipped text stays centered too.
    expect(await centerOffset()).toBeLessThan(6);
});

test("command prompt opens inside the left section, nothing moves", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.locator("#mapCanvas").click();
    // The mode readout itself hides while typing (replaced by the prompt),
    // so pin the three *sections* - they persist in every mode.
    const sections = () =>
        Promise.all(
            [".status-mode", "#statusSelection", "#statusPosition"].map((sel) =>
                page.locator(sel).boundingBox(),
            ),
        );
    const before = await sections();
    await page.keyboard.press(":");
    await expect(page.locator("#commandPrompt")).toBeFocused();
    // The prompt lives inside the left section: every section keeps
    // its box, and every section stays visible.
    const wrap = page.locator("#commandPromptWrap");
    await expect(wrap).toBeVisible();
    const modeSection = page.locator(".status-mode");
    const wrapBox = await wrap.boundingBox();
    const modeBox = await modeSection.boundingBox();
    expect(wrapBox!.x).toBeGreaterThanOrEqual(modeBox!.x - 1);
    expect(wrapBox!.x + wrapBox!.width).toBeLessThanOrEqual(
        modeBox!.x + modeBox!.width + 1,
    );
    await expect(page.locator("#statusSelection")).toBeVisible();
    await expect(page.locator("#statusPosition")).toBeVisible();
    const during = await sections();
    for (const [a, b] of [
        [before[0], during[0]],
        [before[1], during[1]],
        [before[2], during[2]],
    ]) {
        expect(b!.x).toBe(a!.x);
        expect(b!.width).toBe(a!.width);
    }
    // Typing still works on top, and closing restores the bar exactly.
    await page.keyboard.type("grid");
    await expect(page.locator("#commandPrompt")).toHaveValue("grid");
    await page.keyboard.press("Escape");
    await expect(wrap).toBeHidden();
    const after = await sections();
    for (const [a, b] of [
        [before[0], after[0]],
        [before[1], after[1]],
        [before[2], after[2]],
    ]) {
        expect(b!.x).toBe(a!.x);
        expect(b!.width).toBe(a!.width);
    }
});

test("search Enter goes to first match, Tab returns to map", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press("/");
    await expect(page.locator("#searchInput")).toBeFocused();
    await page.locator("#searchInput").fill("Grass");
    await page.keyboard.press("Enter");
    const focusedIsSprite = await page.evaluate(() =>
        document.activeElement?.classList.contains("sprite-item"),
    );
    expect(focusedIsSprite).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#mapCanvas")).toBeFocused();
    // Tab from search returns to the map, keeping the query
    await page.keyboard.press("/");
    await page.locator("#searchInput").fill("Grass");
    await page.keyboard.press("Tab");
    await expect(page.locator("#mapCanvas")).toBeFocused();
    await expect(page.locator("#searchInput")).toHaveValue("Grass");
});

test("Enter with no matches stays in search", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press("/");
    await page.locator("#searchInput").fill("zzz-no-such-tile");
    await page.keyboard.press("Enter");
    await expect(page.locator("#searchInput")).toBeFocused();
    await expect(page.locator("#searchInput")).toHaveValue("zzz-no-such-tile");
});

test("command surface help lists command rows", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const help = page.locator("#controlsHelp");
    await page.locator("#mapCanvas").click();
    await page.keyboard.press(":");
    await expect(page.locator("#commandPrompt")).toBeFocused();
    await expect(help).toContainText("Run what you typed");
    await expect(help).toContainText("Show earlier commands");
    await expect(help).not.toContainText("Move around the map");
    // Command mode lists every available command with its syntax.
    await expect(help).toContainText(":w [name]");
    await expect(help).toContainText("Save the map");
    await expect(help).toContainText(":line x1,y1 x2,y2");
    await expect(help).toContainText("Draw a straight line of tiles");
    await page.keyboard.press("Escape");
});

test("Tab toggles map and picker, Enter on sprite selects and returns", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.locator("#mapCanvas").click();
    await page.keyboard.press("Tab");
    const inPicker = await page.evaluate(
        () =>
            document.activeElement?.classList.contains("sprite-item") ||
            document.activeElement?.classList.contains("category-header"),
    );
    expect(inPicker).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.locator("#mapCanvas")).toBeFocused();
    // Enter on a sprite commits the selection and returns to the map.
    // Resume may land on a collapsed header: Enter expands, Down reaches
    // the first sprite, Enter commits. If already on a sprite the first
    // Enter commits and the extras paint harmlessly on the map.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("#mapCanvas")).toBeFocused();
    await expect(page.locator("#statusSelection")).not.toHaveText(
        "No selection",
    );
});

test("colon in picker opens the command line, not search", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.locator("#mapCanvas").click();
    await page.keyboard.press("Tab");
    const inPicker = await page.evaluate(
        () =>
            document.activeElement?.classList.contains("sprite-item") ||
            document.activeElement?.classList.contains("category-header"),
    );
    expect(inPicker).toBe(true);
    await page.keyboard.press(":");
    await expect(page.locator("#commandPrompt")).toBeVisible();
    await expect(page.locator("#commandPrompt")).toBeFocused();
    await expect(page.locator("#searchInput")).not.toBeFocused();
});
