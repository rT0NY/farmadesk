import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  // Config de Node para archivos de configuración
  {
    files: ['vite.config.js', 'electron/**/*.js', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        __APP_VERSION__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Variables sin usar — error real
      'no-unused-vars': ['error', {
        varsIgnorePattern:    '^[A-Z_]',
        argsIgnorePattern:    '^[A-Z_]',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Reglas del React Compiler — el proyecto no lo usa, son ruido
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect':         'warn',
      'react-hooks/refs':                        'warn',
      'react-hooks/purity':                      'warn',
      'react-hooks/immutability':                'warn',
      'react-hooks/invariant':                   'warn',
    },
  },
])
