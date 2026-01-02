import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/**
 * ユーザーごとの設定を保存・取得するフック
 * ログインユーザーの場合はユーザーIDをキーに含める
 * 未ログインの場合は共通キーを使用
 */
export function useUserPreference<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const { user } = useAuth()
  
  // ユーザーIDを含めたキーを生成
  const getStorageKey = useCallback(() => {
    if (user?.id) {
      return `${key}_user_${user.id}`
    }
    return `${key}_guest`
  }, [key, user?.id])
  
  // 初期値を取得
  const getInitialValue = useCallback((): T => {
    try {
      const storageKey = getStorageKey()
      const item = localStorage.getItem(storageKey)
      if (item) {
        return JSON.parse(item) as T
      }
      
      // ユーザーキーにデータがない場合、古いキー（マイグレーション用）を確認
      const oldItem = localStorage.getItem(key)
      if (oldItem) {
        const parsed = JSON.parse(oldItem) as T
        // 新しいキーに移行
        localStorage.setItem(storageKey, oldItem)
        return parsed
      }
    } catch (error) {
      console.error('useUserPreference: 読み込みエラー', error)
    }
    return defaultValue
  }, [getStorageKey, key, defaultValue])
  
  const [value, setValue] = useState<T>(getInitialValue)
  
  // ユーザーが変わったら値を再読み込み
  useEffect(() => {
    setValue(getInitialValue())
  }, [user?.id, getInitialValue])
  
  // 値を保存
  const setAndSaveValue = useCallback((newValue: T) => {
    try {
      const storageKey = getStorageKey()
      localStorage.setItem(storageKey, JSON.stringify(newValue))
      setValue(newValue)
    } catch (error) {
      console.error('useUserPreference: 保存エラー', error)
    }
  }, [getStorageKey])
  
  return [value, setAndSaveValue]
}

/**
 * 店舗フィルター専用のフック
 */
export function useStoreFilterPreference(defaultStoreId: string = 'all') {
  return useUserPreference<string>('booking_store_filter', defaultStoreId)
}

/**
 * 貸切リクエストの店舗選択専用のフック
 */
export function usePrivateBookingStorePreference() {
  return useUserPreference<string[]>('private_booking_stores', [])
}



