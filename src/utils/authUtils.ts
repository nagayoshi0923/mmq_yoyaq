export type UserRole = 'admin' | 'staff' | 'customer'

/**
 * メールアドレスからユーザーのロールを判定する（フォールバック用）
 * 
 * 注意: この関数は最終フォールバックとしてのみ使用されます。
 * 通常は以下の順序でロールが決定されます：
 * 1. usersテーブルの既存ロール
 * 2. staffテーブルへのuser_id紐付け
 * 3. staffテーブルへのemail一致
 * 4. この関数（フォールバック）
 * 
 * セキュリティ上、フォールバックでは管理者のみを特定し、
 * それ以外は安全なcustomerとして扱います。
 * 
 * @param email ユーザーのメールアドレス
 * @returns 判定されたロール ('admin' | 'customer') - staffは返さない
 */
export function determineUserRole(email: string | undefined | null): UserRole {
  if (!email) return 'customer'

  const normalizedEmail = email.toLowerCase()
  
  // 管理者メールアドレスのリスト（明示的に指定）
  const adminEmails = [
    'mai.nagayoshi@gmail.com',
    'queens.waltz@gmail.com'
  ]

  // 管理者のみ特定（明示的なリストに含まれている場合のみ）
  if (adminEmails.includes(normalizedEmail)) {
    return 'admin'
  }

  // それ以外は安全にcustomerとして扱う
  // staffの判定はAuthContextでstaffテーブルを確認するため、ここでは行わない
  return 'customer'
}

