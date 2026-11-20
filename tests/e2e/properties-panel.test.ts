import { test, expect, Page } from "playwright/test";

const URL = "http://localhost:8080/map-editor.html";

async function openProperties(page: Page) {
    await page.goto(URL);
    await page.click('label[for="layerProperties"]');
}

test("the layer selector has a fourth Properties position", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto(URL);
    await expect(page.locator('input[name="layer"]')).toHaveCount(4);
    await expect(page.locator("#propertiesPanel")).toBeHidden();
    await page.click('label[for="layerProperties"]');
    await expect(page.locator("#propertiesPanel")).toBeVisible();
    await expect(page.locator("#sidebarContent")).toBeHidden();
    await expect(page.locator("#searchBoxWrap")).toBeHidden();
    await expect(page.locator("#quickTools .quick-tool")).toHaveCount(2);
});

test("[ and ] step through all four selector positions and clamp", async ({
    page,
}: {
    page: Page;
}) => {
    await openProperties(page);
    // Focus the map so the sidebar router does not swallow the key.
    await page.locator("#mapCanvas").focus();
    // From Properties, [ returns to lighting.
    await page.keyboard.press("BracketLeft");
    await expect(page.locator("#layerEffect")).toBeChecked();
    await page.keyboard.press("BracketRight");
    await expect(page.locator("#layerProperties")).toBeChecked();
    await expect(page.locator("#propertiesPanel")).toBeVisible();
    await page.keyboard.press("BracketRight");
    await expect(page.locator("#layerProperties")).toBeChecked();
});

test("single click selects a cell without changing the map", async ({
    page,
}: {
    page: Page;
}) => {
    await openProperties(page);
    // A fresh panel has no target, so the placeholder is shown.
    const initial = await page.evaluate(() => ({
        target: !!window.editor.getPropertyPanel().getTarget(),
        cls: document.getElementById("propertiesPlaceholder")?.className,
    }));
    expect(initial.target).toBe(false);
    expect(initial.cls).not.toContain("d-none");
    const before = await page.evaluate(() =>
        (window as any).editor.exportMap("before"),
    );
    // Click near the middle of the canvas (grass, no object).
    const box = await page.locator("#mapCanvas").boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    const after = await page.evaluate(() =>
        (window as any).editor.exportMap("after"),
    );
    expect(after).toBe(before);
    // Empty cell resolves to no object: placeholder stays.
    await expect(page.locator("#propertiesPlaceholder")).toBeVisible();
});

test("Escape from the panel returns focus to the map", async ({
    page,
}: {
    page: Page;
}) => {
    await openProperties(page);
    await page.keyboard.press("Tab");
    const activeId = await page.evaluate(
        () => (document.activeElement as HTMLElement)?.id,
    );
    expect(activeId).toBe("propertiesClose");
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => (window as any).appSurface.get())).toBe(
        "map",
    );
    expect(
        await page.evaluate(() => (document.activeElement as HTMLElement)?.id),
    ).toBe("mapCanvas");
});

test("paste is inert while Properties mode is open", async ({
    page,
}: {
    page: Page;
}) => {
    await openProperties(page);
    const result = await page.evaluate(() => {
        const e = (window as any).editor;
        const before = e.exportMap("before");
        // writeBothLayers is the paste path's writer; it must refuse while
        // Properties mode is open, exactly as writeCell does.
        const changed = e.writeBothLayers(5, 5, "A", "d", "");
        return { changed, after: e.exportMap("after"), before };
    });
    expect(result.changed).toBe(false);
    expect(result.after).toBe(result.before);
});

test("d and quick tools resync the selector radio when leaving Properties", async ({
    page,
}: {
    page: Page;
}) => {
    await openProperties(page);
    await page.locator("#mapCanvas").focus();
    await page.keyboard.press("d");
    await expect(page.locator("#layerObject")).toBeChecked();
    await expect(page.locator("#layerProperties")).not.toBeChecked();
    await expect(page.locator("#propertiesPanel")).toBeHidden();
});

test("target is cleared when a new map is created", async ({
    page,
}: {
    page: Page;
}) => {
    await openProperties(page);
    await page.evaluate(() => {
        const e = (window as any).editor;
        // A synthetic target on a cell with a known object.
        e.setPropertiesMode(true);
        const obj = e.getFullObjectCatalog().find((o: any) => o.ID === 100);
        e.getPropertyPanel().setTarget(obj, { X: 1, Y: 1 });
        e.newMap();
    });
    const target = await page.evaluate(() =>
        (window as any).editor.getPropertyPanel().getTarget(),
    );
    expect(target).toBeNull();
});

test("closing the panel returns to the previous paint layer", async ({
    page,
}: {
    page: Page;
}) => {
    await page.goto(URL);
    await page.click('label[for="layerObject"]');
    await page.click('label[for="layerProperties"]');
    await expect(page.locator("#propertiesPanel")).toBeVisible();
    await page.click("#propertiesClose");
    await expect(page.locator("#propertiesPanel")).toBeHidden();
    await expect(page.locator("#layerObject")).toBeChecked();
});
