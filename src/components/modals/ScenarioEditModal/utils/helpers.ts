/**
 * ScenarioEditModal で使用するヘルパー関数
 */

/**
 * 全角数字を半角数字に変換
 */
export const convertFullWidthToHalfWidth = (str: string) => {
  return str.replace(/[０-９]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
  })
}

/**
 * 数値フィールドを半角に変換して更新
 */
export const handleNumericInput = (
  value: string,
  field: string,
  setFormData: (updater: (prev: any) => any) => void
) => {
  const converted = convertFullWidthToHalfWidth(value)
  setFormData(prev => ({
    ...prev,
    [field]: converted === '' ? 0 : parseInt(converted) || 0
  }))
}

