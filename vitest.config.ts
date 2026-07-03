import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// vite.config は ({ mode }) => config のコールバック形式（本番ビルドで console を drop するため）。
// mergeConfig はコールバックを受け付けないため、テスト用の ConfigEnv で評価してから渡す。
const resolvedViteConfig = viteConfig({ command: 'serve', mode: 'test' })

// ユニットテストは src/ 配下の *.test.ts(x) のみを対象にする。
// e2e/ (Playwright) と tests/ (旧マルチテナント検証スクリプト)、
// .claude/worktrees/ (エージェント作業コピー) は vitest の対象外。
export default mergeConfig(
  resolvedViteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: ['e2e/**', 'tests/**', 'node_modules/**', '.claude/**'],
    },
  })
)
