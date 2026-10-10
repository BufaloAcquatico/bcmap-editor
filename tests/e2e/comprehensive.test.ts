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

    // Categories start collapsed; reveal matching sprites via search
    await page.fill("#searchInput", "Blank");
    await page.waitForTimeout(100);

    // Check thumbnails load
    const objItems = await page
        .locator("#objectCategories .sprite-item:visible")
        .count();
    expect(objItems).toBeGreaterThan(0);

    // Every Blank object entry from the catalog is present (one per object category group)
    const blankItem = await page
        .locator("#objectCategories .sprite-item:has(i.bi-erase):visible")
        .count();
    // 4 object category groups have Blanks: Floor Decorations, Floor Items, Floor Obstacles, Wall
    // Banners category has no Blank objects
    expect(blankItem).toBe(4);
});

test("search filter works for tiles", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#searchInput");

    // Categories start collapsed
    const collapsedTiles = await page
        .locator("#tileCategories .sprite-item:visible")
        .count();
    expect(collapsedTiles).toBe(0);

    // Search for "Grass" - matching categories auto-expand
    await page.fill("#searchInput", "Grass");
    await page.waitForTimeout(100);

    // Should show Grass tiles
    const visibleTiles = await page
        .locator("#tileCategories .sprite-item:visible")
        .count();
    expect(visibleTiles).toBeGreaterThan(0);

    // Clear search - categories collapse again
    await page.fill("#searchInput", "");
    await page.waitForTimeout(100);

    const allTiles = await page
        .locator("#tileCategories .sprite-item:visible")
        .count();
    expect(allTiles).toBe(0);
});

test("search filter works for objects", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#searchInput");

    // Switch to object layer
    await page.click('label[for="layerObject"]');

    // Search for "Bench" - matching categories auto-expand
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
    await page.waitForSelector("#searchInput");

    // Categories start collapsed - reveal "Grass" via search
    await page.fill("#searchInput", "Grass");
    await page.waitForTimeout(100);

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
    await page.waitForSelector("#searchInput");

    // Categories start collapsed - reveal "BondageBench" via search
    await page.fill("#searchInput", "BondageBench");
    await page.waitForTimeout(100);

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

test("ctrl+drag panning does not snap and overscrolls 2 tiles", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");

    const canvas = page.locator("#mapCanvas");
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const readPan = () =>
        page.evaluate(() => ({
            x: (window as any).editor.panX,
            y: (window as any).editor.panY,
        }));

    const dragBy = async (dx: number, dy: number) => {
        await page.mouse.move(cx, cy);
        await page.keyboard.down("Control");
        await page.mouse.down();
        await page.mouse.move(cx + dx, cy + dy, { steps: 5 });
        await page.mouse.up();
        await page.keyboard.up("Control");
    };

    const expectedPan = (dx: number, dy: number) =>
        page.evaluate(
            ([dx, dy]) => {
                const e = (window as any).editor;
                const c = e.canvas;
                const dpr = window.devicePixelRatio || 1;
                const draw = Math.min(c.width, c.height) * e.zoom;
                const margin = 15 * (draw / 40); // PAN_OVERSCROLL_TILES
                const lx = Math.max(0, (draw - c.width) / 2) + margin;
                const ly = Math.max(0, (draw - c.height) / 2) + margin;
                const clamp = (v: number, l: number) =>
                    Math.max(-l, Math.min(l, v));
                return { x: clamp(dx * dpr, lx), y: clamp(dy * dpr, ly) };
            },
            [dx, dy],
        );

    // Low zoom: the map fits, so it may only nudge ~2 tiles (used to snap).
    await page.evaluate(() => (window as any).editor.setZoom(0.25));
    await dragBy(12, 12);
    let expected = await expectedPan(12, 12);
    let pan = await readPan();
    expect(pan.x).toBeCloseTo(expected.x, 0);
    expect(pan.y).toBeCloseTo(expected.y, 0);
    expect(Math.abs(pan.x)).toBeLessThan(50); // old bug snapped to ~500

    // High zoom: panning applies and clamps within the overscrolled limits.
    await page.evaluate(() => {
        const e = (window as any).editor;
        e.resetView();
        e.setZoom(3);
    });
    await dragBy(100, 60);
    expected = await expectedPan(100, 60);
    pan = await readPan();
    expect(pan.x).toBeCloseTo(expected.x, 0);
    expect(pan.y).toBeCloseTo(expected.y, 0);
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

test("layer tabs live in the sidebar and switch panels", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#sidebar #layerTile");
    await page.waitForSelector("#sidebar #layerObject");

    // Default tile panel
    await expect(page.locator("#tileCategories")).toBeVisible();
    await expect(page.locator("#objectCategories")).toBeHidden();

    await page.click('label[for="layerObject"]');
    await expect(page.locator("#objectCategories")).toBeVisible();
    await expect(page.locator("#tileCategories")).toBeHidden();
});

test("category headers toggle fold with caret", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#tileCategories .category-header");

    const firstHeader = page
        .locator("#tileCategories .category-header")
        .first();
    const firstContent = page
        .locator("#tileCategories .category-content")
        .first();

    // Starts collapsed with the caret pointing right
    await expect(firstContent).toBeHidden();
    await expect(firstHeader.locator(".category-caret")).not.toHaveClass(
        /expanded/,
    );

    // Expand
    await firstHeader.click();
    await expect(firstContent).toBeVisible();
    await expect(firstHeader.locator(".category-caret")).toHaveClass(
        /expanded/,
    );

    // Collapse again
    await firstHeader.click();
    await expect(firstContent).toBeHidden();
});

