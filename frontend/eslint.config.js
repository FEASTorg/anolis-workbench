import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import sveltePlugin from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";
import globals from "globals";

export default [
  // ── Ignore generated / vendored output ──────────────────────────────────
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "playwright-report/**", "test-results/**"],
  },

  // ── TypeScript source files ──────────────────────────────────────────────
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      // Warn on explicit any — escalate to error in Phase 4 once types are hardened
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // ── Svelte component files ───────────────────────────────────────────────
  // Spread eslint-plugin-svelte flat/recommended (plugin registration + svelte rules)
  ...sveltePlugin.configs["flat/recommended"],
  {
    files: ["src/**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Warn on explicit any in svelte script blocks — escalate in Phase 4
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
