import { defineConfig } from "tsup";
import { readFile, writeFile } from "node:fs/promises";

// esbuild strips leading "use client" directives during bundling, so we
// re-add them after the build instead of using `banner`.
async function prependUseClient() {
  for (const file of ["dist/index.js", "dist/index.cjs"]) {
    const content = await readFile(file, "utf8");
    if (!content.startsWith('"use client"')) {
      await writeFile(file, `"use client";\n${content}`);
    }
  }
}

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ["react", "posthog-js", "posthog-js/react"],
  onSuccess: prependUseClient,
});
