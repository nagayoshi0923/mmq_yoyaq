/**
 * セキュリティ関連のユーティリティ関数
 */

/**
 * メールアドレスをマスキングしてログに出力する
 * 例: "user@example.com" -> "u***r@example.com"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '***'
  
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`
  }
  
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}@${domain}`
}

/**
 * 電話番号をマスキングしてログに出力する
 * 例: "090-1234-5678" -> "090-****-5678"
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '***'
  
  // 数字のみ抽出
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) return '***'
  
  // 下4桁以外をマスキング
  const last4 = digits.slice(-4)
  return `***-****-${last4}`
}

/**
 * ユーザーIDをマスキング（UUIDの一部のみ表示）
 * 例: "123e4567-e89b-12d3-a456-426614174000" -> "123e4567-****-****-****-426614174000"
 */
export function maskUserId(userId: string | null | undefined): string {
  if (!userId) return '***'
  
  // UUID形式の場合、中間部分をマスキング
  if (userId.length === 36 && userId.includes('-')) {
    const parts = userId.split('-')
    if (parts.length === 5) {
      return `${parts[0]}-****-****-****-${parts[4]}`
    }
  }
  
  // UUID形式でない場合、最初と最後の数文字のみ表示
  if (userId.length > 8) {
    return `${userId.slice(0, 4)}***${userId.slice(-4)}`
  }
  
  return '***'
}

