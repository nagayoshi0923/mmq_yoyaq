import { useState } from 'react'

/**
 * 貸切予約フォーム状態管理フック
 */
export function usePrivateBookingForm() {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  /**
   * フォームバリデーション
   */
  const validateForm = (customerName: string, customerEmail: string, customerPhone: string): boolean => {
    if (!customerName.trim()) {
      setError('お名前を入力してください')
      return false
    }
    if (!customerEmail.trim()) {
      setError('メールアドレスを入力してください')
      return false
    }
    if (!customerPhone.trim()) {
      setError('電話番号を入力してください')
      return false
    }
    return true
  }

  return {
    notes,
    setNotes,
    error,
    setError,
    validateForm
  }
}

