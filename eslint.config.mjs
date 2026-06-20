import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".tmp_llm_wiki/**",
      "outputs/**",
      "public/legacy/**",
      "legacy-api/**"
    ]
  }
];

export default eslintConfig;
