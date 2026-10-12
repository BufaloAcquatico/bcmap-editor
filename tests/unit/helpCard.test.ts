import { describe, it, expect } from "vitest";
import { createHelpRenderer } from "../../src/helpCard";
import type { AppSurface } from "../../src/appSurface";

/** Minimal DOM stand-in: tracks children, text and listeners. */
class FakeNode {
    children: FakeNode[] = [];
    removed = false;
    style: Record<string, string> = {};
    textContent = "";
    innerHTML = "";
    type = "";
    private listeners: Record<string, Array<() => void>> = {};

    appendChild(child: FakeNode): FakeNode {
        this.children.push(child);
        return child;
    }

    remove(): void {
        this.removed = true;
    }

    addEventListener(type: string, fn: () => void): void {
        (this.listeners[type] ??= []).push(fn);
    }

    click(): void {
        (this.listeners["click"] ?? []).forEach((fn) => fn());
    }
}

const asElement = (node: FakeNode): HTMLElement =>
    node as unknown as HTMLElement;

const REGISTRY = [
    { keys: "hjkl / arrows", description: "Move cursor" },
    { keys: "Space / Enter", description: "Paint selection" },
    { keys: "v", description: "Visual mode" },
    { keys: "y / Y", description: "Yank region" },
    { keys: "p", description: "Paste yank" },
    { keys: "u", description: "Undo" },
    { keys: "/", description: "Focus search" },
    { keys: ":", description: "Command line" },
    { keys: "Tab", description: "Move between" },
    { keys: "?", description: "Toggle help" },
    { keys: "Esc", description: "Cancel" },
    { keys: "arrows", description: "Navigate picker grid" },
    { keys: "Enter", description: "Search first match" },
];

function setup(surface: AppSurface, visual = false) {
    const card = new FakeNode();
    const created: FakeNode[] = [];
    const renderer = createHelpRenderer({
        card: asElement(card),
        registry: REGISTRY,
        getSurface: () => surface,
        isVisualActive: () => visual,
        createElement: () => {
            const node = new FakeNode();
            created.push(node);
            return asElement(node);
        },
    });
    const texts = () =>
        card.children
            .filter((child) => !child.removed)
            .map((child) => child.innerHTML + child.textContent);
    const toggle = () =>
        card.children.find(
            (child) =>
                !child.removed &&
                child.textContent !== "" &&
                child.type === "button",
        )!;
    return { card, renderer, texts, toggle };
}

describe("createHelpRenderer", () => {
    it("renders the map slice only by default", () => {
        const { renderer, texts } = setup("map");
        renderer.render();
        const html = texts().join("\n");
        expect(html).toContain("Move cursor");
        expect(html).toContain("Command line");
        expect(html).not.toContain("Navigate picker grid");
    });

    it("renders the picker slice without map rows", () => {
        const { renderer, texts } = setup("picker");
        renderer.render();
        const html = texts().join("\n");
        expect(html).toContain("Navigate picker grid");
        expect(html).not.toContain("Move cursor");
    });

    it("renders static command rows with no registry slice", () => {
        const { renderer, texts } = setup("command");
        renderer.render();
        const html = texts().join("\n");
        expect(html).toContain("Run the command");
        expect(html).toContain("Recall command history");
        expect(html).not.toContain("Move cursor");
    });

    it("renders the chrome row with no map rows", () => {
        const { renderer, texts } = setup("chrome");
        renderer.render();
        const html = texts().join("\n");
        expect(html).toContain("Close the dialog");
        expect(html).not.toContain("Move cursor");
    });

    it("adds the visual-kept note off-map only while a region is open", () => {
        const kept = setup("picker", true);
        kept.renderer.render();
        expect(kept.texts().join("\n")).toContain("Visual selection kept");
        const onMap = setup("map", true);
        onMap.renderer.render();
        expect(onMap.texts().join("\n")).not.toContain("Visual selection kept");
        const closed = setup("picker", false);
        closed.renderer.render();
        expect(closed.texts().join("\n")).not.toContain(
            "Visual selection kept",
        );
    });

    it("toggles between slice and full list, clearing stale rows", () => {
        const { card, renderer, texts, toggle } = setup("picker");
        renderer.render();
        const sliceCount = card.children.filter((c) => !c.removed).length;
        toggle().click();
        const full = texts().join("\n");
        expect(full).toContain("Navigate picker grid");
        expect(full).toContain("Move cursor");
        expect(card.children.filter((c) => !c.removed).length).toBeGreaterThan(
            sliceCount,
        );
        toggle().click();
        expect(texts().join("\n")).not.toContain("Move cursor");
    });

    it("setShowAll re-renders programmatically", () => {
        const { renderer, texts } = setup("search");
        renderer.render();
        expect(texts().join("\n")).not.toContain("Move cursor");
        renderer.setShowAll(true);
        expect(texts().join("\n")).toContain("Move cursor");
        renderer.setShowAll(false);
        expect(texts().join("\n")).not.toContain("Move cursor");
    });
});
