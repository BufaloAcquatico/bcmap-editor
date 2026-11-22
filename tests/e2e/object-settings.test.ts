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

test("colour pickers are always enabled and reset buttons exist", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeObject(page, 599); // DJ Booth: two colour layers + decal
    const pickers = page.locator('#propertiesFields input[type="color"]');
    expect(await pickers.count()).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < (await pickers.count()); i++) {
        await expect(pickers.nth(i)).toBeEnabled();
    }
    expect(
        await page.locator('#propertiesFields input[type="checkbox"]').count(),
    ).toBe(0);
    await expect(
        page.getByRole("button", { name: "Reset layer 0 colour to default" }),
    ).toBeVisible();
});

test("colour rows align in name / picker / reset columns", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeObject(page, 599);
    const rows = page.locator("#propertiesFields .prop-colour-row");
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
    const pickerXs: number[] = [];
    const buttonXs: number[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
        const row = rows.nth(i);
        if (!(await row.isVisible())) continue; // decal row hidden without a decal
        const picker = await row.locator('input[type="color"]').boundingBox();
        const button = await row.locator("button").boundingBox();
        expect(picker).not.toBeNull();
        expect(button).not.toBeNull();
        pickerXs.push(picker!.x);
        buttonXs.push(button!.x);
    }
    expect(pickerXs.length).toBeGreaterThanOrEqual(2);
    for (const x of pickerXs) expect(Math.abs(x - pickerXs[0])).toBeLessThan(1);
    for (const x of buttonXs) expect(Math.abs(x - buttonXs[0])).toBeLessThan(1);
});

test("provider section titles and panel divider are present", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeObject(page, 599); // opens Properties mode
    await expect(page.locator("#propertiesPanel > hr")).toBeVisible();
    await expect(
        page.getByText("Object Appearance", { exact: true }),
    ).toBeVisible();
});

test("reset restores a layer colour without clobbering another layer", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeObject(page, 599);
    await page
        .locator('#propertiesFields input[type="color"]')
        .nth(0)
        .fill("#ff0000");
    await page
        .locator('#propertiesFields input[type="color"]')
        .nth(0)
        .dispatchEvent("change");
    await page
        .locator('#propertiesFields input[type="color"]')
        .nth(1)
        .fill("#00ff00");
    await page
        .locator('#propertiesFields input[type="color"]')
        .nth(1)
        .dispatchEvent("change");
    await page
        .getByRole("button", { name: "Reset layer 0 colour to default" })
        .click();
    const s = await settings(page);
    expect(s["205"].Colors[0]).toBe("Default");
    expect(s["205"].Colors[1]).not.toBe("Default");
    await expect(
        page.locator('#propertiesFields input[type="color"]').nth(0),
    ).toHaveValue("#808080");
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
