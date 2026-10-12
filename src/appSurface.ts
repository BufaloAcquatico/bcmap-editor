// BCMap Editor - explicit app-surface tracking.
//
// The editor's context (map / search / picker / command / chrome) lives in
// one store instead of per-keypress DOM inspection, so help, cursor and
// future features can ask "where is the user?" under mixed mouse/keyboard
// use. Vim mode (normal/visual) stays orthogonal in the controller:
// visual selections always live on the map surface.

export type AppSurface = "map" | "search" | "picker" | "command" | "chrome";

/** Minimal focus-target shape: real Elements and unit-test stubs alike. */
export interface FocusTarget {
    id?: string;
    tagName?: string;
    closest?: (selector: string) => unknown;
}

/**
 * Map a focus target to its surface. Id checks come first: the search
 * input lives inside #sidebar and must not read as picker.
 */
export function surfaceForTarget(target: FocusTarget | null): AppSurface {
    if (!target) return "chrome";
    if (target.id === "mapCanvas") return "map";
    if (target.id === "searchInput") return "search";
    if (target.id === "commandPrompt") return "command";
    if (target.closest?.("#sidebar")) return "picker";
    return "chrome";
}

export class AppSurfaceStore {
    private surface: AppSurface = "map";
    private listeners = new Set<(surface: AppSurface) => void>();

    get(): AppSurface {
        return this.surface;
    }

    /** Record a surface; subscribers run only on actual change. */
    set(surface: AppSurface): void {
        if (surface === this.surface) return;
        this.surface = surface;
        this.listeners.forEach((fn) => fn(surface));
    }

    /** Subscribe; returns an unsubscribe function. */
    subscribe(fn: (surface: AppSurface) => void): () => void {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }
}

/**
 * The shared store. Keyboard transitions set it synchronously; a focus
 * listener corrects it for mouse, touch and Tab-order moves.
 */
export const appSurface = new AppSurfaceStore();
