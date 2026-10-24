/**
 * 試作の画面（/prototype/...）を使えるビルドかどうかを決める。
 *
 * - 本番（Vercel の production）では常に無効。ルートも入口も成果物に入らない
 *   （vite.config.ts の define で定数 'false' に置き換わり、試作のコードは取り除かれる）。
 * - Vercel の preview（PR ごとの確認用）・手元の開発（npm run dev）・
 *   VITE_ENABLE_PROTOTYPES=true を明示したビルドだけ有効。
 * - VERCEL_ENV=production のときは VITE_ENABLE_PROTOTYPES=true でも無効（誤設定で本番に出さない）。
 */
export interface PrototypeFlagInput {
  mode: string
  env: Record<string, string | undefined>
}

export function shouldEnablePrototypes({ mode, env }: PrototypeFlagInput): boolean {
  if (env.VERCEL_ENV === 'production') return false
  if (env.VITE_ENABLE_PROTOTYPES === 'true') return true
  if (env.VERCEL_ENV === 'preview') return true
  return mode === 'development'
}

/** vite.config.ts の define に入れる値（本番では文字列 'false' を埋め込み、試作のコードを成果物から取り除く） */
export function prototypesDefine(input: PrototypeFlagInput): Record<string, string> {
  return { 'import.meta.env.VITE_PROTOTYPES_ENABLED': JSON.stringify(shouldEnablePrototypes(input) ? 'true' : 'false') }
}
