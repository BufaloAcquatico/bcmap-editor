import { describe, it, expect, vi } from "vitest";
import { AppSurfaceStore, surfaceForTarget } from "../../src/appSurface";

describe("AppSurfaceStore", () => {
    it("defaults to the map surface", () => {
        expect(new AppSurfaceStore().get()).toBe("map");
    });

    it("notifies subscribers only on actual change", () => {
        const store = new AppSurfaceStore();
        const seen: string[] = [];
        store.subscribe((s) => seen.push(s));
        store.set("picker");
        store.set("picker");
        store.set("search");
        expect(seen).toEqual(["picker", "search"]);
    });

    it("unsubscribes cleanly", () => {
        const store = new AppSurfaceStore();
        const fn = vi.fn();
        const off = store.subscribe(fn);
        off();
        store.set("picker");
        expect(fn).not.toHaveBeenCalled();
    });
});

describe("surfaceForTarget", () => {
    it("maps known element ids", () => {
        expect(surfaceForTarget({ id: "mapCanvas" })).toBe("map");
        expect(surfaceForTarget({ id: "searchInput" })).toBe("search");
        expect(surfaceForTarget({ id: "commandPrompt" })).toBe("command");
    });

    it("prefers the search id over the sidebar ancestor", () => {
        expect(
            surfaceForTarget({ id: "searchInput", closest: () => ({}) }),
        ).toBe("search");
    });

    it("maps sidebar descendants to picker, everything else to chrome", () => {
        expect(surfaceForTarget({ closest: () => ({}) })).toBe("picker");
        expect(surfaceForTarget({ closest: () => null })).toBe("chrome");
        expect(surfaceForTarget({ tagName: "BODY" })).toBe("chrome");
        expect(surfaceForTarget({})).toBe("chrome");
        expect(surfaceForTarget(null)).toBe("chrome");
    });
});
