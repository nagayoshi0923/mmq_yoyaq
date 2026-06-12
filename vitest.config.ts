import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// ユニットテストは src/ 配下の *.test.ts(x) のみを対象にする。
// e2e/ (Playwright) と tests/ (旧マルチテナント検証スクリプト)、
// .claude/worktrees/ (エージェント作業コピー) は vitest の対象外。
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: ['e2e/**', 'tests/**', 'node_modules/**', '.claude/**'],
    },
  })
)
