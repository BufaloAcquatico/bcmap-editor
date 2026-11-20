import { test, expect, Page } from "playwright/test";

// Regression test: the EmptySpace/Passable (delete-tool) picker icon must
// render even when the CDN stylesheets fail (offline use). It is a bundled
// inline SVG, not a font glyph. Only stylesheets are blocked: the editor
// bundle needs the CDN-served JS (LZString/Bootstrap) to boot, which is a
// separate, out-of-scope dependency.
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
    await page.fill("#searchInput", "Passable");
    await page.waitForTimeout(100);

    const icons = page.locator(
        "#objectCategories .sprite-item:has(svg.picker-eraser-icon):visible svg.picker-eraser-icon",
    );
    // R134 has one visible eraser; the 21 deprecated blank IDs are hidden.
    expect(await icons.count()).toBe(1);
    for (const box of await icons.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON()),
    )) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
    }
});
