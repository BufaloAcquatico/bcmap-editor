import { describe, it, expect, vi } from "vitest";
import { runCommand, COMMANDS } from "../../../src/vim/commands";

const makeActions = () => ({
    writeMap: vi.fn(),
    openImport: vi.fn(),
    toggleHelp: vi.fn(),
    toggleGrid: vi.fn(),
    drawLine: vi.fn(),
});

describe("parse + run commands", () => {
    it("runs :grid on the editor", () => {
        const actions = makeActions();
        expect(runCommand("grid", actions).ok).toBe(true);
        expect(actions.toggleGrid).toHaveBeenCalledTimes(1);
    });

    it("runs :help", () => {
        const actions = makeActions();
        expect(runCommand("help", actions).ok).toBe(true);
        expect(actions.toggleHelp).toHaveBeenCalledTimes(1);
    });

    it("runs :e as import", () => {
        const actions = makeActions();
        expect(runCommand("e", actions).ok).toBe(true);
        expect(actions.openImport).toHaveBeenCalledTimes(1);
    });

    it("runs :w and :write with an optional name", () => {
        const actions = makeActions();
        runCommand("w", actions);
        expect(actions.writeMap).toHaveBeenCalledWith(undefined);
        runCommand("write my-map", actions);
        expect(actions.writeMap).toHaveBeenCalledWith("my-map");
    });

    it("runs :line with two coordinate pairs", () => {
        const actions = makeActions();
        const result = runCommand("line 3,4 10,4", actions);
        expect(result.ok).toBe(true);
        expect(actions.drawLine).toHaveBeenCalledWith(3, 4, 10, 4);
    });

    it("tolerates a leading colon and extra whitespace", () => {
        const actions = makeActions();
        expect(runCommand(":  grid  ", actions).ok).toBe(true);
        expect(actions.toggleGrid).toHaveBeenCalledTimes(1);
    });

    it("reports an E492 error for unknown commands", () => {
        const actions = makeActions();
        const result = runCommand("nope", actions);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("E492: Not an editor command: nope");
        expect(actions.toggleGrid).not.toHaveBeenCalled();
    });

    it("reports bad coordinates for :line", () => {
        const actions = makeActions();
        const result = runCommand("line 3,4", actions);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/usage|coordinates/i);
        expect(actions.drawLine).not.toHaveBeenCalled();
    });

    it("ignores an empty command", () => {
        const actions = makeActions();
        const result = runCommand("   ", actions);
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
        expect(names).toContain("help");
        expect(names).toContain("grid");
        expect(names).toContain("line");
    });
});
