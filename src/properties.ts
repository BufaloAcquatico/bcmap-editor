// BCMap Editor - reusable object-properties panel.
//
// Slice 2 builds the framework only: a docked sidebar panel, a placeholder,
// and a registry that later feature slices (signs, teleporters, tether,
// object settings) add field providers to. The panel is never a modal: it
// occupies the same spot every time and shares one target-cell model with
// the map's single-click / Enter selection.

import type { ObjectDef } from "./catalog";

export interface CellPoint {
    X: number;
    Y: number;
}

/** Context passed to a provider when it renders fields for a target cell. */
export interface PropertyContext {
    obj: ObjectDef;
    pos: CellPoint;
    /** Request a live map edit; the editor owns undo coalescing. */
    apply: (mutator: () => void) => void;
}

/** A field provider contributed by a later feature slice. */
export interface PropertyProvider {
    id: string;
    matches: (obj: ObjectDef, pos: CellPoint) => boolean;
    render: (host: HTMLElement, context: PropertyContext) => void;
}

const providers: PropertyProvider[] = [];

/** Register a provider; order determines field order in the panel. */
export function registerPropertyProvider(provider: PropertyProvider): void {
    providers.push(provider);
}

/** Focusable elements inside the panel, in DOM order. */
const FIELD_SELECTOR =
    'input:not([tabindex="-1"]), select:not([tabindex="-1"]), ' +
    'textarea:not([tabindex="-1"]), button:not([tabindex="-1"])';

export class PropertyPanel {
    private target: { obj: ObjectDef; pos: CellPoint } | null = null;

    /** Show/hide the panel and its sibling picker/scroll regions. */
    setVisible(visible: boolean): void {
        const panel = document.getElementById("propertiesPanel");
        const content = document.getElementById("sidebarContent");
        const search = document.getElementById("searchBoxWrap");
        panel?.classList.toggle("d-none", !visible);
        content?.classList.toggle("d-none", visible);
        search?.classList.toggle("d-none", visible);
        if (!visible) this.setTarget(null, null);
    }

    /** Set the target cell; null clears to the placeholder state. */
    setTarget(obj: ObjectDef | null, pos: CellPoint | null): void {
        this.target = obj && pos ? { obj, pos } : null;
        const title = document.getElementById("propertiesTitle");
        const fields = document.getElementById("propertiesFields");
        const placeholder = document.getElementById("propertiesPlaceholder");
        if (!title || !fields || !placeholder) return;
        fields.replaceChildren();
        if (!this.target) {
            title.textContent = "Object Properties";
            placeholder.classList.remove("d-none");
            return;
        }
        placeholder.classList.add("d-none");
        const { obj: target, pos: targetPos } = this.target;
        title.textContent = `${target.Type}/${target.Style}`;
        const context: PropertyContext = {
            obj: target,
            pos: targetPos,
            apply: () => {
                // Slice 2 has no editable fields; later slices route their
                // mutations through the editor's undo-coalescing path.
            },
        };
        let rendered = 0;
        for (const provider of providers) {
            if (!provider.matches(target, targetPos)) continue;
            provider.render(fields, context);
            rendered++;
        }
        if (rendered === 0) {
            const note = document.createElement("div");
            note.className = "text-secondary small";
            note.textContent = "No editable properties for this object.";
            fields.appendChild(note);
        }
    }

    getTarget(): { obj: ObjectDef; pos: CellPoint } | null {
        return this.target;
    }

    /** Focusable elements in the panel, in visual order. */
    fields(): HTMLElement[] {
        const panel = document.getElementById("propertiesPanel");
        if (!panel) return [];
        return Array.from(panel.querySelectorAll(FIELD_SELECTOR)).filter(
            (el) => (el as HTMLElement).offsetParent !== null,
        ) as HTMLElement[];
    }

    /** Focus the first field; returns false when the panel is empty. */
    focusFirst(): boolean {
        const field = this.fields()[0];
        if (!field) return false;
        field.focus?.();
        return true;
    }

    /** Focus the last field (Shift+Tab from the map). */
    focusLast(): boolean {
        const fields = this.fields();
        const field = fields[fields.length - 1];
        if (!field) return false;
        field.focus?.();
        return true;
    }

    /**
     * Focus the next (or previous) field relative to `current`.
     * Returns null when the caller should hand focus back to the map.
     */
    focusAdjacent(
        current: HTMLElement | null,
        backwards: boolean,
    ): HTMLElement | null {
        const fields = this.fields();
        if (fields.length === 0) return null;
        const index = current ? fields.indexOf(current) : -1;
        const next = backwards ? index - 1 : index + 1;
        if (next < 0 || next >= fields.length) return null;
        fields[next].focus?.();
        return fields[next];
    }
}
