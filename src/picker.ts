// BCMap Editor - sidebar pickers (tile/object category lists).
//
// Owns the picker DOM: category groups, search filtering, fold/collapse
// state, and selection highlight. The editor keeps the selection model
// (current layer + selected tile/object) and drives this class; item clicks
// report back through the delegate.
//
// Extracted from BCMapEditor (src/editor.ts); behavior is unchanged.

import type { ObjectDef, TileDef } from "./catalog";

export type PickerLayer = "tile" | "object";

export interface PickerDelegate {
    onSelectTile(tile: TileDef): void;
    onSelectObject(obj: ObjectDef): void;
}

interface CategoryEntry {
    header: HTMLElement;
    content: HTMLElement;
    caret: HTMLElement;
    collapsed: boolean;
}

// Bundled eraser icon for Blank (delete-tool) picker items. Inline SVG on
// purpose: the previous markup used the non-existent `bi-erase` class (only
// `eraser`/`eraser-fill` exist), so the icon could never render, and font
// glyphs additionally fail offline. Artwork below is the official Bootstrap
// Icons `eraser` (v1.11.1, MIT) inlined, tinted flat #adb5bd to match the
// picker's minimal look with zero CSS dependency.
const BLANK_ERASER_ICON =
    '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">' +
    '<svg class="picker-eraser-icon" width="30" height="30" viewBox="0 0 16 16" fill="#adb5bd" aria-hidden="true">' +
    '<path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828l6.879-6.879zm2.121.707a1 1 0 0 0-1.414 0L4.16 7.547l5.293 5.293 4.633-4.633a1 1 0 0 0 0-1.414l-3.879-3.879zM8.746 13.547 3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293l.16-.16z"/>' +
    "</svg></span>";

export class MapPicker {
    private layer: PickerLayer = "tile";
    private searchTerm = "";
    private tileCategoryEls: CategoryEntry[] = [];
    private objectCategoryEls: CategoryEntry[] = [];
    private tilePickerItemById = new Map<number, HTMLElement>();
    private objectPickerItemById = new Map<number, HTMLElement>();

    constructor(private delegate: PickerDelegate) {}

    populate(tileCatalog: TileDef[], objectCatalog: ObjectDef[]): void {
        const tileCategories = document.getElementById("tileCategories");
        const objectCategories = document.getElementById("objectCategories");
        if (!tileCategories || !objectCategories) return;

        this.tileCategoryEls = [];
        this.objectCategoryEls = [];
        this.tilePickerItemById.clear();
        this.objectPickerItemById.clear();

        const tileGroups = new Map<string, TileDef[]>();
        tileCatalog.forEach((t) => {
            if (!tileGroups.has(t.Type)) tileGroups.set(t.Type, []);
            tileGroups.get(t.Type)!.push(t);
        });
        // Clear without HTML parsing (containers only hold app-created nodes).
        tileCategories.replaceChildren();
        tileGroups.forEach((tiles, type) => {
            const { header, entry } = this.createCategoryHeader(type);
            this.tileCategoryEls.push(entry);
            const container = entry.content;
            tiles.forEach((tile) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "sprite-item";
                item.tabIndex = -1;
                item.setAttribute?.("aria-pressed", "false");
                const key = tile.Type + "/" + tile.Style;
                item.style.backgroundImage =
                    "url(assets/tiles/" + key + ".png)";
                item.title = tile.Style;
                item.setAttribute?.("aria-label", `Select tile ${tile.Style}`);
                item.addEventListener("click", () => {
                    this.delegate.onSelectTile(tile);
                });
                container.appendChild(item);
                this.tilePickerItemById.set(tile.ID, item);
            });
            tileCategories.appendChild(header);
            tileCategories.appendChild(container);
        });

