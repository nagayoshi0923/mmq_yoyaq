import { useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { storeApi } from '@/lib/api/storeApi'

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
      // 組織対応済みの店舗取得
      const data = await storeApi.getAll()

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
