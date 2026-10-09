import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";
import { compressToBase64 } from "lz-string";

// Mock DOM for testing
const mockCtx = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
};
const mockCanvas = {
    id: "testCanvas",
    width: 800,
    height: 600,
    getContext: vi.fn(() => mockCtx),
    getBoundingClientRect: vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
    })),
    addEventListener: vi.fn(),
};
const mockElements: Record<string, any> = {};
mockElements["testCanvas"] = mockCanvas;
mockElements["tileCategories"] = {
    style: { display: "" },
    innerHTML: "",
    querySelectorAll: vi.fn(() => []),
};
mockElements["objectCategories"] = {
    style: { display: "" },
    innerHTML: "",
    querySelectorAll: vi.fn(() => []),
};
mockElements["zoomLevel"] = { textContent: "" };
global.document = {
    getElementById: vi.fn((id) => mockElements[id] || null),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
} as any;
global.window = { addEventListener: vi.fn() } as any;
global.Image = vi.fn(() => ({ onerror: null, onload: null, src: "" })) as any;

describe("Validation and Edge Cases", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
    });

    it("should reject import with wrong tile length", () => {
        const bad = {
            Type: "Always",
            Tiles: "A".repeat(1599),
            Objects: String.fromCharCode(100).repeat(1600),
        };
        const code = compressToBase64(JSON.stringify(bad));
        expect(() => editor.importMap(code)).toThrow();
    });

    it("should reject import with wrong object length", () => {
        const bad = {
            Type: "Always",
            Tiles: String.fromCharCode(210).repeat(1600),
            Objects: String.fromCharCode(100).repeat(1599),
        };
        const code = compressToBase64(JSON.stringify(bad));
        expect(() => editor.importMap(code)).toThrow();
    });

    it("should reject import with missing Tiles", () => {
        const bad = {
            Type: "Always",
            Objects: String.fromCharCode(100).repeat(1600),
        };
        const code = compressToBase64(JSON.stringify(bad));
        expect(() => editor.importMap(code)).toThrow();
    });

    it("should reject import with missing Objects", () => {
        const bad = {
            Type: "Always",
            Tiles: String.fromCharCode(210).repeat(1600),
        };
        const code = compressToBase64(JSON.stringify(bad));
        expect(() => editor.importMap(code)).toThrow();
    });

    it("should reject import with invalid tile ID", () => {
        const bad = {
            Type: "Always",
            Tiles: String.fromCharCode(99999).repeat(1600),
            Objects: String.fromCharCode(100).repeat(1600),
        };
        const code = compressToBase64(JSON.stringify(bad));
        expect(() => editor.importMap(code)).toThrow(/Invalid tile ID/);
    });

    it("should reject import with invalid object ID", () => {
        const bad = {
            Type: "Always",
            Tiles: String.fromCharCode(210).repeat(1600),
            Objects: String.fromCharCode(99999).repeat(1600),
        };
        const code = compressToBase64(JSON.stringify(bad));
        expect(() => editor.importMap(code)).toThrow(/Invalid object ID/);
    });

    it("should handle import with mixed valid data", () => {
        const exported = editor.exportMap("test");
        const newEditor = new BCMapEditor("testCanvas");
        expect(() => newEditor.importMap(exported)).not.toThrow();
    });

    it("should export/import roundtrip preserve exact data", () => {
        const orig = editor.getMapData();
        const exported = editor.exportMap("roundtrip");
        const newEditor = new BCMapEditor("testCanvas");
        newEditor.importMap(exported);
        const imported = newEditor.getMapData();
        expect(imported.Tiles).toBe(orig.Tiles);
        expect(imported.Objects).toBe(orig.Objects);
        expect(imported.Type).toBe(orig.Type);
    });
});
