import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface UseCustomerDataProps {
  userId?: string
  userEmail?: string
}

/**
 * 顧客情報取得・管理フック
 */
export function useCustomerData({ userId, userEmail }: UseCustomerDataProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerNickname, setCustomerNickname] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  /**
   * 顧客情報を読み込み
   * user_idで検索し、見つからなければemailでも検索
   */
  const loadCustomerInfo = async () => {
    if (!userId && !userEmail) return
    
    try {
      let data = null
      
      // まずuser_idで検索
      if (userId) {
        const { data: userIdData, error } = await supabase
          .from('customers')
          .select('name, nickname, email, phone')
          .eq('user_id', userId)
          .maybeSingle()
        
        if (!error && userIdData) {
          data = userIdData
        }
      }
      
      // user_idで見つからなければemailで検索
      if (!data && userEmail) {
        const { data: emailData, error } = await supabase
          .from('customers')
          .select('name, nickname, email, phone')
          .eq('email', userEmail)
          .maybeSingle()
        
        if (!error && emailData) {
          data = emailData
        }
      }
      
      if (data) {
        setCustomerName(data.name || '')
        setCustomerNickname(data.nickname || '')
        setCustomerEmail(data.email || userEmail || '')
        setCustomerPhone(data.phone || '')
      } else {
        // customersテーブルにデータがない場合はログインユーザーのメールのみ設定
        setCustomerEmail(userEmail || '')
      }
    } catch (error) {
      // エラーの場合もログインユーザーのメールを設定
      setCustomerEmail(userEmail || '')
    }
  }

  useEffect(() => {
    if (userId || userEmail) {
      loadCustomerInfo()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userEmail])

  return {
    customerName,
    setCustomerName,
    customerNickname,
    setCustomerNickname,
    customerEmail,
    setCustomerEmail,
    customerPhone,
    setCustomerPhone,
    loadCustomerInfo
  }
}

