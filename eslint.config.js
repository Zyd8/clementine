// @ts-check
const expoConfig = require('eslint-config-expo/flat');
const boundaries = require('eslint-plugin-boundaries');

/**
 * Strict dependency direction, enforced mechanically from day one:
 *
 *   app/ → hooks/ → stores/ + api/ → types/
 *
 * `types/` imports nothing, stores never import components, and UI never
 * reaches for `api/` directly. Retrofitting this rule after screens exist is
 * how modular code dies, so it lands before the second screen does.
 */
module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'coverage/**', 'android/**', 'ios/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      // boundaries resolves specifiers through the import resolver, so the
      // `@/*` alias has to be declared here or every aliased import is
      // silently unresolved — i.e. the rule passes without ever firing.
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/include': ['app/**/*', 'src/**/*'],
      // `mode: 'file'` is deprecated in favour of `partialMatch: false`, but in
      // eslint-plugin-boundaries 7.1.0 the replacement stops the rule matching
      // anything at all — it passes silently instead of erroring. Keep the
      // deprecated-but-working option; a warning beats a rule that never fires.
      // Re-check on the next major.
      'boundaries/elements': [
        { type: 'app', pattern: 'app/**/*', mode: 'file' },
        { type: 'components', pattern: 'src/components/**/*', mode: 'file' },
        { type: 'hooks', pattern: 'src/hooks/**/*', mode: 'file' },
        { type: 'stores', pattern: 'src/stores/**/*', mode: 'file' },
        { type: 'api', pattern: 'src/api/**/*', mode: 'file' },
        { type: 'voice', pattern: 'src/voice/**/*', mode: 'file' },
        { type: 'utils', pattern: 'src/utils/**/*', mode: 'file' },
        { type: 'constants', pattern: 'src/constants/**/*', mode: 'file' },
        { type: 'types', pattern: 'src/types/**/*', mode: 'file' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            { from: [{ element: { type: 'app' } }], allow: [{ element: { type: 'components' } }, { element: { type: 'hooks' } }, { element: { type: 'stores' } }, { element: { type: 'utils' } }, { element: { type: 'constants' } }, { element: { type: 'types' } }] },
            { from: [{ element: { type: 'components' } }], allow: [{ element: { type: 'components' } }, { element: { type: 'hooks' } }, { element: { type: 'utils' } }, { element: { type: 'constants' } }, { element: { type: 'types' } }] },
            { from: [{ element: { type: 'hooks' } }], allow: [{ element: { type: 'hooks' } }, { element: { type: 'stores' } }, { element: { type: 'api' } }, { element: { type: 'voice' } }, { element: { type: 'utils' } }, { element: { type: 'constants' } }, { element: { type: 'types' } }] },
            { from: [{ element: { type: 'stores' } }], allow: [{ element: { type: 'api' } }, { element: { type: 'utils' } }, { element: { type: 'constants' } }, { element: { type: 'types' } }] },
            { from: [{ element: { type: 'api' } }], allow: [{ element: { type: 'api' } }, { element: { type: 'utils' } }, { element: { type: 'constants' } }, { element: { type: 'types' } }] },
            { from: [{ element: { type: 'voice' } }], allow: [{ element: { type: 'voice' } }, { element: { type: 'utils' } }, { element: { type: 'constants' } }, { element: { type: 'types' } }] },
            { from: [{ element: { type: 'utils' } }], allow: [{ element: { type: 'utils' } }, { element: { type: 'constants' } }, { element: { type: 'types' } }] },
            { from: [{ element: { type: 'constants' } }], allow: [{ element: { type: 'constants' } }, { element: { type: 'types' } }] },
            { from: [{ element: { type: 'types' } }], allow: [{ element: { type: 'types' } }] },
          ],
        },
      ],
    },
  },
  {
    // Tests may reach across boundaries to build fixtures and assert contracts.
    files: ['**/*.test.{ts,tsx}', 'jest.setup.ts'],
    rules: {
      'boundaries/dependencies': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
