import { useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { supabase } from '@/lib/supabase'

interface Store {
  id: string
  name: string
}

export const useSettingsStore = () => {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name')
        .order('name')

      if (error) {
        logger.error('店舗取得エラー:', error)
        return
      }

      setStores(data || [])
      
      // デフォルトで「全店舗」を選択
      setSelectedStoreId('all')
    } catch (error) {
      logger.error('店舗取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStoreChange = (storeId: string) => {
    setSelectedStoreId(storeId)
  }

  return {
    stores,
    selectedStoreId,
    loading,
    handleStoreChange
  }
}
