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
    window.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.toLowerCase() !== "g") return;
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
            return;
        e.preventDefault();
        editor.toggleGrid();
        syncGridButton();
    });
});
