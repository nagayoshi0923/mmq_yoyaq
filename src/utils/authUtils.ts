export type UserRole = 'admin' | 'staff' | 'customer'

/**
 * メールアドレスからユーザーのロールを判定する
 * 
 * @param email ユーザーのメールアドレス
 * @returns 判定されたロール ('admin' | 'staff' | 'customer')
 */
export function determineUserRole(email: string | undefined | null): UserRole {
  if (!email) return 'customer'

  const normalizedEmail = email.toLowerCase()
  const adminEmails = ['mai.nagayoshi@gmail.com', 'queens.waltz@gmail.com']

  if (adminEmails.includes(normalizedEmail) || normalizedEmail.includes('admin')) {
    return 'admin'
  } else if (normalizedEmail.includes('staff')) {
    return 'staff'
  }

  return 'customer'
}

