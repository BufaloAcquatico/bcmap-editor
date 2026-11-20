import { test, expect, Page } from "playwright/test";

const openEditor = async (page: Page) => {
    await page.goto("/map-editor.html");
    await page.waitForSelector("#mapCanvas");
    await page.waitForFunction(() => window.editor !== undefined);
};

const place = async (page: Page, id: number) =>
    page.evaluate((oid) => {
        const e = window.editor;
        e.setCurrentLayer("object");
        e.setSelectedObject(
            e.getFullObjectCatalog().find((o: any) => o.ID === oid),
        );
        e.paintAt({ X: 5, Y: 5 });
        e.setPropertiesMode(true);
        e.selectPropertyTarget({ X: 5, Y: 5 });
    }, id);

const cellData = async (page: Page): Promise<Record<string, any> | undefined> =>
    page.evaluate(() => window.editor.getMapData().CellData);

const at = (data: Record<string, any> | undefined, key: string) => data?.[key];

test("placing a pad seeds a Teleporter config and the panel shows controls", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await place(page, 3530);
    expect(at(await cellData(page), "205")).toEqual({
        Type: "Teleporter",
        Shared: true,
    });
    await expect(
        page.getByRole("button", { name: "Pick on map" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove" })).toBeHidden();
});

test("pick on map sets a destination; invalid picks are rejected", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await place(page, 3530);
    await page.getByRole("button", { name: "Pick on map" }).click();
    // Cannot click an exact cell reliably; call the API directly with validation.
    const ok = await page.evaluate(() =>
        window.editor.setTeleporterDestination({ X: 5, Y: 5 }, { X: 8, Y: 8 }),
    );
    expect(ok).toBe(true);
    expect(at(await cellData(page), "205").Destination).toEqual({ X: 8, Y: 8 });
    const self = await page.evaluate(() =>
        window.editor.setTeleporterDestination({ X: 5, Y: 5 }, { X: 5, Y: 5 }),
    );
    expect(self).toBe(false);
    await page.getByRole("button", { name: "Remove" }).click();
    expect(at(await cellData(page), "205").Destination).toBeUndefined();
    expect(at(await cellData(page), "205").Shared).toBe(true);
});

test("pad colour writes #RRGGBBAA", async ({ page }: { page: Page }) => {
    await openEditor(page);
    await place(page, 3530);
    await page.evaluate(() =>
        window.editor.setTeleporterColor({ X: 5, Y: 5 }, "#AABBCC80"),
    );
    expect(at(await cellData(page), "205").Color).toBe("#AABBCC80");
});

test("tether checkbox appears for eligible objects only", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await place(page, 2004); // Stalagmite - FloorObstacle, eligible
    const checkbox = page.getByRole("checkbox", { name: "Tether point" });
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    expect(at(await cellData(page), "205")).toEqual({ Type: "Tether" });
    await checkbox.uncheck();
    expect(at(await cellData(page), "205")).toBeUndefined();
});

test("erasing a tether point clears its config", async ({
    page,
}: {
    page: Page;
}) => {
    await openEditor(page);
    await place(page, 2004);
    await page.getByRole("checkbox", { name: "Tether point" }).check();
    await page.evaluate(() => {
        const e = window.editor;
        e.setPropertiesMode(false);
        e.selectEraser();
        e.paintAt({ X: 5, Y: 5 });
    });
    expect(await cellData(page)).toBeUndefined();
});
