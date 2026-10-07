/** 予約・プロフィールの連絡先を送信前に検証する。 */
export function validateCustomerContact(email: string | null | undefined, phone?: string | null): void {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) {
    throw new Error('有効なメールアドレスを入力してください')
  }
  if (phone !== undefined && (!phone || !/^\d{10,11}$/.test(phone.replace(/[-\s]/g, '')))) {
    throw new Error('電話番号は10〜11桁で入力してください')
  }
}
