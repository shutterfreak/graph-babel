// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**/*.ts",
      "dist/**",
      "**/*.mjs",
      "eslint.config.mjs",
      "**/*.js",
    ],
  },
  {
    files: ["src/**/*.ts"],
    plugins: {},
    extends: [
      eslint.configs.recommended,
      /*
      ...tseslint.configs.recommended,
      */
      ...tseslint.configs.recommendedTypeChecked,
      // ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      prettierConfig,
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "lines-between-class-members": [
        "error",
        {
          enforce: [
            { blankLine: "never", prev: "field", next: "field" },
            { blankLine: "always", prev: "field", next: "method" },
            { blankLine: "always", prev: "method", next: "method" },
          ],
        },
      ],
      "no-unsafe-optional-chaining": "warn",
      "no-useless-escape": "off",
      "no-var": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/array-type": [
        "warn",
        { default: "array", readonly: "array" },
      ],
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-unnecessary-type-arguments": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/strict-boolean-expressions": [
        2,
        {
          allowString: false,
          allowNumber: false,
        },
      ],
      "@typescript-eslint/unbound-method": "warn",
    },
  },
);
