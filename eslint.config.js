import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'node_modules',
      'playwright-report',
      'test-results',
      'vendor',
      '.cache',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // The NCP script sandbox (runs vendored upstream code via eval) is private to src/engine; the
    // rest of the app only talks to the engine facade. src/engine/runtime.ts is the one caller
    // (see src/engine/sandbox-guard.test.ts).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/engine/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/engine/sandbox', '**/engine/sandbox/*'],
              message: 'The NCP sandbox is internal to src/engine; use the engine facade.',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
