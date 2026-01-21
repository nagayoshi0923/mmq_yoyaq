import { useState } from 'react'

interface UseBookingFormProps {
  initialParticipantCount: number
  availableSeats: number
}

/**
 * 予約フォーム状態管理フック
 */
export function useBookingForm({ initialParticipantCount, availableSeats }: UseBookingFormProps) {
  const [participantCount, setParticipantCount] = useState(initialParticipantCount)
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
    // 電話番号の桁数チェック（ハイフン除去後10-11桁）
    const phoneDigits = customerPhone.replace(/[-\s]/g, '')
    if (!/^\d{10,11}$/.test(phoneDigits)) {
      setError('電話番号は10〜11桁で入力してください')
      return false
    }
    if (participantCount > availableSeats) {
      setError(`予約可能な人数は${availableSeats}名までです`)
      return false
    }
    return true
  }

  /**
   * 参加人数の増減
   */
  const incrementCount = () => {
    if (participantCount < availableSeats) {
      setParticipantCount(prev => prev + 1)
    }
  }

  const decrementCount = () => {
    if (participantCount > 1) {
      setParticipantCount(prev => prev - 1)
    }
  }

  return {
    participantCount,
    setParticipantCount,
    notes,
    setNotes,
    error,
    setError,
    validateForm,
    incrementCount,
    decrementCount
  }
}

