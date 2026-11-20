// BCMap Editor - tether-point provider for the shared Properties panel.
// A cell marked {Type:"Tether"} is a valid anchor; leashes are player state.

import { registerPropertyProvider } from "./properties";
import { TETHER_OBJECT_IDS } from "./constants";

type EditorBridge = {
    getCellConfig(pos: { X: number; Y: number }): { Type: string } | null;
    setCellConfig(
        pos: { X: number; Y: number },
        config: { Type: "Tether" } | null,
    ): void;
};

registerPropertyProvider({
    id: "tether",
    configType: "Tether",
    matches: (obj) => TETHER_OBJECT_IDS.has(obj.ID),
    render: (host, context) => {
        const e = (window as any).editor as EditorBridge;
        const label = document.createElement("label");
        label.className = "d-flex align-items-center gap-2 small";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input";
        checkbox.setAttribute("aria-label", "Tether point");
        checkbox.checked = e.getCellConfig(context.pos)?.Type === "Tether";
        checkbox.addEventListener("change", () => {
            e.setCellConfig(
                context.pos,
                checkbox.checked ? { Type: "Tether" } : null,
            );
        });
        const text = document.createElement("span");
        text.textContent = "Tether point";
        label.append(checkbox, text);
        host.appendChild(label);
    },
});
