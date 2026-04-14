// ESLint flat config for the monorepo.
// - typescript-eslint recommended rules across all packages
// - react + react-hooks rules for packages/web only
// - prettier integration: format violations report as ESLint errors

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Files to ignore globally
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      'infra/**',
      'packages/web/dist/**',
      '**/*.config.js',
      '**/*.config.ts',
      '.husky/**',
      'benchmark/**',
      'tests/load/**',
    ],
  },

  // Base rules for all TS/JS files
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    plugins: { prettier },
    rules: {
      'prettier/prettier': 'error',
      // Allow `_` prefix for intentionally unused vars/args
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // We use plenty of casts at the SQS/express boundary; soften for now
      '@typescript-eslint/no-explicit-any': 'warn',
      // Empty catch blocks are deliberate in a few places (e.g. SSE controller's
      // JSON.parse swallow — non-JSON messages are dropped on purpose)
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // React-specific rules for packages/web
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // not needed with the new JSX transform
      'react/prop-types': 'off', // we're TypeScript, types cover this
    },
  },

  // Test files: a few rules don't apply
  {
    files: ['**/tests/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // test mocks legitimately use any
    },
  },
);
