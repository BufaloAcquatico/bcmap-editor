import { test, expect, Page } from "playwright/test";

const openEditor = async (page: Page) => {
    await page.goto("http://localhost:8080/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForFunction(() => (window as any).editor !== undefined);
};

const vimCursor = (page: Page) =>
    page.evaluate(() => (window as any).editor.vim.getCursor());
const modeText = (page: Page) => page.locator("#statusVimMode").textContent();
const positionText = (page: Page) =>
    page.locator("#statusPosition").textContent();

test("canvas exposes application role and aria label", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await expect(page.locator("#mapCanvas")).toHaveAttribute("tabindex", "0");
    await expect(page.locator("#mapCanvas")).toHaveAttribute(
        "aria-label",
        /40 by 40/,
    );
});

test("status bar shows normal mode on load", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    expect(await modeText(page)).toBe("-- NORMAL --");
});

test("j boots the cursor at the map center and moves down", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press("j");
    expect(await vimCursor(page)).toEqual({ X: 20, Y: 21 });
    expect(await positionText(page)).toBe("Position: (20, 21)");
});

test("counts prefix motions", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await page.keyboard.press("5");
    expect(await modeText(page)).toBe("5");
    await page.keyboard.press("j");
    expect(await vimCursor(page)).toEqual({ X: 20, Y: 25 });
    expect(await modeText(page)).toBe("-- NORMAL --");
});

test("gg goes to the top-left corner", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await page.keyboard.press("j");
    await page.keyboard.press("g");
    expect(await modeText(page)).toBe("g");
    await page.keyboard.press("g");
    expect(await vimCursor(page)).toEqual({ X: 0, Y: 0 });
});

test("0 and $ move along the row", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await page.keyboard.press("j");
    await page.keyboard.press("$");
    expect(await vimCursor(page)).toEqual({ X: 39, Y: 21 });
    await page.keyboard.press("0");
    expect(await vimCursor(page)).toEqual({ X: 0, Y: 21 });
});

test("arrow keys move the cursor too", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowLeft");
    expect(await vimCursor(page)).toEqual({ X: 20, Y: 20 });
});

test("lowercase g does not toggle the grid (G does)", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    const gridVisible = () =>
        page.evaluate(() => (window as any).editor.getGridVisible());
    expect(await gridVisible()).toBe(true);
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    expect(await gridVisible()).toBe(true);
    await page.keyboard.press("Shift+G");
    expect(await gridVisible()).toBe(false);
});

test("cursor glides toward motions across frames (motion on)", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.keyboard.press("j"); // boot (20, 21)
    await page.waitForTimeout(500); // let the boot glide settle
    // Record the render position at each animation frame.
    await page.evaluate(() => {
        (window as any).__traj = [];
        const ed = (window as any).editor;
        const orig = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
            orig(() => {
                const r = ed.cursorRenderPos;
                (window as any).__traj.push(r ? r.X : null);
                cb(performance.now());
            })) as typeof requestAnimationFrame;
    });
    await page.keyboard.press("l"); // logical (21, 21)
    await page.waitForFunction(() => {
        const r = (window as any).editor.cursorRenderPos;
        return r && r.X === 21 && r.Y === 21;
    });
    const traj = (await page.evaluate(() => (window as any).__traj)) as (
        number | null
    )[];
    const xs = traj.filter((x): x is number => typeof x === "number");
    expect(xs.length).toBeGreaterThanOrEqual(2);
    // Starts at the old cell, passes strictly through the middle,
    // never leaves the segment, ends exactly on the new cell.
    expect(xs[0]).toBe(20);
    expect(xs.some((x) => x > 20 && x < 21)).toBe(true);
    expect(xs.every((x) => x >= 20 && x <= 21)).toBe(true);
    for (let i = 1; i < xs.length; i++)
        expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    expect(await vimCursor(page)).toEqual({ X: 21, Y: 21 });
});

test("cursor reappears after zooming past the viewport", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await page.evaluate(() => (window as any).editor.setZoom(3));
    for (let i = 0; i < 30; i++) await page.keyboard.press("l");
    const box = await page.evaluate(() => {
        const e = (window as any).editor;
        const cursor = e.vim.getCursor();
        const box = e.getDrawBox();
        const cellX = box.startX + cursor.X * box.tileSize;
        return { cellX, tileSize: box.tileSize, canvasW: e.canvas.width };
    });
    // Auto-pan keeps the cursor cell intersecting the viewport
    expect(box.cellX + box.tileSize).toBeGreaterThan(0);
    expect(box.cellX).toBeLessThanOrEqual(box.canvasW);
});
