import { test, expect, Page } from "playwright/test";

// Regression test: the EmptySpace/Passable (delete-tool) quick-tool icon must
// render even when the CDN stylesheets fail (offline use). It is a bundled
// inline SVG, not a font glyph. The eraser is no longer in the picker list;
// it lives in the always-visible quick-tools row in the sidebar.
test("eraser picker icon renders with CDN stylesheets blocked", async ({
    page,
}: {
    page: Page;
}) => {
    await page.route("https://cdn.jsdelivr.net/**/*.css", (route) =>
        route.abort(),
    );
    await page.goto("http://localhost:8080/map-editor.html");
    await page.click('label[for="layerObject"]');
    await page.fill("#searchInput", "zzzznomatch");
    await page.waitForTimeout(100);

    // The quick tools stay visible even when the search hides every picker item.
    const icons = page.locator(
        "#quickTools .quick-tool:has(svg.picker-eraser-icon):visible svg.picker-eraser-icon",
    );
    expect(await icons.count()).toBe(1);
    for (const box of await icons.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON()),
    )) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
    }
});