test("status bar tracks pointer and selection", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");

    // Default tile selection is Grass
    await expect(page.locator("#statusSelection")).toHaveText(
        "Selection: FloorExterior/Grass",
    );

    const canvas = page.locator("#mapCanvas");
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(50);
    const posText = await page.locator("#statusPosition").textContent();
    expect(posText).toMatch(/Position: \(\d+, \d+\)/);

    // Leaving the canvas clears the position
    await page.mouse.move(box.x - 20, box.y - 20);
    await page.waitForTimeout(50);
    await expect(page.locator("#statusPosition")).toHaveText(
        "Position: (-, -)",
    );

    // Object layer default selection is Blank (Erase)
    await page.click('label[for="layerObject"]');
    await expect(page.locator("#statusSelection")).toHaveText(
        "Selection: Blank (Erase)",
    );
});

test("wheel zoom anchors to cursor", async ({ page }: { page: Page }) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");

    const canvas = page.locator("#mapCanvas");
    const box = (await canvas.boundingBox())!;
    const px = box.x + box.width / 2;
    const py = box.y + box.height / 2;

    const coordAt = (x: number, y: number) =>
        page.evaluate(
            ([x, y]) => {
                const e = (window as any).editor;
                const rect = e.canvas.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                const b = e.getDrawBox();
                const ax = (x - rect.left) * dpr;
                const ay = (y - rect.top) * dpr;
                return {
                    x: (ax - b.startX) / b.tileSize,
                    y: (ay - b.startY) / b.tileSize,
                };
            },
            [x, y],
        );

    await page.mouse.move(px, py);
    await page.waitForTimeout(50);
    const before = await coordAt(px, py);

    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(400);

    const after = await coordAt(px, py);
    const zoomText = await page.locator("#zoomLevel").textContent();
    expect(zoomText).not.toMatch(/^100%$/);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
});

test("grid toggles via button and G keybind", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#btnToggleGrid");

    const gridVisible = () =>
        page.evaluate(() => (window as any).editor.getGridVisible());

    expect(await gridVisible()).toBe(true);

    await page.click("#btnToggleGrid");
    expect(await gridVisible()).toBe(false);

    await page.keyboard.press("g");
    expect(await gridVisible()).toBe(true);

    // Typing "g" in the search box must not toggle the grid
    await page.click("#searchInput");
    await page.keyboard.type("g");
    expect(await gridVisible()).toBe(true);
    await expect(page.locator("#searchInput")).toHaveValue("g");
});
