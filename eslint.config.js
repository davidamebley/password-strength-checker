import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // UI tests run against a jsdom document.
    files: ['tests/ui/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // The scoring engine must stay pure: no network, storage, or DOM access.
    files: ['src/scoring/**/*.js'],
    rules: {
      'no-restricted-globals': [
        'error',
        'fetch',
        'XMLHttpRequest',
        'WebSocket',
        'EventSource',
        'navigator',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'document',
        'window',
        'location',
        'history',
      ],
    },
  },
  {
    rules: {
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  prettier,
];
