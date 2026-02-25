// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Added (Aura): deps + generated + build outputs
    "node_modules/**",
    "dist/**",
    "worker/dist/**",
    "src/generated/**",

    // Temp / scripts (optional, but stops noise)
    "**/*.cjs",
    "tmp_*.cjs",
    "tmp_*.js",
    "tmp/**",
  ]),
]);

export default eslintConfig;