        const objGroups = new Map<string, ObjectDef[]>();
        objectCatalog.forEach((o) => {
            let g = o.Type;
            if (o.Type.startsWith("FloorDecoration")) g = "Floor Decorations";
            else if (
                o.Type === "FloorItem" ||
                o.Type === "FloorNumber" ||
                o.Type === "FloorLetter" ||
                o.Type === "FloorIcon"
            )
                g = "Floor Items";
            else if (o.Type === "FloorObstacle") g = "Floor Obstacles";
            else if (o.Type === "WallDecoration" || o.Type === "WallPath")
                g = "Wall";
            else if (o.Type === "Banners") g = "Banners";
            if (!objGroups.has(g)) objGroups.set(g, []);
            objGroups.get(g)!.push(o);
        });
        // Clear without HTML parsing (containers only hold app-created nodes).
        objectCategories.replaceChildren();
        objGroups.forEach((objs, group) => {
            const { header, entry } = this.createCategoryHeader(group);
            this.objectCategoryEls.push(entry);
            const container = entry.content;
            let blankAdded = false;
            objs.forEach((obj) => {
                if (obj.Style === "Blank") {
                    if (blankAdded) {
                        return;
                    }
                    blankAdded = true;
                }
                const item = document.createElement("button");
                item.type = "button";
                item.className = "sprite-item";
                item.tabIndex = -1;
                item.setAttribute?.("aria-pressed", "false");
                if (obj.Style !== "Blank") {
                    const key = obj.Type + "/" + obj.Style;
                    item.style.backgroundImage =
                        "url(assets/objects/" + key + ".png)";
                    item.title = obj.Style;
                    item.setAttribute?.(
                        "aria-label",
                        `Select object ${obj.Style}`,
                    );
                } else {
                    // Static compile-time SVG constant only (no interpolation
                    // of catalog or user data); the single sanctioned
                    // innerHTML use in this file.
                    item.innerHTML = BLANK_ERASER_ICON;
                    item.title = "Blank (Erase)";
                    item.setAttribute?.("aria-label", "Blank (erase objects)");
                }
                item.addEventListener("click", () => {
                    this.delegate.onSelectObject(obj);
                });
                container.appendChild(item);
                this.objectPickerItemById.set(obj.ID, item);
            });
            objectCategories.appendChild(header);
            objectCategories.appendChild(container);
        });

