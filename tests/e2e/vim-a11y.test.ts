import { test, expect, Page } from "playwright/test";

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

test("arrow keys walk headers then sprites (D2)", async ({
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
    // Down moves to the next sprite
    await page.keyboard.press("ArrowDown");
    expect(
        await page.evaluate(() =>
            document.activeElement?.isSameNode(
                document.querySelectorAll("#tileCategories .sprite-item")[1],
            ),
        ),
    ).toBe(true);
    // Up from the first sprite lands on the category header
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    const focusedIsHeader = await page.evaluate(() =>
        document.activeElement?.classList.contains("category-header"),
    );
    expect(focusedIsHeader).toBe(true);
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

test("help card renders from the keybind registry", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const help = page.locator("#controlsHelp");
    await expect(help).toContainText("Move cursor (counts, 0, $, gg)");
    await expect(help).toContainText("Command line (w/e/help/grid/line)");
    await expect(help).toContainText(
        "Navigate picker (groups: collapse/expand)",
    );
});
