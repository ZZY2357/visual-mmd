// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  // Build output, dependencies, generated and non-source trees.
  {
    ignores: [
      "dist/**",
      "dev-dist/**",
      "node_modules/**",
      "coverage/**",
      "e2e/**",
      "test-results/**",
      "playwright-report/**",
      "gui-test-screenshots/**",
      "scripts/**",
      ".gp1-accept/**",
      ".playwright-cli/**",
      ".qoder/**",
      ".workbuddy/**",
      ".codegraph/**",
      // playwright.config.ts is intentionally outside both tsconfig
      // projects (see tsconfig.node.json include) so type-aware linting
      // cannot resolve it; it is covered by the smoke job instead.
      "playwright.config.ts",
      "*.config.js",
      "*.config.mjs",
    ],
  },

  js.configs.recommended,

  // Type-aware linting across the whole TS/TSX source tree.
  // projectService maps each file to the nearest tsconfig
  // (tsconfig.app.json for src/, tsconfig.node.json for vite.config.ts).
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Test-file relaxations: these three rules fire on structural test idioms
  // (async `act()` wrappers, extracting DOM prototype accessors, throwing a
  // parser error payload) and carry no correctness value in tests. They stay
  // enabled everywhere under src/ (parsers, editing, projection, store).
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/only-throw-error": "off",
    },
  },
);
