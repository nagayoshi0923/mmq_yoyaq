/**
 * catch で受けた値（unknown）から、メッセージやコードを安全に取り出す。
 * `catch (err)` の代わりに使う（#775）。Error でなくても、message / code を持つオブジェクトや文字列から取れる。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** エラーのメッセージ。取れなければ空文字 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return ''
}

/** エラーのコード（Supabase / Postgres のエラーコードなど）。取れなければ undefined */
export function getErrorCode(error: unknown): string | undefined {
  if (isRecord(error) && typeof error.code === 'string') return error.code
  return undefined
}

/** エラーの任意の項目（status、details など）。取れなければ undefined */
export function getErrorField(error: unknown, key: string): unknown {
  return isRecord(error) ? error[key] : undefined
}
