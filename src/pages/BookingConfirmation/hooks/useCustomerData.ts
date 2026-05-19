import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
        const { data: userIdData, error } = await supabase
          .from('customers')
          .select('name, nickname, email, phone')
          .eq('user_id', userId)
          .maybeSingle()
        if (!error && userIdData) data = userIdData
      }
      // user_idで見つからなければemailで検索
      if (!data && userEmail) {
        const { data: emailData, error } = await supabase
          .from('customers')
          .select('name, nickname, email, phone')
          .eq('email', userEmail)
          .maybeSingle()
        if (!error && emailData) data = emailData
      }
      return data
    },
  })

  // 取得データでフォームを初期化（ユーザーが既に入力済みの場合は上書きしない）
  useEffect(() => {
    if (!fetchedData) {
      if (!customerEmail && userEmail) setCustomerEmail(userEmail)
      return
    }
    setCustomerName(fetchedData.name || '')
    setCustomerNickname(fetchedData.nickname || '')
    setCustomerEmail(fetchedData.email || userEmail || '')
    setCustomerPhone(fetchedData.phone || '')
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
