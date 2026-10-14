import { test, expect, Page } from "playwright/test";

test("captureMapThumbnail returns a JPEG data URL of sane size", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto("http://localhost:8080/map-editor.html");
    const thumb: string = await page.evaluate(() =>
        (window as any).editor.captureMapThumbnail(),
    );
    expect(thumb.startsWith("data:image/jpeg;base64,")).toBe(true);
    // A 240px JPEG mini-map: far above an empty canvas, far below quota pain.
    expect(thumb.length).toBeGreaterThan(1000);
    expect(thumb.length).toBeLessThan(200000);
});
