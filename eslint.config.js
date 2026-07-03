import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist', 'supabase/functions/**', 'eslint.config.js'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
    ],
    plugins: {
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    linterOptions: {
      // 旧 CLI フラグ --report-unused-disable-directives は error 扱いだったので severity を明示
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      // typescript-eslint v8 recommended で新規追加されたルール。
      // 旧 v7 recommended（＝ベースライン 0 error）には存在せずパリティ維持のため off。
      '@typescript-eslint/no-unused-expressions': 'off', // v7 では未検知（三項演算子の文利用など）
      '@typescript-eslint/no-empty-object-type': 'off', // 旧 no-empty-interface 相当・v7 では未検知
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'no-irregular-whitespace': 'off',
      'no-misleading-character-class': 'off', // 既存コード対応
      'no-case-declarations': 'off', // 既存コード対応
      'no-useless-catch': 'off', // 既存コード対応
      'no-alert': 'error',
      'no-restricted-globals': [
        'error',
        'confirm',
        'prompt',
        'alert',
      ],

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
  },
)
