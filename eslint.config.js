// @ts-check
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';

// Stylistic rules for consistent code formatting
const stylisticRules = {
  '@stylistic/array-bracket-newline': ['error', { multiline: true }],
  '@stylistic/array-element-newline': ['error', 'consistent'],
  '@stylistic/comma-dangle': ['error', 'always-multiline'],
  '@stylistic/curly-newline': ['error', 'always'],
  '@stylistic/indent': ['error', 2],
  '@stylistic/indent-binary-ops': ['error', 2],
  '@stylistic/jsx-closing-bracket-location': ['error', 'line-aligned'],
  '@stylistic/jsx-closing-tag-location': 'error',
  '@stylistic/jsx-first-prop-new-line': ['error', 'multiline'],
  '@stylistic/jsx-indent-props': ['error', 2],
  '@stylistic/jsx-max-props-per-line': ['error', { maximum: 1 }],
  '@stylistic/jsx-newline': ['error', { prevent: true, allowMultilines: true }],
  '@stylistic/jsx-pascal-case': 'error',
  '@stylistic/jsx-self-closing-comp': 'error',
  '@stylistic/jsx-tag-spacing': ['error', { beforeSelfClosing: 'always' }],
  '@stylistic/jsx-wrap-multilines': 'error',
  '@stylistic/lines-around-comment': [
    'error', {
      beforeBlockComment: false,
      beforeLineComment: false,
      afterBlockComment: false,
      afterLineComment: false,
      allowBlockStart: true,
      allowBlockEnd: true,
      allowObjectStart: true,
      allowObjectEnd: true,
      allowArrayStart: true,
      allowArrayEnd: true,
      allowClassStart: true,
      allowClassEnd: true,
    },
  ],
  '@stylistic/lines-between-class-members': ['error', 'always'],
  '@stylistic/member-delimiter-style': 'error',
  '@stylistic/multiline-ternary': ['error', 'always-multiline'],
  '@stylistic/new-parens': 'error',
  '@stylistic/no-extra-semi': 'warn',
  '@stylistic/no-floating-decimal': 'error',
  '@stylistic/no-multi-spaces': 'error',
  '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
  '@stylistic/no-tabs': 'error',
  '@stylistic/no-trailing-spaces': 'error',
  '@stylistic/no-whitespace-before-property': 'error',
  '@stylistic/operator-linebreak': ['error', 'after'],
  '@stylistic/padded-blocks': ['error', 'never'],
  '@stylistic/quote-props': ['error', 'as-needed'],
  '@stylistic/quotes': ['error', 'single'],
  '@stylistic/semi': ['error', 'always'],
  '@stylistic/type-generic-spacing': ['error'],
  '@stylistic/type-named-tuple-spacing': ['error'],
  '@stylistic/wrap-regex': 'error',
  '@stylistic/padding-line-between-statements': [
    'error',
    // Blank line after variable declarations (but not between them)
    { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
    // Blank line before control flow statements
    { blankLine: 'always', prev: '*', next: ['if', 'for', 'while', 'switch', 'try', 'do'] },
    // Blank line after control flow statements
    { blankLine: 'always', prev: ['if', 'for', 'while', 'switch', 'try', 'do'], next: '*' },
    // Blank line before return
    { blankLine: 'always', prev: '*', next: 'return' },
  ],
};

// TypeScript strict rules
const typescriptStrictRules = {
  '@typescript-eslint/no-unused-vars': [
    'error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
  '@typescript-eslint/explicit-function-return-type': [
    'error', {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
    },
  ],
  '@typescript-eslint/explicit-member-accessibility': [
    'error', {
      accessibility: 'explicit',
      overrides: {
        constructors: 'no-public',
      },
    },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'warn',
  '@typescript-eslint/prefer-nullish-coalescing': 'error',
  '@typescript-eslint/prefer-optional-chain': 'error',
  '@typescript-eslint/strict-boolean-expressions': [
    'error', {
      allowNullableBoolean: true,
      allowNullableString: true,
    },
  ],
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/consistent-type-imports': [
    'error', {
      prefer: 'type-imports',
      fixStyle: 'inline-type-imports',
    },
  ],
  '@typescript-eslint/consistent-type-exports': [
    'error', {
      fixMixedExportsWithInlineTypeSpecifier: true,
    },
  ],
  '@typescript-eslint/naming-convention': [
    'error',
    // Default: camelCase for everything
    {
      selector: 'default',
      format: ['camelCase'],
      leadingUnderscore: 'allow',
    },
    // Variables: camelCase, UPPER_CASE, or PascalCase (for models, classes)
    {
      selector: 'variable',
      format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
      leadingUnderscore: 'allow',
    },
    // Functions: camelCase or PascalCase (for components/classes)
    {
      selector: 'function',
      format: ['camelCase', 'PascalCase'],
    },
    // Types, interfaces, classes, enums: PascalCase
    {
      selector: 'typeLike',
      format: ['PascalCase'],
    },
    // Enum members: PascalCase or UPPER_CASE
    {
      selector: 'enumMember',
      format: ['PascalCase', 'UPPER_CASE'],
    },
    // Object properties: allow any (for external APIs, Discord.js)
    {
      selector: 'objectLiteralProperty',
      format: null,
    },
    // Import: allow any format
    {
      selector: 'import',
      format: null,
    },
  ],
};

// General best practices
const bestPracticesRules = {
  'no-console': 'warn',
  'no-debugger': 'error',
  'no-alert': 'error',
  eqeqeq: ['error', 'always'],
  curly: ['error', 'all'],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  'prefer-arrow-callback': 'error',
  'arrow-body-style': ['error', 'as-needed'],
  'object-shorthand': ['error', 'always'],
  'no-duplicate-imports': 'error',
  'no-useless-rename': 'error',
  'no-restricted-globals': ['error', 'event', 'fdescribe'],
};

export default tseslint.config(
  // Base JS recommended
  js.configs.recommended,

  // TypeScript strict configuration
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  // Main configuration for TypeScript files
  {
    files: ['**/*.{ts,mts,cts}'],
    plugins: {
      '@stylistic': stylistic,
    },
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...stylisticRules,
      ...typescriptStrictRules,
      ...bestPracticesRules,
    },
  },

  // JavaScript files (config files, scripts)
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: {
      '@stylistic': stylistic,
    },
    languageOptions: {
      globals: globals.node,
    },
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      ...stylisticRules,
      ...bestPracticesRules,
    },
  },

  // Relaxed rules for test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  // Global ignores
  globalIgnores([
    'node_modules/*',
    '.pnpm/*',
    'dist/*',
    '*.d.ts',
  ]),
);
