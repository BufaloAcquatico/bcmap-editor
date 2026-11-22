// BCMap Editor - object transform/colour/decal provider for the Properties
// panel. Full parity with R134: rotation, size, colourable layers, decal.

import { registerPropertyProvider } from "./properties";
import type { ObjectDef } from "./catalog";
import type { ObjectSettings } from "./objectSettings";
import { DECALS } from "./decals";
import { SIGN_OBJECT_IDS, TELEPORTER_OBJECT_ID } from "./constants";

function hasOwnConfig(obj: ObjectDef): boolean {
    return SIGN_OBJECT_IDS.has(obj.ID) || obj.ID === TELEPORTER_OBJECT_ID;
}

type EditorBridge = {
    getObjectSettings(pos: { X: number; Y: number }): ObjectSettings | null;
    beginObjectSettingsEdit(): void;
    setObjectSettings(
        pos: { X: number; Y: number },
        changes: Partial<Omit<ObjectSettings, "ID">>,
    ): boolean;
    endObjectSettingsEdit(): void;
};

const getObjectSettingsEditor = () => (window as any).editor as EditorBridge;

export const DECAL_NAMES: readonly string[] = DECALS.map((d) => d.name);

function canTransform(obj: ObjectDef): boolean {
    return (
        !obj.JoinsNeighbors &&
        !obj.CanPlaceOnWalls &&
        obj.CanBeCustomized !== false
    );
}

registerPropertyProvider({
    id: "object-settings",
    title: "Object Appearance",
    matches: (obj) =>
        !hasOwnConfig(obj) &&
        (canTransform(obj) ||
            (obj.Layers?.some((l) => l.IsColorable) ?? false) ||
            !!obj.DecalArea),
    render: (host, context) => {
        const e = getObjectSettingsEditor();
        const pos = context.pos;
        const obj = context.obj;
        const current = e.getObjectSettings(pos);
        const wrap = document.createElement("div");
        wrap.className = "small";

        const slider = (
            label: string,
            key: "Rotation" | "Size",
            min: number,
            max: number,
            neutral: number,
        ) => {
            const row = document.createElement("div");
            row.className = "mb-2";
            const cap = document.createElement("label");
            cap.className = "text-secondary d-block";
            cap.textContent = label;
            const input = document.createElement("input");
            input.type = "range";
            input.min = String(min);
            input.max = String(max);
            input.value = String(current?.[key] ?? neutral);
            input.className = "form-range";
            input.setAttribute("aria-label", label);
            input.addEventListener("pointerdown", () =>
                e.beginObjectSettingsEdit(),
            );
            input.addEventListener("input", () => {
                e.setObjectSettings(pos, { [key]: Number(input.value) });
            });
            input.addEventListener("change", () => e.endObjectSettingsEdit());
            row.append(cap, input);
            return row;
        };

        if (canTransform(obj)) {
            wrap.appendChild(slider("Rotation", "Rotation", 0, 359, 0));
            wrap.appendChild(slider("Size", "Size", 50, 200, 100));
            const reset = document.createElement("button");
            reset.type = "button";
            reset.className = "btn btn-sm btn-outline-light mb-2";
            reset.textContent = "Reset transform";
            reset.addEventListener("click", () => {
                e.beginObjectSettingsEdit();
                e.setObjectSettings(pos, { Rotation: 0, Size: 100 });
                e.endObjectSettingsEdit();
            });
            wrap.appendChild(reset);
        }

        // Helper: a grid row of name / always-clickable colour picker /
        // reset-to-default button, used for both layers and the decal.
        const colourRow = (
            name: string,
            pickerLabel: string,
            resetLabel: string,
            initial: string,
            defaultValue: string,
            onPick: (hex: string) => void,
            onReset: () => void,
        ): { row: HTMLElement; input: HTMLInputElement } => {
            const row = document.createElement("div");
            row.className = "prop-colour-row";
            const label = document.createElement("span");
            label.className = "prop-name text-secondary";
            label.textContent = name;
            const input = document.createElement("input");
            input.type = "color";
            input.className = "form-control form-control-sm";
            input.style.width = "3rem";
            input.setAttribute("aria-label", pickerLabel);
            input.value = initial.toLowerCase();
            input.addEventListener("change", () => onPick(input.value));
            const reset = document.createElement("button");
            reset.type = "button";
            reset.className = "btn btn-sm btn-outline-light";
            reset.textContent = "Reset";
            reset.setAttribute("aria-label", resetLabel);
            reset.addEventListener("click", () => {
                onReset();
                input.value = defaultValue.toLowerCase();
            });
            row.append(label, input, reset);
            return { row, input };
        };

        const colorable = (obj.Layers ?? []).filter((l) => l.IsColorable);
        colorable.forEach((layer, index) => {
            const initial =
                current?.Colors?.[index] && current.Colors[index] !== "Default"
                    ? current.Colors[index]
                    : (layer.DefaultColor ?? "#FFFFFF");
            const defaultValue = layer.DefaultColor ?? "#FFFFFF";
            const pick = (hex: string) => {
                // Read live settings so other layers edited in this panel are
                // not clobbered by a stale render-time snapshot.
                const live = e.getObjectSettings(pos);
                const colors = [
                    ...(live?.Colors ??
                        current?.Colors ??
                        colorable.map(() => "Default")),
                ];
                while (colors.length < colorable.length) colors.push("Default");
                colors[index] = hex.toUpperCase();
                e.setObjectSettings(pos, { Colors: colors });
            };
            const reset = () => {
                const live = e.getObjectSettings(pos);
                const colors = [
                    ...(live?.Colors ??
                        current?.Colors ??
                        colorable.map(() => "Default")),
                ];
                while (colors.length < colorable.length) colors.push("Default");
                colors[index] = "Default";
                e.setObjectSettings(pos, { Colors: colors });
            };
            const { row } = colourRow(
                layer.Name || "Colour",
                `Layer ${index} colour`,
                `Reset layer ${index} colour to default`,
                initial,
                defaultValue,
                pick,
                reset,
            );
            wrap.appendChild(row);
        });

        if (obj.DecalArea) {
            const select = document.createElement("select");
            select.className = "form-select form-select-sm mb-2";
            select.setAttribute("aria-label", "Decal");
            const none = document.createElement("option");
            none.value = "";
            none.textContent = "None";
            select.appendChild(none);
            for (const decal of DECALS) {
                const option = document.createElement("option");
                option.value = decal.name;
                option.textContent = decal.description;
                select.appendChild(option);
            }
            select.value = current?.Decal ?? "";
            const { row: colorRow } = colourRow(
                "Decal colour",
                "Decal colour",
                "Reset decal colour to default",
                current?.DecalColor ?? "#FFFFFF",
                "#FFFFFF",
                (hex) =>
                    e.setObjectSettings(pos, { DecalColor: hex.toUpperCase() }),
                () => e.setObjectSettings(pos, { DecalColor: undefined }),
            );
            colorRow.classList.toggle("d-none", !current?.Decal);
            select.addEventListener("change", () => {
                e.setObjectSettings(pos, { Decal: select.value || undefined });
                colorRow.classList.toggle("d-none", !select.value);
            });
            wrap.append(select, colorRow);
        }

        host.appendChild(wrap);
    },
});
