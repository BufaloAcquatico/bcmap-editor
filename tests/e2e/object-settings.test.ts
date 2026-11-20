import { test, expect, Page } from "playwright/test";

const openEditor = async (page: Page) => {
    await page.goto("/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForFunction(() => (window as any).editor !== undefined);
};

const placeObject = async (page: Page, id: number) =>
    page.evaluate((oid) => {
        const e = (window as any).editor;
        e.setCurrentLayer("object");
        const obj = e.getFullObjectCatalog().find((o: any) => o.ID === oid);
        e.setSelectedObject(obj);
        e.paintAt({ X: 5, Y: 5 });
        e.setPropertiesMode(true);
        e.selectPropertyTarget({ X: 5, Y: 5 });
    }, id);

const settings = (page: Page) =>
    page.evaluate(() => (window as any).editor.getMapData().ObjectSettings);

test("rotation and size sliders write settings live", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeObject(page, 2005); // Rocks (FloorObstacle, transformable)
    const sliders = page.locator('#propertiesFields input[type="range"]');
    expect(await sliders.count()).toBe(2);
    await sliders.first().fill("45");
    await sliders.first().dispatchEvent("input");
    await sliders.nth(1).fill("150");
    await sliders.nth(1).dispatchEvent("input");
    const s = await settings(page);
    expect(s["205"].Rotation).toBe(45);
    expect(s["205"].Size).toBe(150);
});

test("erase clears object settings", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await placeObject(page, 2005);
    await page
        .locator('#propertiesFields input[type="range"]')
        .first()
        .fill("45");
    await page
        .locator('#propertiesFields input[type="range"]')
        .first()
        .dispatchEvent("input");
    expect((await settings(page))["205"]).toBeDefined();
    await page.evaluate(() => {
        const e = (window as any).editor;
        e.setPropertiesMode(false);
        e.selectEraser();
        e.paintAt({ X: 5, Y: 5 });
    });
    expect(await settings(page)).toBeUndefined();
});

test("DJ Booth exposes a decal picker and colour layers", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeObject(page, 599); // DJ Booth
    await expect(
        page.locator('#propertiesFields select[aria-label="Decal"]'),
    ).toBeVisible();
    await expect(
        page.locator('#propertiesFields input[type="color"]').first(),
    ).toBeVisible();
});

test("sign cells do not show object-settings fields", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeObject(page, 3520);
    await expect(page.locator("#signText")).toBeVisible();
    expect(
        await page.locator('#propertiesFields input[type="range"]').count(),
    ).toBe(0);
});
