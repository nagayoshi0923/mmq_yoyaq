import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { CustomerInfo } from '../types'

interface UseCustomerDataProps {
  userId?: string
  userEmail?: string
}

/**
 * 顧客情報取得・管理フック
 */
export function useCustomerData({ userId, userEmail }: UseCustomerDataProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  /**
   * 顧客情報を読み込み
   */
  const loadCustomerInfo = async () => {
    if (!userId) return
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('name, email, phone')
        .eq('user_id', userId)
        .single()
      
      if (error) {
        // customersテーブルにデータがない場合はログインユーザーのメールのみ設定
        setCustomerEmail(userEmail || '')
        return
      }
      
      if (data) {
        setCustomerName(data.name || '')
        setCustomerEmail(data.email || userEmail || '')
        setCustomerPhone(data.phone || '')
      }
    } catch (error) {
      // エラーの場合もログインユーザーのメールを設定
      setCustomerEmail(userEmail || '')
    }
  }

  useEffect(() => {
    if (userId) {
      loadCustomerInfo()
    }
  }, [userId])

  return {
    customerName,
    setCustomerName,
    customerEmail,
    setCustomerEmail,
    customerPhone,
    setCustomerPhone,
    loadCustomerInfo
  }
}

