import {
    createKeybindDispatcher,
    installEditorKeybinds,
    KEYBIND_HELP,
} from "./vim/keybinds";

document.addEventListener("DOMContentLoaded", () => {
    const editor = new (window as any).BCMapEditor("mapCanvas");

    // Store editor globally
    (window as any).editor = editor;
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
    const modeSlot = document.getElementById("statusVimMode");
    const setCommandPromptOpen = (open: boolean) => {
        commandPrompt?.classList.toggle("d-none", !open);
        modeSlot?.classList.toggle("d-none", open);
        if (open) {
            commandPrompt.value = "";
            commandPrompt.focus();
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
        focusSearch: () => searchInput?.focus(),
        handleSidebarKey: (e: KeyboardEvent): boolean => {
            // Esc always returns to the map surface (also from the search
            // box inside the sidebar). The command prompt has its own Esc
            // and lives outside the sidebar.
            if (e.key === "Escape") {
                e.preventDefault();
                (document.activeElement as HTMLElement | null)?.blur?.();
                document.getElementById("mapCanvas")?.focus?.();
                return true;
            }
            // Other keys inside text fields belong to the field.
            const target = e.target as HTMLElement | null;
            if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
                return false;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                editor
                    .getPicker()
                    ?.focusMove(e.key === "ArrowDown" ? "next" : "prev");
                return true;
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                editor.getPicker()?.foldFocused(e.key === "ArrowLeft" ? -1 : 1);
                return true;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                (document.activeElement as HTMLElement | null)?.blur?.();
                document.getElementById("mapCanvas")?.focus?.();
                return true;
            }
            // Any printable character jumps into the search box (D9).
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                searchInput?.focus();
                return true;
            }
            return false;
        },
    });
    window.addEventListener(
        "keydown",
        createKeybindDispatcher(keybindRegistry),
    );

    // Help card rows render from the keybind registry so the card, the
    // README table and the dispatcher can never drift (D13). Mouse-only
    // controls have no keybind entry and are prepended here.
    const helpCard = document.getElementById("controlsHelp");
    if (helpCard) {
        const addRow = (keys: string, description: string) => {
            const row = document.createElement("div");
            const kbds = keys
                .split("/")
                .map((k) => k.trim())
                .filter((k) => k.length > 0)
                .map((k) => `<kbd>${k}</kbd>`)
                .join(" / ");
            row.innerHTML = `${kbds} &mdash; ${description}`;
            helpCard.appendChild(row);
        };
        addRow("Left click / drag", "Paint tile or object");
        addRow("Right drag", "Pan");
        addRow("Wheel", "Zoom");
        KEYBIND_HELP.forEach((entry) => addRow(entry.keys, entry.description));
    }
});
