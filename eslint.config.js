// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // Onboarding copy is spec-verbatim (straight apostrophes included).
      "react/no-unescaped-entities": "off",
    },
  },
]);
