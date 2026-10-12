import { describe, it, expect } from "vitest";
import { createHelpRenderer } from "../../src/helpCard";
import type { AppSurface } from "../../src/appSurface";
import type { KeybindGroup } from "../../src/vim/keybinds";

/** Minimal DOM stand-in: tracks children, text and listeners. */
class FakeNode {
    children: FakeNode[] = [];
    removed = false;
    style: Record<string, string> = {};
    textContent = "";
    innerHTML = "";
    type = "";
    className = "";
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

const COMMAND_FIXTURE = [
    { syntax: ":w [name]", description: "Save the map" },
    { syntax: ":line x1,y1 x2,y2", description: "Draw a straight line" },
];

const REGISTRY: Array<{
    keys: string;
    description: string;
    group: KeybindGroup;
}> = [
    { keys: "hjkl / arrows", description: "Move cursor", group: "cursor" },
    { keys: "Space / Enter", description: "Paint selection", group: "paint" },
    { keys: "v", description: "Visual mode", group: "paint" },
    { keys: "y / Y", description: "Yank region", group: "clipboard" },
    { keys: "p", description: "Paste yank", group: "clipboard" },
    { keys: "u", description: "Undo", group: "clipboard" },
    { keys: "/", description: "Focus search", group: "navigate" },
    { keys: ":", description: "Command line", group: "command" },
    { keys: "Tab", description: "Move between", group: "navigate" },
    { keys: "/", description: "Search the tiles", group: "navigate" },
    { keys: "?", description: "Toggle help", group: "system" },
    { keys: "Esc", description: "Cancel", group: "system" },
    { keys: "arrows", description: "Navigate picker grid", group: "navigate" },
    { keys: "Enter", description: "Search first match", group: "navigate" },
];

function setup(surface: AppSurface, visual = false) {
    const card = new FakeNode();
    const created: FakeNode[] = [];
    const renderer = createHelpRenderer({
        card: asElement(card),
        registry: REGISTRY,
        commands: COMMAND_FIXTURE,
        getSurface: () => surface,
        isVisualActive: () => visual,
        createElement: () => {
            const node = new FakeNode();
            created.push(node);
            return asElement(node);
        },
    });
    const walk = (node: FakeNode): FakeNode[] =>
        node.removed ? [] : [node, ...node.children.flatMap(walk)];
    const live = () => walk(card).filter((node) => node !== card);
    const texts = () => live().map((node) => node.innerHTML + node.textContent);
    const toggle = () =>
        live().find(
            (node) => node.textContent !== "" && node.type === "button",
        )!;
    // Key cells (one per row) measure content size across renders.
    const rowCount = () =>
        live().filter((node) => node.className === "help-keys").length;
    return { card, renderer, texts, toggle, rowCount };
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

    it("renders a bare slash key instead of an empty cell", () => {
        const { renderer, texts } = setup("map");
        renderer.render();
        const html = texts().join("\n");
        expect(html).toContain("<kbd>/</kbd>");
        expect(html).toContain("Search the tiles");
    });

    it("labels the surface and groups rows into sections", () => {
        const { renderer, texts } = setup("picker");
        renderer.render();
        const html = texts().join("\n");
        expect(html).toContain("Sidebar keys");
        expect(html).toContain("Mouse");
        expect(html).toContain("Navigate");
        // Sections precede their rows: label before content.
        expect(html.indexOf("Navigate")).toBeLessThan(
            html.indexOf("Navigate picker grid"),
        );
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
        expect(html).toContain("Run what you typed");
        expect(html).toContain("Show earlier commands");
        expect(html).not.toContain("Move cursor");
    });

    it("lists every command with its syntax on the command surface", () => {
        const { renderer, texts } = setup("command");
        renderer.render();
        const html = texts().join("\n");
        expect(html).toContain(":w [name]");
        expect(html).toContain("Save the map");
        expect(html).toContain(":line x1,y1 x2,y2");
        expect(html).toContain("Draw a straight line");
        expect(html).toContain("Command");
    });

    it("renders the chrome row with no map rows", () => {
        const { renderer, texts } = setup("chrome");
        renderer.render();
        const html = texts().join("\n");
        expect(html).toContain("Close and go back");
        expect(html).not.toContain("Move cursor");
    });

    it("adds the visual-kept note off-map only while a region is open", () => {
        const kept = setup("picker", true);
        kept.renderer.render();
        expect(kept.texts().join("\n")).toContain("Your selection is kept");
        const onMap = setup("map", true);
        onMap.renderer.render();
        expect(onMap.texts().join("\n")).not.toContain(
            "Your selection is kept",
        );
        const closed = setup("picker", false);
        closed.renderer.render();
        expect(closed.texts().join("\n")).not.toContain(
            "Your selection is kept",
        );
    });

    it("toggles between slice and full list, clearing stale rows", () => {
        const { renderer, texts, toggle, rowCount } = setup("picker");
        renderer.render();
        const sliceCount = rowCount();
        expect(sliceCount).toBeGreaterThan(0);
        toggle().click();
        const full = texts().join("\n");
        expect(full).toContain("Navigate picker grid");
        expect(full).toContain("Move cursor");
        expect(rowCount()).toBeGreaterThan(sliceCount);
        toggle().click();
        expect(texts().join("\n")).not.toContain("Move cursor");
        expect(rowCount()).toBe(sliceCount);
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