        this.tileCategoryEls.forEach((entry) =>
            this.setCategoryCollapsed(entry, true),
        );
        this.objectCategoryEls.forEach((entry) =>
            this.setCategoryCollapsed(entry, true),
        );
        this.updateVisibility();
    }

    /** Switch the visible layer, re-applying the stored search term. */
    setLayer(layer: PickerLayer): void {
        this.layer = layer;
        this.updateVisibility();
        this.filter(this.searchTerm);
    }

    filter(term: string): void {
        this.searchTerm = term;
        const lowered = term.trim().toLowerCase();
        const entries =
            this.layer === "tile"
                ? this.tileCategoryEls
                : this.objectCategoryEls;
        entries.forEach((entry) => {
            const items = entry.content.querySelectorAll(".sprite-item");
            let matches = 0;
            items.forEach((el) => {
                const htmlEl = el as HTMLElement;
                const title = htmlEl.getAttribute?.("title") || "";
                const txt = htmlEl.textContent || "";
                const match =
                    lowered === "" ||
                    title.toLowerCase().includes(lowered) ||
                    txt.toLowerCase().includes(lowered);
                htmlEl.style.display = match ? "" : "none";
                if (match) matches++;
            });
            this.setCategoryCollapsed(
                entry,
                lowered === "" ? true : matches === 0,
            );
        });
    }

    syncSelection(
        selectedTileId: number | null,
        selectedObjectId: number | null,
    ): void {
        this.tilePickerItemById.forEach((el, id) => {
            el.classList?.toggle("selected", selectedTileId === id);
            el.setAttribute?.(
                "aria-pressed",
                selectedTileId === id ? "true" : "false",
            );
        });
        this.objectPickerItemById.forEach((el, id) => {
            el.classList?.toggle("selected", selectedObjectId === id);
            el.setAttribute?.(
                "aria-pressed",
                selectedObjectId === id ? "true" : "false",
            );
        });
    }

    /**
     * Move focus along the visible picker: category headers and sprite
     * buttons of the active layer, in DOM order (D2). Folded categories
     * contribute only their header; filtered-out items are skipped.
     */
    focusMove(direction: "next" | "prev"): void {
        const nodes = this.visibleNavNodes();
        if (nodes.length === 0) return;
        const active = document.activeElement as HTMLElement | null;
        const index = active ? nodes.indexOf(active) : -1;
        const nextIndex =
            index < 0
                ? 0
                : direction === "next"
                  ? Math.min(nodes.length - 1, index + 1)
                  : Math.max(0, index - 1);
        const node = nodes[nextIndex];
        node?.focus();
        node?.scrollIntoView?.({ block: "nearest" });
    }

    /**
     * Collapse (delta -1) or expand (delta +1) the category that owns the
     * focused node (header or one of its sprites). Returns false when focus
     * is elsewhere so the key can fall through.
     */
    foldFocused(delta: 1 | -1): boolean {
        const active = document.activeElement as HTMLElement | null;
        const entry = this.entryForNode(active);
        if (!entry) return false;
        this.setCategoryCollapsed(entry, delta === -1);
        return true;
    }

    /** Visible focusable nodes of the active layer, header-then-items. */
    private visibleNavNodes(): HTMLElement[] {
        const entries = this.activeEntries();
        const nodes: HTMLElement[] = [];
        entries.forEach((entry) => {
            nodes.push(entry.header);
            if (entry.collapsed) return;
            entry.content.querySelectorAll(".sprite-item").forEach((el) => {
                const htmlEl = el as HTMLElement;
                if (htmlEl.style.display !== "none") nodes.push(htmlEl);
            });
        });
        return nodes.filter((el) => !!el.closest?.("#sidebar"));
    }

    private activeEntries(): CategoryEntry[] {
        return this.layer === "tile"
            ? this.tileCategoryEls
            : this.objectCategoryEls;
    }

    private entryForNode(node: HTMLElement | null): CategoryEntry | null {
        if (!node) return null;
        return (
            this.activeEntries().find(
                (entry) =>
                    entry.header === node || entry.content.contains(node),
            ) ?? null
        );
    }

    updateVisibility(): void {
        const tileCategories = document.getElementById("tileCategories");
        const objectCategories = document.getElementById("objectCategories");
        if (!tileCategories || !objectCategories) return;
        if (this.layer === "tile") {
            tileCategories.style.display = "";
            objectCategories.style.display = "none";
        } else {
            tileCategories.style.display = "none";
            objectCategories.style.display = "";
        }
    }

    private createCategoryHeader(name: string): {
        header: HTMLElement;
        entry: CategoryEntry;
    } {
        const header = document.createElement("button");
        header.type = "button";
        header.tabIndex = -1;
        header.setAttribute?.("aria-expanded", "false");
        header.className =
            "category-header p-2 border-bottom border-secondary d-flex align-items-center gap-2";
        const caret = document.createElement("i");
        caret.className = "bi bi-caret-right-fill category-caret";
        caret.setAttribute?.("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = name;
        header.appendChild(caret);
        header.appendChild(label);
        const content = document.createElement("div");
        content.className = "category-content p-2";
        content.id = "cat-" + Math.random().toString(36).slice(2, 8);
        header.setAttribute?.("aria-controls", content.id);
        const entry: CategoryEntry = {
            header,
            content,
            caret,
            collapsed: false,
        };
        header.addEventListener("click", () =>
            this.setCategoryCollapsed(entry, !entry.collapsed),
        );
        return { header, entry };
    }

    private setCategoryCollapsed(
        entry: CategoryEntry,
        collapsed: boolean,
    ): void {
        entry.collapsed = collapsed;
        entry.content.style.display = collapsed ? "none" : "";
        entry.header.setAttribute?.(
            "aria-expanded",
            collapsed ? "false" : "true",
        );
        if (collapsed) entry.caret.classList?.remove("expanded");
        else entry.caret.classList?.add("expanded");
    }
}
