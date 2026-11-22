// BCMap Editor - teleporter-pad provider for the shared Properties panel.
// Manual pairing only: auto-pairing is deferred to the refinement slice.

import { registerPropertyProvider } from "./properties";
import { TELEPORTER_OBJECT_ID } from "./constants";
import { splitPadColor, type TeleporterCellConfig } from "./mapdata";

type EditorBridge = {
    getCellConfig(pos: { X: number; Y: number }): TeleporterCellConfig | null;
    isTeleporterPickActive(): boolean;
    startTeleporterPick(pos: { X: number; Y: number }): void;
    cancelTeleporterPick(): void;
    removeTeleporterDestination(pos: { X: number; Y: number }): void;
    setTeleporterColor(pos: { X: number; Y: number }, color: string): void;
    getTeleporterTwoWay(pos: { X: number; Y: number }): {
        dest: { X: number; Y: number } | null;
        destIsPad: boolean;
        twoWay: boolean;
    };
    makeTeleporterTwoWay(pos: { X: number; Y: number }): void;
    refreshPropertyPanel(): void;
};

const getTeleportEditor = () => (window as any).editor as EditorBridge;

/** UI fallback when a pad has no stored colour (BC's first default swatch). */
const DEFAULT_PAD_COLOR = "#3C8CFF";

registerPropertyProvider({
    id: "teleporter",
    title: "Teleport Pad",
    configType: "Teleporter",
    matches: (obj) => obj.ID === TELEPORTER_OBJECT_ID,
    render: (host, context) => {
        const e = getTeleportEditor();
        const pos = context.pos;
        const wrap = document.createElement("div");
        wrap.className = "small";

        const status = document.createElement("div");
        status.className = "text-secondary mb-2";
        host.appendChild(status);

        const row = document.createElement("div");
        row.className = "d-flex gap-2 mb-2";
        const pickBtn = document.createElement("button");
        pickBtn.type = "button";
        pickBtn.className = "btn btn-sm btn-outline-light";
        pickBtn.textContent = e.isTeleporterPickActive()
            ? "Cancel pick"
            : "Pick on map";
        pickBtn.addEventListener("click", () => {
            if (e.isTeleporterPickActive()) e.cancelTeleporterPick();
            else e.startTeleporterPick(pos);
            e.refreshPropertyPanel();
        });
        row.appendChild(pickBtn);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-sm btn-outline-light";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
            e.removeTeleporterDestination(pos);
        });
        row.appendChild(removeBtn);

        const twoWayBtn = document.createElement("button");
        twoWayBtn.type = "button";
        twoWayBtn.className = "btn btn-sm btn-outline-light";
        twoWayBtn.textContent = "Make two-way";
        twoWayBtn.addEventListener("click", () => e.makeTeleporterTwoWay(pos));
        row.appendChild(twoWayBtn);
        wrap.appendChild(row);

        const colorRow = document.createElement("div");
        colorRow.className = "d-flex align-items-center gap-2";
        const color = document.createElement("input");
        color.type = "color";
        color.className = "form-control form-control-sm";
        color.style.width = "3rem";
        color.setAttribute("aria-label", "Pad colour");
        const opacity = document.createElement("input");
        opacity.type = "range";
        opacity.min = "0";
        opacity.max = "255";
        opacity.className = "form-range";
        opacity.setAttribute("aria-label", "Pad opacity");
        const applyColor = () => {
            const a = Number(opacity.value)
                .toString(16)
                .padStart(2, "0")
                .toUpperCase();
            e.setTeleporterColor(pos, color.value.toUpperCase() + a);
        };
        color.addEventListener("change", applyColor);
        opacity.addEventListener("change", applyColor);
        const label = document.createElement("span");
        label.className = "text-secondary";
        label.textContent = "Colour / opacity";
        colorRow.append(label, color, opacity);
        wrap.appendChild(colorRow);

        const current = e.getCellConfig(pos);
        const { hex, alpha } = splitPadColor(current?.Color) ?? {
            hex: DEFAULT_PAD_COLOR,
            alpha: 255,
        };
        color.value = hex.toLowerCase();
        opacity.value = String(alpha);

        const { dest, destIsPad, twoWay } = e.getTeleporterTwoWay(pos);
        status.textContent = twoWay
            ? "Sends both ways"
            : dest
              ? `Sends to (${dest.X}, ${dest.Y})`
              : "No destination";
        removeBtn.classList.toggle("d-none", !dest);
        twoWayBtn.classList.toggle("d-none", !(dest && destIsPad && !twoWay));

        host.appendChild(wrap);
    },
});
