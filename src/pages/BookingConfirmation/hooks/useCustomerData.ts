import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { bookingConfirmationReadApi } from '@/lib/api/bookingConfirmationReadApi'

interface UseCustomerDataProps {
  userId?: string
  userEmail?: string
}

const customerDataKeys = {
  customer: (userId: string | undefined, userEmail: string | undefined) =>
    ['booking-customer-data', userId, userEmail] as const,
}

/**
 * 顧客情報取得・管理フック
 */
export function useCustomerData({ userId, userEmail }: UseCustomerDataProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerNickname, setCustomerNickname] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const { data: fetchedData } = useQuery({
    queryKey: customerDataKeys.customer(userId, userEmail),
    enabled: !!(userId || userEmail),
    queryFn: async () => {
      let data = null
      // まずuser_idで検索
      if (userId) {
        const { data: userIdData, error } = await bookingConfirmationReadApi.findCustomerProfileByUserId(userId)
        if (!error && userIdData) data = userIdData
      }
      // user_idで見つからなければemailで検索
      if (!data && userEmail) {
        const { data: emailData, error } = await bookingConfirmationReadApi.findCustomerProfileByEmail(userEmail)
        if (!error && emailData) data = emailData
      }
      return data
    },
  })

  // 取得データでフォームを初期化するのは最初に読めたときだけ。それまでに利用者が入力した欄は残す。
  // 読み直し（キャッシュの更新など）では入力・変更した欄を上書きしない（2026-10-20 Codex staging 点検「再取得で入力内容が消える」）
  const initializedRef = useRef(false)
  // 別のアカウントに切り替わったら、その人の登録情報で入れ直す
  useEffect(() => { initializedRef.current = false }, [userId])
  useEffect(() => {
    if (!fetchedData) {
      if (!customerEmail && userEmail) setCustomerEmail(userEmail)
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true
    setCustomerName(prev => prev || fetchedData.name || '')
    setCustomerNickname(prev => prev || fetchedData.nickname || '')
    setCustomerEmail(prev => (!prev || prev === userEmail ? fetchedData.email || userEmail || '' : prev))
    setCustomerPhone(prev => prev || fetchedData.phone || '')
  // fetchedData が変わったときだけ同期する（フォーム操作を上書きしないよう依存を絞る）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedData])

  return {
    customerName,
    setCustomerName,
    customerNickname,
    setCustomerNickname,
    customerEmail,
    setCustomerEmail,
    customerPhone,
    setCustomerPhone,
  }
}
