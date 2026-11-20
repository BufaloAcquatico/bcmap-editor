import { test, expect, Page } from "playwright/test";

const openEditor = async (page: Page) => {
    await page.goto("/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForFunction(() => (window as any).editor !== undefined);
};

/** Place a sign on the map at a known cell, then open Properties there. */
const placeSign = async (page: Page) =>
    page.evaluate(() => {
        const e = (window as any).editor;
        e.setCurrentLayer("object");
        const sign = e.getFullObjectCatalog().find((o: any) => o.ID === 3520);
        e.setSelectedObject(sign);
        e.paintAt({ X: 5, Y: 5 });
        e.setPropertiesMode(true);
        e.selectPropertyTarget({ X: 5, Y: 5 });
    });

const cellData = (page: Page) =>
    page.evaluate(() => (window as any).editor.getMapData().CellData);

test("sign text is editable in the panel and written to CellData", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeSign(page);
    await expect(page.locator("#signText")).toBeVisible();
    await page.locator("#signText").fill("hello");
    expect(await cellData(page)).toEqual({
        "205": { Type: "Sign", Text: "hello" },
    });
});

test("insert and delete runs are separate undo entries", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeSign(page);
    const field = page.locator("#signText");
    await field.fill("abc");
    // Simulate a delete run: backspace three times via keyboard.
    await field.press("End");
    await field.press("Backspace");
    await field.press("Backspace");
    let data = await cellData(page);
    expect(data["205"].Text).toBe("a");
    await page.keyboard.press("Control+z");
    data = await cellData(page);
    expect(data["205"].Text).toBe("abc");
});

test("erasing a sign clears its text config", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeSign(page);
    await page.locator("#signText").fill("hello");
    // Erase the cell with the Passable brush.
    await page.evaluate(() => {
        const e = (window as any).editor;
        e.setPropertiesMode(false);
        e.setCurrentLayer("object");
        const blank = e.getFullObjectCatalog().find((o: any) => o.ID === 100);
        e.setSelectedObject(blank);
        e.paintAt({ X: 5, Y: 5 });
    });
    expect(await cellData(page)).toBeUndefined();
});

test("sign text is capped at 150 characters", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await placeSign(page);
    await page.locator("#signText").fill("x".repeat(200));
    const data = await cellData(page);
    expect(data["205"].Text).toHaveLength(150);
});
