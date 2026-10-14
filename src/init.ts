import {
    createKeybindDispatcher,
    installEditorKeybinds,
    KEYBIND_HELP,
} from "./vim/keybinds";
import { appSurface, surfaceForTarget } from "./appSurface";
import { COMMANDS } from "./vim/commands";
import { createHelpRenderer } from "./helpCard";
import { fadeIn, MOTION_MS, MOTION_QUICK_MS } from "./anim";
import {
    MAX_SLOTS,
    deleteSlot,
    formatAbsoluteTime,
    formatRelativeTime,
    isDirty,
    isStorageAvailable,
    listSlots,
    loadSlot,
    sanitizeName,
    saveSlot,
    snapshotMap,
    type SlotMeta,
} from "./slots";

document.addEventListener("DOMContentLoaded", () => {
    // Motion durations are canonical in src/anim.ts; mirror them into
    // CSS so stylesheet, app code and tests share one source of truth.
    // (The :root values below are pre-JS fallbacks only.)
    document.documentElement.style.setProperty("--motion-ms", `${MOTION_MS}ms`);
    document.documentElement.style.setProperty(
        "--motion-quick-ms",
        `${MOTION_QUICK_MS}ms`,
    );
    // One-line proof of which tuning is live (see it in devtools after
    // every rebuild; source edits need `npm run build` to reach the page).
    console.info(
        `Motion durations: standard ${MOTION_MS}ms, quick ${MOTION_QUICK_MS}ms.`,
    );
    const editor = new (window as any).BCMapEditor("mapCanvas");

    // Store editor globally
    (window as any).editor = editor;
    // Shared surface store, exposed for end-to-end probing.
    (window as any).appSurface = appSurface;
    editor.populatePickers();

    // Layer toggle: one path shared by the radios and the [ / ] keybind.
    // Setting .checked directly (never a synthetic event) keeps a single
    // switch per interaction - no double-handling, no recursion.
    const layerTileRadio = document.getElementById(
        "layerTile",
    ) as HTMLInputElement | null;
    const layerObjectRadio = document.getElementById(
        "layerObject",
    ) as HTMLInputElement | null;
    const setLayer = (layer: "tile" | "object") => {
        const radio = layer === "tile" ? layerTileRadio : layerObjectRadio;
        if (radio) radio.checked = true;
        editor.setCurrentLayer(layer);
    };
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
        // State reset lives in the slots section below (doNewMap); safe to
        // call here — handlers run long after init finishes.
        doNewMap();
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
            // A pasted map is new work: it belongs to no slot.
            forgetSlotState();
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
        editor.zoomBy(1.1);
    });

    btnZoomOut?.addEventListener("click", () => {
        editor.zoomBy(0.9);
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

    // Map menu: the Keyboard Shortcuts item toggles the same help card as `?`.
    const menuShortcuts = document.getElementById("menuShortcuts");
    menuShortcuts?.addEventListener("click", () => editor.toggleHelp());

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
    editor.onHistoryChange = () => {
        syncHistoryButtons();
        // Every committed stroke can flip the dirty marker (defined in the
        // slots section below; runs only on edits, long after init).
        syncSlotIndicator();
    };
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
            commandPromptWrap?.classList.remove("d-none");
            modeSlot?.classList.add("d-none");
            commandPrompt.focus();
            appSurface.set("command");
            if (commandPromptWrap) fadeIn(commandPromptWrap);
        } else {
            // Dismissal fades the mode slot back in while keyboard flow
            // (focus) moves immediately underneath — no layout overlap,
            // since only one of the two is ever laid out at a time.
            commandPromptWrap?.classList.add("d-none");
            modeSlot?.classList.remove("d-none");
            if (modeSlot) fadeIn(modeSlot);
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
        if (modeSlot) fadeIn(modeSlot);
    });

    // Save slots (browser storage): current-name state, dirty baseline,
    // availability probe. The store itself lives in src/slots.ts.
    let storageAvailable = false;
    try {
        storageAvailable =
            typeof window.localStorage !== "undefined" &&
            isStorageAvailable(window.localStorage);
    } catch {
        storageAvailable = false;
    }
    if (navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
    }
    let currentSlotName: string | null = null;
    let currentSavedAt: number | null = null;
    let baselineCode = snapshotMap(editor.getMapData());

    const slotNameEl = document.getElementById("statusSlotName");
    const syncSlotIndicator = () => {
        if (!slotNameEl) return;
        if (!currentSlotName) {
            slotNameEl.textContent = "";
            slotNameEl.title = "";
            return;
        }
        const dirty = isDirty(baselineCode, editor.getMapData());
        slotNameEl.textContent = dirty
            ? `${currentSlotName} [+]`
            : currentSlotName;
        slotNameEl.title =
            currentSavedAt === null
                ? currentSlotName
                : `${currentSlotName} — saved ${formatAbsoluteTime(currentSavedAt)}`;
    };

    /** The map was replaced (new/import/load): it belongs to no slot yet. */
    const forgetSlotState = () => {
        currentSlotName = null;
        currentSavedAt = null;
        baselineCode = snapshotMap(editor.getMapData());
        syncSlotIndicator();
    };

    const doNewMap = () => {
        editor.newMap();
        forgetSlotState();
    };

    const downloadTextFile = (filename: string, text: string) => {
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        try {
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    const doSaveSlot = (rawName: string): void => {
        if (!storageAvailable) {
            editor.showVimFeedback(
                "Browser storage is unavailable here — export to a file instead.",
            );
            return;
        }
        const result = saveSlot(window.localStorage, rawName, {
            code: editor.exportMap(rawName),
            savedAt: Date.now(),
            thumbnail: editor.captureMapThumbnail(),
        });
        if (!result.ok) {
            editor.showVimFeedback(result.error);
            return;
        }
        currentSlotName = result.name;
        currentSavedAt = Date.now();
        baselineCode = snapshotMap(editor.getMapData());
        syncSlotIndicator();
        editor.showVimFeedback(`"${result.name}" saved`);
    };

    // :export [name] keeps the original download path; :w moved to slots.
    editor.onExportMapRequest = (name?: string) => {
        if (name) {
            if (!storageAvailable) {
                editor.showVimFeedback(
                    "Browser storage is unavailable here — export to a file instead.",
                );
                return;
            }
            const slot = loadSlot(window.localStorage, name);
            if (!slot) {
                editor.showVimFeedback(`E486: No saved map named "${name}"`);
                return;
            }
            downloadTextFile(`${name}.txt`, slot.code);
            return;
        }
        const mapName = currentSlotName || exportName.value || "my-map";
        downloadTextFile(`${mapName}.txt`, editor.exportMap(mapName));
    };
    editor.onSaveSlotRequest = (name: string) => doSaveSlot(name);
    editor.onNewMapRequest = () => doNewMap();
    editor.onImportRequest = () => importModal.show();
    editor.onSlotStateRequest = () => ({
        available: storageAvailable,
        currentName: currentSlotName,
        hasSlot: (name: string) =>
            storageAvailable && loadSlot(window.localStorage, name) !== null,
        isDirty: isDirty(baselineCode, editor.getMapData()),
        isFull:
            storageAvailable &&
            listSlots(window.localStorage).length >= MAX_SLOTS,
    });

    // Save modal: prefill with the current slot name; filter typing to the
    // store charset; an existing foreign name flips to replace-confirm.
    const menuSave = document.getElementById("menuSave");
    const saveModal = new bootstrap.Modal(
        document.getElementById("saveModal")!,
    );
    const saveName = document.getElementById(
        "saveName",
    ) as HTMLInputElement | null;
    const saveMessage = document.getElementById("saveMessage");
    const btnSaveConfirm = document.getElementById(
        "btnSaveConfirm",
    ) as HTMLButtonElement | null;
    let saveArmedReplace: string | null = null;

    const setSaveMessage = (text: string | null) => {
        if (!saveMessage) return;
        if (text === null) {
            saveMessage.textContent = "";
            saveMessage.classList.add("d-none");
        } else {
            saveMessage.textContent = text;
            saveMessage.classList.remove("d-none");
        }
    };
    const resetSaveModal = () => {
        saveArmedReplace = null;
        btnSaveConfirm?.classList.remove("btn-danger");
        btnSaveConfirm?.classList.add("btn-primary");
        setSaveMessage(null);
    };
    menuSave?.addEventListener("click", () => {
        if (!storageAvailable) {
            editor.showVimFeedback(
                "Browser storage is unavailable here — export to a file instead.",
            );
            return;
        }
        resetSaveModal();
        if (saveName) {
            saveName.value = currentSlotName ?? "";
            saveModal.show();
            saveName.focus();
            try {
                saveName.select();
            } catch {
                // Focus is enough when select() is unavailable.
            }
        }
    });
    saveName?.addEventListener("input", () => {
        const clean = sanitizeName(saveName.value);
        if (clean !== saveName.value) saveName.value = clean;
        if (saveArmedReplace !== null && saveName.value !== saveArmedReplace) {
            resetSaveModal();
        }
    });
    btnSaveConfirm?.addEventListener("click", () => {
        if (!saveName) return;
        const name = sanitizeName(saveName.value);
        if (!name) {
            setSaveMessage("Enter a name — letters, numbers, dash and space.");
            return;
        }
        const existing =
            storageAvailable && loadSlot(window.localStorage, name);
        const isCurrent =
            currentSlotName !== null &&
            name.toLowerCase() === currentSlotName.toLowerCase();
        if (existing && !isCurrent && saveArmedReplace !== name) {
            saveArmedReplace = name;
            setSaveMessage(
                `Replace "${name}" (saved ${formatRelativeTime(existing.savedAt, Date.now())})? This cannot be undone — export it first to keep it.`,
            );
            btnSaveConfirm?.classList.remove("btn-primary");
            btnSaveConfirm?.classList.add("btn-danger");
            return;
        }
        doSaveSlot(name);
        saveModal.hide();
    });
    if (!storageAvailable && menuSave) {
        menuSave.setAttribute("disabled", "");
        menuSave.setAttribute(
            "title",
            "Browser storage is unavailable here — export to a file instead.",
        );
    }
    syncSlotIndicator();

    // Saved Maps window: list, load, export, delete (delete is UI-only).
    const menuLoad = document.getElementById("menuLoad");
    const slotsModal = new bootstrap.Modal(
        document.getElementById("slotsModal")!,
    );
    const slotsList = document.getElementById("slotsList");
    const slotsEmpty = document.getElementById("slotsEmpty");
    const slotsCount = document.getElementById("slotsCount");
    const confirmModalEl = document.getElementById("confirmModal");
    const confirmModal = new bootstrap.Modal(confirmModalEl!);
    const confirmTitle = document.getElementById("confirmTitle");
    const confirmBody = document.getElementById("confirmBody");
    const btnConfirmOk = document.getElementById(
        "btnConfirmOk",
    ) as HTMLButtonElement | null;

    /** One-shot destructive confirm; resolves false on dismiss. */
    const askConfirm = (
        title: string,
        body: string,
        okLabel: string,
    ): Promise<boolean> =>
        new Promise((resolve) => {
            if (
                !confirmTitle ||
                !confirmBody ||
                !btnConfirmOk ||
                !confirmModalEl
            ) {
                resolve(false);
                return;
            }
            confirmTitle.textContent = title;
            confirmBody.textContent = body;
            btnConfirmOk.textContent = okLabel;
            const done = (value: boolean) => {
                confirmModalEl.removeEventListener("hidden.bs.modal", onHide);
                btnConfirmOk.removeEventListener("click", onOk);
                resolve(value);
            };
            const onOk = () => {
                done(true);
                confirmModal.hide();
            };
            const onHide = () => done(false);
            btnConfirmOk.addEventListener("click", onOk);
            confirmModalEl.addEventListener("hidden.bs.modal", onHide);
            confirmModal.show();
        });

    const smallButton = (label: string, cls: string): HTMLButtonElement => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn btn-sm ${cls}`;
        btn.textContent = label;
        return btn;
    };

    const renderSlotRow = (meta: SlotMeta): HTMLElement => {
        const row = document.createElement("div");
        row.className =
            "list-group-item bg-transparent text-light border-secondary d-flex align-items-center gap-3";
        const img = document.createElement("img");
        img.src = meta.thumbnail;
        img.width = 72;
        img.height = 72;
        img.className = "rounded border border-secondary flex-shrink-0";
        img.alt = "";
        const info = document.createElement("div");
        info.className = "flex-grow-1";
        info.style.minWidth = "0";
        const nameEl = document.createElement("div");
        nameEl.className = "fw-semibold text-truncate";
        nameEl.textContent = meta.name;
        const timeEl = document.createElement("div");
        timeEl.className = "text-muted small";
        timeEl.textContent = formatRelativeTime(meta.savedAt, Date.now());
        timeEl.title = formatAbsoluteTime(meta.savedAt);
        info.append(nameEl, timeEl);
        const loadBtn = smallButton("Load", "btn-outline-light");
        loadBtn.addEventListener("click", () => {
            void doLoadSlot(meta.name, { force: false });
        });
        const exportBtn = smallButton("Export", "btn-outline-light");
        exportBtn.addEventListener("click", () => {
            const slot = storageAvailable
                ? loadSlot(window.localStorage, meta.name)
                : null;
            if (slot) downloadTextFile(`${meta.name}.txt`, slot.code);
        });
        const deleteBtn = smallButton("", "btn-outline-danger");
        const deleteIcon = document.createElement("i");
        deleteIcon.className = "bi bi-x";
        deleteBtn.append(deleteIcon);
        deleteBtn.setAttribute("aria-label", `Delete ${meta.name}`);
        deleteBtn.addEventListener("click", () => {
            void doDeleteSlot(meta.name);
        });
        row.append(img, info, loadBtn, exportBtn, deleteBtn);
        return row;
    };

    const refreshSlotsWindow = () => {
        if (!storageAvailable || !slotsList) return;
        const slots = listSlots(window.localStorage);
        if (slotsCount)
            slotsCount.textContent = `${slots.length} / ${MAX_SLOTS}`;
        slotsEmpty?.classList.toggle("d-none", slots.length > 0);
        slotsList.replaceChildren(...slots.map(renderSlotRow));
    };

    const openSlotsWindow = () => {
        if (!storageAvailable) {
            editor.showVimFeedback(
                "Browser storage is unavailable here — export to a file instead.",
            );
            return;
        }
        refreshSlotsWindow();
        slotsModal.show();
    };

    const doLoadSlot = async (name: string, opts: { force: boolean }) => {
        const slot = storageAvailable
            ? loadSlot(window.localStorage, name)
            : null;
        if (!slot) {
            editor.showVimFeedback(`E486: No saved map named "${name}"`);
            return;
        }
        if (!opts.force && isDirty(baselineCode, editor.getMapData())) {
            const ok = await askConfirm(
                "Load saved map?",
                `"${name}" will replace the current map. Unsaved changes will be lost — export first to keep them.`,
                "Load",
            );
            if (!ok) return;
        }
        try {
            editor.importMap(slot.code);
        } catch (e) {
            editor.showVimFeedback(
                `Failed to load "${name}": ${e instanceof Error ? e.message : String(e)}`,
            );
            return;
        }
        currentSlotName = name;
        currentSavedAt = slot.savedAt;
        baselineCode = snapshotMap(editor.getMapData());
        syncSlotIndicator();
        editor.showVimFeedback(`"${name}" loaded`);
        slotsModal.hide();
    };

    const doDeleteSlot = async (name: string) => {
        const ok = await askConfirm(
            "Delete saved map?",
            `"${name}" will be permanently deleted. Export it to a file first if you want to keep it.`,
            "Delete",
        );
        if (!ok) return;
        if (storageAvailable) deleteSlot(window.localStorage, name);
        refreshSlotsWindow();
    };

    menuLoad?.addEventListener("click", openSlotsWindow);
    editor.onOpenSlotsRequest = () => openSlotsWindow();
    editor.onLoadSlotRequest = (name: string) => {
        void doLoadSlot(name, { force: true });
    };
    if (!storageAvailable && menuLoad) {
        menuLoad.setAttribute("disabled", "");
        menuLoad.setAttribute(
            "title",
            "Browser storage is unavailable here — export to a file instead.",
        );
    }

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
        zoomIn: () => editor.zoomBy(1.1),
        zoomOut: () => editor.zoomBy(0.9),
        selectTileLayer: () => setLayer("tile"),
        selectObjectLayer: () => setLayer("object"),
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
            commands: COMMANDS,
            getSurface: () => appSurface.get(),
            isVisualActive: () => editor.isVisualActive(),
            createElement: (tag) => document.createElement(tag),
        });
        appSurface.subscribe(() => helpRenderer.render());
        helpRenderer.render();
    }
});
