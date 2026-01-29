module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'supabase/functions/**'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'react-hooks/rules-of-hooks': 'warn', // 既存コード対応（将来修正必須）
    'no-irregular-whitespace': 'off',
    'no-misleading-character-class': 'off', // 既存コード対応
    'no-case-declarations': 'off', // 既存コード対応
    'no-useless-catch': 'off', // 既存コード対応

    // --- Security guardrails -------------------------------------------------
    // 予約テーブルの直接UPDATE/DELETEはP0事故の温床になりやすいので禁止（RPC経由に統一）
    // 例外が必要な場合は、PRで理由を明記し、代替（RPC化）を検討すること。
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "CallExpression[callee.property.name='update'][callee.object.callee.property.name='from'][callee.object.arguments.0.value='reservations']",
        message:
          "Direct update to 'reservations' is forbidden. Use RPC/API layer (e.g., reservationApi.*WithLock).",
      },
      {
        selector:
          "CallExpression[callee.property.name='delete'][callee.object.callee.property.name='from'][callee.object.arguments.0.value='reservations']",
        message:
          "Direct delete from 'reservations' is forbidden. Use RPC/API layer.",
      },
    ],
  },
}

