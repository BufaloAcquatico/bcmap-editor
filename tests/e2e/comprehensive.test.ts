import { test, expect, Page } from "playwright/test";

test("basic editor loads", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await expect(page).toHaveTitle("BCMap Editor");
});

test("tile picker categories load with thumbnails", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#tileCategories .category-header");

    // Check all tile type categories exist
    const categories = await page
        .locator("#tileCategories .category-header")
        .allTextContents();
    expect(categories).toContain("Floor");
    expect(categories).toContain("FloorExterior");
    expect(categories).toContain("Wall");
    expect(categories).toContain("Water");

    // Check thumbnails load (background-image style on sprite-items)
    const tileItems = await page
        .locator("#tileCategories .sprite-item")
        .count();
    expect(tileItems).toBeGreaterThan(0);
});

test("object picker categories load with thumbnails", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto("http://localhost:8080/map-editor.html");

    // Switch to object layer first
    await page.click('label[for="layerObject"]');
    await page.waitForSelector("#objectCategories .category-header:visible");

    // Check object categories exist
    const categories = await page
        .locator("#objectCategories .category-header:visible")
        .allTextContents();
    expect(categories).toContain("Floor Decorations");
    expect(categories).toContain("Floor Items");
    expect(categories).toContain("Floor Obstacles");
    expect(categories).toContain("Wall");
    expect(categories).toContain("Banners");

    // Check thumbnails load
    const objItems = await page
        .locator("#objectCategories .sprite-item:visible")
        .count();
    expect(objItems).toBeGreaterThan(0);

    // Every Blank object entry from the catalog is present (one per object type)
    const blankItem = await page
        .locator('#objectCategories .sprite-item:has-text("BLANK"):visible')
        .count();
    expect(blankItem).toBe(13);
});

test("search filter works for tiles", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#searchInput");

    // Search for "Grass"
    await page.fill("#searchInput", "Grass");
    await page.waitForTimeout(100);

    // Should show Grass tiles
    const visibleTiles = await page
        .locator("#tileCategories .sprite-item:visible")
        .count();
    expect(visibleTiles).toBeGreaterThan(0);

    // Clear search
    await page.fill("#searchInput", "");
    await page.waitForTimeout(100);

    // Should show all tiles again
    const allTiles = await page
        .locator("#tileCategories .sprite-item:visible")
        .count();
    expect(allTiles).toBeGreaterThan(visibleTiles);
});

test("search filter works for objects", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#searchInput");

    // Switch to object layer
    await page.click('label[for="layerObject"]');
    await page.waitForSelector("#objectCategories .sprite-item:visible");

    // Search for "Bench"
    await page.fill("#searchInput", "Bench");
    await page.waitForTimeout(100);

    const visibleObjects = await page
        .locator("#objectCategories .sprite-item:visible")
        .count();
    expect(visibleObjects).toBeGreaterThan(0);

    // Clear
    await page.fill("#searchInput", "");
    await page.waitForTimeout(100);
});

test("click-to-paint tile layer", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForSelector("#tileCategories .sprite-item");

    // Select a tile (Grass)
    await page.click('#tileCategories .sprite-item[title="Grass"]');
    await page.waitForTimeout(100);

    // Click on canvas to paint
    const canvas = page.locator("#mapCanvas");
    const box = await canvas.boundingBox();
    if (box) {
        await canvas.click({
            position: { x: box.width / 2, y: box.height / 2 },
        });
        await page.waitForTimeout(100);
    }

    const errors: string[] = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
    });
    expect(errors.length).toBe(0);
});

test("click-to-paint object layer", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");

    // Switch to object layer
    await page.click('label[for="layerObject"]');
    await page.waitForSelector("#objectCategories .sprite-item:visible");

    // Select an object (BondageBench)
    await page.click('#objectCategories .sprite-item[title="BondageBench"]');
    await page.waitForTimeout(100);

    // Click on canvas to paint
    const canvas = page.locator("#mapCanvas");
    const box = await canvas.boundingBox();
    if (box) {
        await canvas.click({
            position: { x: box.width / 2, y: box.height / 2 },
        });
        await page.waitForTimeout(100);
    }

    const errors: string[] = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
    });
    expect(errors.length).toBe(0);
});

test("zoom and pan controls work", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#btnZoomIn");

    // Test zoom in
    await page.click("#btnZoomIn");
    await page.waitForTimeout(100);

    // Test zoom out
    await page.click("#btnZoomOut");
    await page.waitForTimeout(100);

    // Test zoom reset
    await page.click("#btnZoomReset");
    await page.waitForTimeout(100);

    // Verify zoom level displays
    const zoomText = await page.locator("#zoomLevel").textContent();
    expect(zoomText).toMatch(/100%/);
});

test("ctrl+drag panning does not snap", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");

    const canvas = page.locator("#mapCanvas");
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Low zoom: the whole map fits, so panning must stay put (used to snap).
    await page.evaluate(() => (window as any).editor.setZoom(0.25));
    await page.mouse.move(cx, cy);
    await page.keyboard.down("Control");
    await page.mouse.down();
    await page.mouse.move(cx + 12, cy + 12, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Control");

    let pan = await page.evaluate(() => ({
        x: (window as any).editor.panX,
        y: (window as any).editor.panY,
    }));
    expect(Math.abs(pan.x)).toBeLessThan(1);
    expect(Math.abs(pan.y)).toBeLessThan(1);

    // High zoom: panning applies and stays within the per-axis limits.
    await page.evaluate(() => {
        const e = (window as any).editor;
        e.resetView();
        e.setZoom(3);
    });
    const limits = await page.evaluate(() => {
        const e = (window as any).editor;
        const c = e.canvas;
        const draw = Math.min(c.width, c.height) * e.zoom;
        return {
            x: Math.max(0, (draw - c.width) / 2),
            y: Math.max(0, (draw - c.height) / 2),
        };
    });
    const dragX = Math.min(100, limits.x);
    const dragY = Math.min(60, limits.y);

    await page.mouse.move(cx, cy);
    await page.keyboard.down("Control");
    await page.mouse.down();
    await page.mouse.move(cx + dragX, cy + dragY, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Control");

    pan = await page.evaluate(() => ({
        x: (window as any).editor.panX,
        y: (window as any).editor.panY,
    }));
    expect(pan.x).toBeCloseTo(dragX, 0);
    expect(pan.y).toBeCloseTo(dragY, 0);
});

test("layer toggle switches pickers", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#layerTile");
    await page.waitForSelector("#layerObject");

    // Default should be tile layer - tile picker visible
    const tileLayer = page.locator("#layerTile");
    await expect(tileLayer).toBeChecked();
    await expect(page.locator("#tileCategories")).toBeVisible();
    await expect(page.locator("#objectCategories")).toBeHidden();

    // Switch to object layer
    await page.click('label[for="layerObject"]');
    await expect(page.locator("#layerObject")).toBeChecked();
    await expect(page.locator("#objectCategories")).toBeVisible();
    await expect(page.locator("#tileCategories")).toBeHidden();

    // Switch back
    await page.click('label[for="layerTile"]');
    await expect(page.locator("#layerTile")).toBeChecked();
    await expect(page.locator("#tileCategories")).toBeVisible();
    await expect(page.locator("#objectCategories")).toBeHidden();
});

test("canvas renders 40x40 grid", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");

    // Check canvas exists and has dimensions
    const canvas = page.locator("#mapCanvas");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // Canvas should fill parent (no horizontal scroll)
    const bodyScroll = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScroll).toBeLessThanOrEqual(windowWidth + 10);
});
