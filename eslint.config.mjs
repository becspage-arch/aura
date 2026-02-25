// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
    {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
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

        // Mobile native / Cordova build output
    "android/**",
    "ios/**",

    // Non-Next runtimes (separate tooling)
    "worker/**",
    "orchestrator/**",

    // Prisma scripts / seeds / tooling scripts
    "prisma/**",
    "scripts/**",
    "tools/**",

    // One-off local scripts in repo root
    "checkCandles*.js",
    "checkCandles*.cjs",
  ]),
]);

export default eslintConfig;
