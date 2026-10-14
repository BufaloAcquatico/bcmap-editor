import { describe, it, expect, vi } from "vitest";
import {
    runCommand,
    COMMANDS,
    type SlotState,
} from "../../../src/vim/commands";

const makeActions = () => ({
    saveSlot: vi.fn(),
    openSlots: vi.fn(),
    loadSlot: vi.fn(),
    newMap: vi.fn(),
    exportMap: vi.fn(),
    openImport: vi.fn(),
    toggleHelp: vi.fn(),
    toggleGrid: vi.fn(),
    drawLine: vi.fn(),
});

const makeState = (overrides: Partial<SlotState> = {}): SlotState => ({
    available: true,
    currentName: null,
    hasSlot: () => false,
    isDirty: false,
    isFull: false,
    ...overrides,
});

describe("parse + run commands", () => {
    it("runs :grid on the editor", () => {
        const actions = makeActions();
        expect(runCommand("grid", actions, makeState()).ok).toBe(true);
        expect(actions.toggleGrid).toHaveBeenCalledTimes(1);
    });

    it("runs :help", () => {
        const actions = makeActions();
        expect(runCommand("help", actions, makeState()).ok).toBe(true);
        expect(actions.toggleHelp).toHaveBeenCalledTimes(1);
    });

    it("runs :e with no name as the saved-maps window", () => {
        const actions = makeActions();
        expect(runCommand("e", actions, makeState()).ok).toBe(true);
        expect(actions.openSlots).toHaveBeenCalledTimes(1);
    });

    it("runs :w with a name as a slot save", () => {
        const actions = makeActions();
        runCommand("w garage", actions, makeState());
        expect(actions.saveSlot).toHaveBeenCalledWith("garage");
        runCommand("write garage", actions, makeState());
        expect(actions.saveSlot).toHaveBeenCalledWith("garage");
    });

    it("runs bare :w against the current slot name", () => {
        const actions = makeActions();
        runCommand("w", actions, makeState({ currentName: "garage" }));
        expect(actions.saveSlot).toHaveBeenCalledWith("garage");
    });

    it("reports E32 for bare :w with no current name", () => {
        const actions = makeActions();
        const result = runCommand("w", actions, makeState());
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/^E32/);
        expect(actions.saveSlot).not.toHaveBeenCalled();
    });

    it("reports E13 when :w targets another existing slot", () => {
        const actions = makeActions();
        const state = makeState({ hasSlot: (name) => name === "taken" });
        const result = runCommand("w taken", actions, state);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/^E13.*!.*override/);
        expect(actions.saveSlot).not.toHaveBeenCalled();
    });

    it("lets :w! overwrite an existing slot", () => {
        const actions = makeActions();
        const state = makeState({ hasSlot: () => true });
        expect(runCommand("w! taken", actions, state).ok).toBe(true);
        expect(actions.saveSlot).toHaveBeenCalledWith("taken");
    });

    it("lets bare :w rewrite the current slot without a bang", () => {
        const actions = makeActions();
        const state = makeState({
            currentName: "garage",
            hasSlot: (name) => name === "garage",
        });
        expect(runCommand("w", actions, state).ok).toBe(true);
        expect(actions.saveSlot).toHaveBeenCalledWith("garage");
    });

    it("rejects names outside letters, numbers, dash and space", () => {
        const actions = makeActions();
        const result = runCommand("w a/b", actions, makeState());
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/^E486/);
        expect(actions.saveSlot).not.toHaveBeenCalled();
    });

    it("refuses a new name when the slot list is full", () => {
        const actions = makeActions();
        const result = runCommand(
            "w fresh",
            actions,
            makeState({ isFull: true }),
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/full.*30/);
        expect(actions.saveSlot).not.toHaveBeenCalled();
    });

    it("still overwrites when full", () => {
        const actions = makeActions();
        const state = makeState({
            isFull: true,
            hasSlot: (name) => name === "old",
        });
        expect(runCommand("w! old", actions, state).ok).toBe(true);
        expect(actions.saveSlot).toHaveBeenCalledWith("old");
    });

    it("runs :e with a name as a direct slot load", () => {
        const actions = makeActions();
        const state = makeState({ hasSlot: (name) => name === "garage" });
        expect(runCommand("e garage", actions, state).ok).toBe(true);
        expect(actions.loadSlot).toHaveBeenCalledWith("garage");
    });

    it("reports a missing slot for :e with an unknown name", () => {
        const actions = makeActions();
        const result = runCommand("e nope", actions, makeState());
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/nope/);
        expect(actions.loadSlot).not.toHaveBeenCalled();
    });

    it("reports E37 when :e would discard unsaved work", () => {
        const actions = makeActions();
        const state = makeState({
            hasSlot: () => true,
            isDirty: true,
        });
        const result = runCommand("e garage", actions, state);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/^E37.*!.*override/);
        expect(actions.loadSlot).not.toHaveBeenCalled();
    });

    it("lets :e! discard unsaved work", () => {
        const actions = makeActions();
        const state = makeState({
            hasSlot: () => true,
            isDirty: true,
        });
        expect(runCommand("e! garage", actions, state).ok).toBe(true);
        expect(actions.loadSlot).toHaveBeenCalledWith("garage");
    });

    it("runs :enew, guarded by E37 like :e", () => {
        const actions = makeActions();
        expect(runCommand("enew", actions, makeState()).ok).toBe(true);
        expect(actions.newMap).toHaveBeenCalledTimes(1);
        const dirty = runCommand("enew", actions, makeState({ isDirty: true }));
        expect(dirty.ok).toBe(false);
        expect(dirty.error).toMatch(/^E37/);
        expect(
            runCommand("enew!", actions, makeState({ isDirty: true })).ok,
        ).toBe(true);
        expect(actions.newMap).toHaveBeenCalledTimes(2);
    });

    it("runs :export with an optional name", () => {
        const actions = makeActions();
        runCommand("export", actions, makeState());
        expect(actions.exportMap).toHaveBeenCalledWith(undefined);
        runCommand("export garage", actions, makeState());
        expect(actions.exportMap).toHaveBeenCalledWith("garage");
    });

    it("runs :import as the code-import modal", () => {
        const actions = makeActions();
        expect(runCommand("import", actions, makeState()).ok).toBe(true);
        expect(actions.openImport).toHaveBeenCalledTimes(1);
    });

    it("reports unavailable storage instead of saving", () => {
        const actions = makeActions();
        const result = runCommand(
            "w garage",
            actions,
            makeState({ available: false }),
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/unavailable/i);
        expect(actions.saveSlot).not.toHaveBeenCalled();
    });

    it("runs :line with two coordinate pairs", () => {
        const actions = makeActions();
        const result = runCommand("line 3,4 10,4", actions, makeState());
        expect(result.ok).toBe(true);
        expect(actions.drawLine).toHaveBeenCalledWith(3, 4, 10, 4);
    });

    it("tolerates a leading colon and extra whitespace", () => {
        const actions = makeActions();
        expect(runCommand(":  grid  ", actions, makeState()).ok).toBe(true);
        expect(actions.toggleGrid).toHaveBeenCalledTimes(1);
    });

    it("reports an E492 error for unknown commands", () => {
        const actions = makeActions();
        const result = runCommand("nope", actions, makeState());
        expect(result.ok).toBe(false);
        expect(result.error).toBe("E492: Not an editor command: nope");
        expect(actions.toggleGrid).not.toHaveBeenCalled();
    });

    it("reports bad coordinates for :line", () => {
        const actions = makeActions();
        const result = runCommand("line 3,4", actions, makeState());
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/usage|coordinates/i);
        expect(actions.drawLine).not.toHaveBeenCalled();
    });

    it("ignores an empty command", () => {
        const actions = makeActions();
        const result = runCommand("   ", actions, makeState());
        expect(result.ok).toBe(false);
        expect(result.error).toBeUndefined();
    });
});

describe("command registry (help source)", () => {
    it("exposes every command with name, syntax and description", () => {
        expect(COMMANDS.length).toBeGreaterThanOrEqual(5);
        for (const command of COMMANDS) {
            expect(command.name).toMatch(/^\w+$/);
            expect(command.syntax).toContain(":");
            expect(command.description.length).toBeGreaterThan(0);
        }
    });

    it("keeps the registry and the runner in sync", () => {
        const names = COMMANDS.map((c) => c.name);
        expect(names).toContain("w");
        expect(names).toContain("write");
        expect(names).toContain("e");
        expect(names).toContain("enew");
        expect(names).toContain("export");
        expect(names).toContain("import");
        expect(names).toContain("help");
        expect(names).toContain("grid");
        expect(names).toContain("line");
    });
});
