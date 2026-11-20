// BCMap Editor - sign-text provider for the shared Properties panel.
//
// BC keeps sign text in the map's CellData and shows it only in a click
// dialog; we surface the same text in the docked panel with no canvas marker.

import { registerPropertyProvider, type PropertyContext } from "./properties";

const SIGN_IDS = new Set([3520, 3521, 3522, 3523]);
const MAX_SIGN_TEXT = 150;

function inputKind(e: Event): "insert" | "delete" {
    const type = e instanceof InputEvent ? e.inputType : "";
    if (type.startsWith("delete")) return "delete";
    if (type.startsWith("insert")) return "insert";
    return "insert";
}

registerPropertyProvider({
    id: "sign",
    matches: (obj) => SIGN_IDS.has(obj.ID),
    render: (host, context: PropertyContext) => {
        const editor = (window as any).editor as {
            getPropertyText(pos: { X: number; Y: number }): string;
            beginPropertyEdit(): void;
            propertyEditInput(
                kind: "insert" | "delete",
                pos: { X: number; Y: number },
                value: string,
            ): void;
            endPropertyEdit(): void;
            undo(): void;
            redo(): void;
        };
        const label = document.createElement("label");
        label.className = "d-block small text-secondary mb-1";
        label.textContent = "Sign text";
        const field = document.createElement("textarea");
        field.id = "signText";
        field.className = "form-control form-control-sm bg-dark text-light";
        field.rows = 3;
        field.maxLength = MAX_SIGN_TEXT;
        field.value = editor.getPropertyText(context.pos);
        field.setAttribute("aria-label", "Sign text");
        field.addEventListener("focus", () => editor.beginPropertyEdit());
        field.addEventListener("input", (e) => {
            const kind = inputKind(e);
            if (field.value.length > MAX_SIGN_TEXT) {
                field.value = field.value.slice(0, MAX_SIGN_TEXT);
            }
            editor.propertyEditInput(kind, context.pos, field.value);
        });
        field.addEventListener("blur", () => editor.endPropertyEdit());
        // Native textarea undo/redo would desync map data: route to editor.
        field.addEventListener("keydown", (e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (!mod) return;
            const key = e.key.toLowerCase();
            const redo = (key === "z" && e.shiftKey) || key === "y";
            if (key !== "z" && key !== "y") return;
            e.preventDefault();
            editor.endPropertyEdit();
            if (redo) editor.redo();
            else editor.undo();
        });
        label.appendChild(field);
        host.appendChild(label);
    },
});
