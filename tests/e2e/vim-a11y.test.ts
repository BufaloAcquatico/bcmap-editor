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

test("toolbar buttons wear the default Bootstrap size", async ({ page }) => {
    await openEditor(page);
    const btn = page.locator("#btnNew");
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
    await expect(help).toContainText("Switch the sidebar to tiles");
    await expect(help).toContainText("Switch the sidebar to objects");
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
    await page.locator("#btnImport").click();
    await page.locator("#importCode").click();
    expect(await page.evaluate(() => (window as any).appSurface.get())).toBe(
        "chrome",
    );
    await expect(help).toContainText("Close and go back");
    await expect(help).not.toContainText("Move around the map");
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
    const mode = page.locator("#statusVimMode");
    const position = page.locator("#statusPosition");
    const selection = page.locator("#statusSelection");
    // Baseline positions with a short selection text.
    const before = {
        mode: await mode.boundingBox(),
        position: await position.boundingBox(),
    };
    // A long selection must not move the mode or position text.
    await selection.evaluate((el) => {
        el.textContent =
            "An extremely long object selection name that must be ellipsized";
    });
    await expect(selection).toHaveCSS("text-overflow", "ellipsis");
    const after = {
        mode: await mode.boundingBox(),
        position: await position.boundingBox(),
    };
    expect(after.mode!.x).toBe(before.mode!.x);
    expect(after.position!.x).toBe(before.position!.x);
    // Only the middle section carries the flexible width.
    await expect(selection).toHaveCSS("flex-grow", "1");
    await expect(mode.locator("xpath=..")).toHaveCSS("flex-grow", "0");
});

test("command prompt widens the left status section while open", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.locator("#mapCanvas").click();
    const modeBox = await page.locator("#statusVimMode").boundingBox();
    await page.keyboard.press(":");
    await expect(page.locator("#commandPrompt")).toBeFocused();
    await expect(page.locator(".status-bar")).toHaveClass(/command-open/);
    const promptBox = await page.locator("#commandPromptWrap").boundingBox();
    // The prompt spans far more than the narrow mode slot did.
    expect(promptBox!.width).toBeGreaterThan(modeBox!.width);
    await page.keyboard.press("Escape");
    await expect(page.locator(".status-bar")).not.toHaveClass(/command-open/);
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
