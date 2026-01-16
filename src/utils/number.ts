/**
 * 数値パースヘルパー（0を許容）
 * 
 * parseInt(value) || defaultValue パターンの問題を解決:
 * - parseInt('0') || 1 は 0 がfalsyなので 1 になってしまう
 * - この関数では parseInt('0') は正しく 0 を返す
 * 
 * @param value パースする文字列
 * @param defaultValue 空文字列または無効な入力の場合のデフォルト値
 * @returns パースした数値、または無効な場合はデフォルト値
 */
export const parseIntSafe = (value: string, defaultValue: number = 0): number => {
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? defaultValue : parsed
}

/**
 * 数値パースヘルパー（空欄は undefined を返す）
 * 
 * parseInt(value) || undefined パターンの問題を解決:
 * - parseInt('0') || undefined は 0 がfalsyなので undefined になってしまう
 * - この関数では parseInt('0') は正しく 0 を返し、空欄の場合のみ undefined を返す
 * 
 * @param value パースする文字列
 * @returns パースした数値、または空欄/無効な場合は undefined
 */
export const parseIntOrUndefined = (value: string): number | undefined => {
  if (value === '' || value === null || value === undefined) {
    return undefined
  }
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

