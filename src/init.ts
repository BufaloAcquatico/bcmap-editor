import {
    createKeybindDispatcher,
    installEditorKeybinds,
    KEYBIND_HELP,
} from "./vim/keybinds";
import { appSurface, surfaceForTarget } from "./appSurface";
import { createHelpRenderer } from "./helpCard";

document.addEventListener("DOMContentLoaded", () => {
    const editor = new (window as any).BCMapEditor("mapCanvas");

    // Store editor globally
    (window as any).editor = editor;
    // Shared surface store, exposed for end-to-end probing.
    (window as any).appSurface = appSurface;
    editor.populatePickers();

    // Layer toggle
    const layerRadios = document.querySelectorAll('input[name="layer"]');
    layerRadios.forEach((radio) => {
        radio.addEventListener("change", (e) => {
            const target = e.target as HTMLInputElement;
            if (target.checked) {
                editor.setCurrentLayer(target.value as "tile" | "object");
            }
        });
    });

    // New map
    const btnNew = document.getElementById("btnNew");
    const newMapModal = new bootstrap.Modal(
        document.getElementById("newMapModal")!,
    );
    const newMapConfirm = document.getElementById(
        "newMapConfirm",
    ) as HTMLInputElement;
    const btnNewConfirm = document.getElementById(
        "btnNewConfirm",
    ) as HTMLButtonElement;

    btnNew?.addEventListener("click", () => {
        newMapModal.show();
    });

    newMapConfirm?.addEventListener("change", () => {
        btnNewConfirm.disabled = !newMapConfirm.checked;
    });

    btnNewConfirm?.addEventListener("click", () => {
        editor.newMap();
        newMapModal.hide();
        newMapConfirm.checked = false;
        btnNewConfirm.disabled = true;
    });

    // Import
    const btnImport = document.getElementById("btnImport");
    const importModal = new bootstrap.Modal(
        document.getElementById("importModal")!,
    );
    btnImport?.addEventListener("click", () => {
        importModal.show();
    });

    const btnImportConfirm = document.getElementById("btnImportConfirm");
    const importCode = document.getElementById(
        "importCode",
    ) as HTMLTextAreaElement;
    btnImportConfirm?.addEventListener("click", () => {
        try {
            editor.importMap(importCode.value);
            importModal.hide();
            importCode.value = "";
        } catch (e: any) {
            alert(e.message);
        }
    });

    // Export
    const btnExport = document.getElementById("btnExport");
    const exportModal = new bootstrap.Modal(
        document.getElementById("exportModal")!,
    );
    btnExport?.addEventListener("click", () => {
        exportModal.show();
    });

    const btnExportConfirm = document.getElementById("btnExportConfirm");
    const exportName = document.getElementById(
        "exportName",
    ) as HTMLInputElement;
    btnExportConfirm?.addEventListener("click", () => {
        try {
            const code = editor.exportMap(exportName.value || "my-map");
            const blob = new Blob([code], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            try {
                const a = document.createElement("a");
                a.href = url;
                a.download = `${exportName.value || "my-map"}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } finally {
                URL.revokeObjectURL(url);
            }
            exportModal.hide();
        } catch (e: any) {
            alert(e.message);
        }
    });

    // Zoom controls
    const btnZoomIn = document.getElementById("btnZoomIn");
    const btnZoomOut = document.getElementById("btnZoomOut");
    const btnZoomReset = document.getElementById("btnZoomReset");

    btnZoomIn?.addEventListener("click", () => {
        editor.setZoom(editor.zoom * 1.1);
    });

    btnZoomOut?.addEventListener("click", () => {
        editor.setZoom(editor.zoom * 0.9);
    });

    btnZoomReset?.addEventListener("click", () => {
        editor.resetView();
    });

    // Search
    const searchInput = document.getElementById(
        "searchInput",
    ) as HTMLInputElement;
    searchInput?.addEventListener("input", () => {
        editor.filterPickers(searchInput.value);
    });
    const focusMapSurface = () => {
        (document.activeElement as HTMLElement | null)?.blur?.();
        document.getElementById("mapCanvas")?.focus?.();
        appSurface.set("map");
    };
    const focusSearchSelect = () => {
        searchInput?.focus();
        try {
            searchInput?.select?.();
        } catch {
            // select() can throw when the input is not visible; focus is enough.
        }
        appSurface.set("search");
    };
    // Search exits (Enter → first match, Tab/Esc → map) are owned by the
    // keybind dispatcher so help text and behavior share one source.

    // Grid toggle (button + G keybind)
    const btnToggleGrid = document.getElementById("btnToggleGrid");
    const syncGridButton = () => {
        btnToggleGrid?.classList.toggle("active", editor.getGridVisible());
    };
    btnToggleGrid?.addEventListener("click", () => {
        editor.toggleGrid();
        syncGridButton();
    });

    // Undo/Redo (buttons + keybinds)
    const btnUndo = document.getElementById(
        "btnUndo",
    ) as HTMLButtonElement | null;
    const btnRedo = document.getElementById(
        "btnRedo",
    ) as HTMLButtonElement | null;
    const syncHistoryButtons = () => {
        if (btnUndo) btnUndo.disabled = !editor.canUndo();
        if (btnRedo) btnRedo.disabled = !editor.canRedo();
    };
    btnUndo?.addEventListener("click", () => {
        editor.undo();
    });
    btnRedo?.addEventListener("click", () => {
        editor.redo();
    });
    editor.onHistoryChange = syncHistoryButtons;
    syncHistoryButtons();

    // Vim command line (`:` in the status bar): prompt replaces the mode
    // slot, Enter runs a command, Escape cancels, Up/Down recalls history.
    const commandPrompt = document.getElementById(
        "commandPrompt",
    ) as HTMLInputElement;
    const commandPromptWrap = document.getElementById("commandPromptWrap");
    const modeSlot = document.getElementById("statusVimMode");
    const setCommandPromptOpen = (open: boolean) => {
        // The wrap (vim `:` glyph + seamless input) swaps with the mode
        // slot; the input itself keeps its id, focus and key handling.
        commandPromptWrap?.classList.toggle("d-none", !open);
        modeSlot?.classList.toggle("d-none", open);
        if (open) {
            commandPrompt.value = "";
            commandPrompt.focus();
            appSurface.set("command");
        } else {
            // Closing returns to the map so keyboard flow continues;
            // a modal opened by the command re-focuses via the backstop.
            focusMapSurface();
        }
    };
    const commandHistory: string[] = [];
    let historyIndex = -1;
    commandPrompt?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const input = commandPrompt.value;
            if (input.trim()) {
                commandHistory.push(input);
                historyIndex = commandHistory.length;
            }
            setCommandPromptOpen(false);
            editor.handleVimCommand(input);
            commandPrompt.value = "";
        } else if (e.key === "Escape") {
            e.preventDefault();
            commandPrompt.value = "";
            setCommandPromptOpen(false);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                commandPrompt.value = commandHistory[historyIndex];
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                commandPrompt.value = commandHistory[historyIndex];
            } else {
                historyIndex = commandHistory.length;
                commandPrompt.value = "";
            }
        }
    });
    // Leaving the prompt any other way (click-away, Tab out) cancels it
    // and restores the mode slot. Without this, focus departure orphans
    // the prompt open with the mode hidden: a later Escape lands
    // elsewhere and nothing ever brings the mode back. Deliberately does
    // NOT refocus: focus already sits where the user put it, and the
    // focus backstop records that surface. Idempotent with Enter/Escape,
    // whose close path hides the wrap before refocusing (guard below).
    commandPrompt?.addEventListener("blur", () => {
        if (commandPromptWrap?.classList.contains("d-none")) return;
        commandPrompt.value = "";
        commandPromptWrap?.classList.add("d-none");
        modeSlot?.classList.remove("d-none");
    });

    // :w / :write reuses the export path; :e reuses the import modal.
    editor.onWriteMapRequest = (name?: string) => {
        const mapName = name || "my-map";
        const code = editor.exportMap(mapName);
        const blob = new Blob([code], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        try {
            const a = document.createElement("a");
            a.href = url;
            a.download = `${mapName}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } finally {
            URL.revokeObjectURL(url);
        }
    };
    editor.onImportRequest = () => importModal.show();

    // Arrow key → visual-grid direction (the router pre-filters to these).
    const GRID_DIRECTION_BY_ARROW_KEY: Record<
        string,
        "up" | "down" | "left" | "right"
    > = {
        ArrowDown: "down",
        ArrowUp: "up",
        ArrowLeft: "left",
        ArrowRight: "right",
    };

    const keybindRegistry = installEditorKeybinds({
        toggleGrid: () => {
            editor.toggleGrid();
            syncGridButton();
        },
        toggleHelp: () => editor.toggleHelp(),
        undo: () => editor.undo(),
        redo: () => editor.redo(),
        handleVimKey: (e: KeyboardEvent) => editor.handleVimKey(e),
        openCommandPrompt: () => setCommandPromptOpen(true),
        focusSearch: () => focusSearchSelect(),
        focusPicker: () => {
            if (
                editor
                    .getPicker()
                    ?.focusResume(
                        editor.getSelectedTile()?.ID ?? null,
                        editor.getSelectedObject()?.ID ?? null,
                    )
            ) {
                appSurface.set("picker");
            }
        },
        focusMap: () => focusMapSurface(),
        focusFirstMatch: () => {
            if (editor.getPicker()?.focusFirstMatch()) {
                appSurface.set("picker");
            }
        },
        handleSidebarKey: (e: KeyboardEvent): boolean => {
            // Esc always returns to the map surface (also from the search
            // box inside the sidebar). The command prompt has its own Esc
            // and lives outside the sidebar.
            if (e.key === "Escape") {
                e.preventDefault();
                focusMapSurface();
                return true;
            }
            // Tab from picker headers/sprites returns to the map (no commit;
            // Enter/Space commits via keyboard click → focus returns there).
            if (e.key === "Tab") {
                const target = e.target as HTMLElement | null;
                if (
                    target?.tagName === "INPUT" ||
                    target?.tagName === "TEXTAREA"
                ) {
                    return false;
                }
                e.preventDefault();
                focusMapSurface();
                return true;
            }
            // Other keys inside text fields belong to the field (search
            // Enter/Tab are owned by dispatcher bindings, not here).
            const target = e.target as HTMLElement | null;
            if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
                return false;
            }
            // Visual-grid arrows: Up/Down/Left/Right walk what the eye sees,
            // pin at edges, fold only on headers (picker owns the rule).
            if (
                e.key === "ArrowDown" ||
                e.key === "ArrowUp" ||
                e.key === "ArrowLeft" ||
                e.key === "ArrowRight"
            ) {
                e.preventDefault();
                editor
                    .getPicker()
                    ?.focusGrid(GRID_DIRECTION_BY_ARROW_KEY[e.key]);
                return true;
            }
            // `/` summons search from picker headers/sprites (select-all).
            if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                focusSearchSelect();
                return true;
            }
            // `:` opens the command line even from the picker (it can never
            // match a tile/style name, so search would only swallow it).
            // Decline so the `:` binding opens the prompt instead.
            if (e.key === ":" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                return false;
            }
            // Any other printable character jumps into the search box.
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                focusSearchSelect();
                return true;
            }
            return false;
        },
    });
    window.addEventListener(
        "keydown",
        createKeybindDispatcher(keybindRegistry),
    );

    // Backstop: any focus move the keyboard paths above did not make
    // themselves (mouse, touch, Tab order, modals) corrects the store.
    // Programmatic moves already set it synchronously; sets are idempotent.
    // Focus inside the help card itself is ignored: re-rendering help on
    // its own toggle's focus would destroy the toggle mid-click (focus
    // lands before click fires), so the toggle could never activate.
    document.addEventListener("focusin", (e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest?.("#controlsHelp")) return;
        appSurface.set(surfaceForTarget(target));
    });

    // Context-sensitive help lives in its own module (unit-tested);
    // here it is only constructed, re-rendered on surface change, and
    // rendered once for the initial paint.
    const helpCard = document.getElementById("controlsHelp");
    if (helpCard) {
        const helpRenderer = createHelpRenderer({
            card: helpCard,
            registry: KEYBIND_HELP,
            getSurface: () => appSurface.get(),
            isVisualActive: () => editor.isVisualActive(),
            createElement: (tag) => document.createElement(tag),
        });
        appSurface.subscribe(() => helpRenderer.render());
        helpRenderer.render();
    }
});
