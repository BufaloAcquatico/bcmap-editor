import { test, expect, Page } from "playwright/test";

// Regression test: Blank (delete-tool) picker icons must render even when
// the CDN stylesheets fail (offline use). They are bundled inline SVG, not
// font glyphs. Only stylesheets are blocked: the editor bundle needs the
// CDN-served JS (LZString/Bootstrap) to boot, which is a separate,
// out-of-scope dependency.
test("blank picker eraser icons render with CDN stylesheets blocked", async ({
    page,
}: {
    page: Page;
}) => {
    await page.route("https://cdn.jsdelivr.net/**/*.css", (route) =>
        route.abort(),
    );
    await page.goto("http://localhost:8080/map-editor.html");
    await page.click('label[for="layerObject"]');
    await page.fill("#searchInput", "Blank");
    await page.waitForTimeout(100);

    const icons = page.locator(
        "#objectCategories .sprite-item:has(svg.picker-eraser-icon):visible svg.picker-eraser-icon",
    );
    // 4 object groups carry a Blank entry (Banners has none).
    expect(await icons.count()).toBe(4);
    for (const box of await icons.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON()),
    )) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
    }
});
