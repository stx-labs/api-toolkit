module.exports = {
  root: true,
  extends: ['@stacks/eslint-config', 'prettier'],
  overrides: [
    {
      files: ['**/*.test.ts', '**/tests/**/*.ts'],
      rules: {
        // node:test `describe` / `it` return promises that the runner consumes; awaiting them is optional/noisy.
        '@typescript-eslint/no-floating-promises': 'off',
        // Spies and SQL tagged templates often surface as `any` in tests.
        '@typescript-eslint/no-unsafe-return': 'off',
      },
    },
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./packages/api-toolkit/tsconfig.json', './packages/api-test-toolkit/tsconfig.json'],
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  ignorePatterns: ['*.config.js', '**/bin/*.js', '**/dist/**', '**/coverage/**'],
  plugins: ['@typescript-eslint', 'eslint-plugin-tsdoc', 'prettier'],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/camelcase': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-use-before-define': ['error', 'nofunc'],
    '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
    'no-warning-comments': 'warn',
    'tsdoc/syntax': 'error',
    // TODO: Remove this when `any` abi type is fixed.
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
  },
};
