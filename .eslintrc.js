module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    '@typescript-eslint/recommended-requiring-type-checking',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // Critical Type Safety Rules
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',
    
    // Strict Type Checking
    '@typescript-eslint/strict-boolean-expressions': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    
    // Code Quality
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    '@typescript-eslint/prefer-as-const': 'error',
    '@typescript-eslint/no-inferrable-types': 'error',
    
    // Security & Best Practices
    '@typescript-eslint/no-empty-interface': 'error',
    '@typescript-eslint/no-duplicate-enum-values': 'error',
    '@typescript-eslint/no-mixed-enums': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    
    // Disable conflicting ESLint rules
    'no-unused-vars': 'off',
    'no-undef': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'build/',
    'dist/',
    '*.js',
    '!.eslintrc.js',
  ],
  overrides: [
    {
      files: ['*.test.ts', '*.test.tsx'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      },
    },
  ],
};