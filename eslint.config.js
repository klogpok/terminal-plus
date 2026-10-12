// Mechanical rules only; judgement calls live in CODING_STANDARDS.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const CYRILLIC = '/[\\u0400-\\u04FF]/';
const CYRILLIC_MESSAGE =
  'Russian UI text belongs in packages/web/src/app/strings.ts or packages/shared/src/strings.ts.';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/target/**', '**/release/**', '**/.angular/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Terminal output is parsed with ANSI escape regexes on purpose.
      'no-control-regex': 'off',
      // Angular effects read a signal as a bare expression to subscribe to it.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    // core is host-agnostic: no HTTP server, no Electron, no dependency on the packages that host it.
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'fastify', message: 'core must not depend on the HTTP host (server).' },
            { name: 'electron', message: 'core must not depend on the desktop host.' },
            { name: '@devpanel/server', message: 'core must not depend on the packages that host it.' },
            { name: '@devpanel/desktop', message: 'core must not depend on the packages that host it.' },
            { name: '@devpanel/web', message: 'core must not depend on the UI.' },
          ],
          patterns: [{ group: ['@fastify/*'], message: 'core must not depend on the HTTP host (server).' }],
        },
      ],
    },
  },
  {
    // All user-facing Russian text lives in the two strings modules.
    files: ['packages/*/src/**/*.ts'],
    ignores: [
      'packages/web/src/app/strings.ts',
      'packages/shared/src/strings.ts',
      '**/*.spec.ts',
      '**/*.test.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[raw=${CYRILLIC}]`, message: CYRILLIC_MESSAGE },
        { selector: `TemplateElement[value.raw=${CYRILLIC}]`, message: CYRILLIC_MESSAGE },
      ],
    },
  },
);
