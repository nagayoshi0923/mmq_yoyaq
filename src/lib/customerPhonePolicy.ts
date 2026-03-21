/**
 * 顧客の電話番号ポリシー（マイページ設定・予約フローで共有）
 */
export function hasNonEmptyCustomerPhone(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && phone.trim().length > 0
}

export const MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING =
  '電話番号が登録されていません。マイページの設定で電話番号を登録してからお試しください。'

export const MSG_CANNOT_CLEAR_REGISTERED_PHONE =
  '登録済みの電話番号を削除することはできません。番号を変更する場合は新しい番号を入力してください。'
