import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/unit/**/*.test.ts"],
        globals: true,
    },
    resolve: {
        alias: {
            "lz-string": path.resolve(
                __dirname,
                "node_modules/.pnpm/lz-string@1.5.0/node_modules/lz-string/libs/lz-string.js",
            ),
        },
    },
});
