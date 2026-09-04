import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser, process: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Fetching data inside useEffect is the intended pattern for this app;
      // the new set-state-in-effect rule is too strict for data loading effects.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['vite.config.js', 'playwright.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
