import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'

interface Store {
  id: string
  name: string
}

interface StoreSelectorProps {
  selectedStoreId: string
  onStoreChange: (storeId: string) => void
}

export const StoreSelector: React.FC<StoreSelectorProps> = ({ 
  selectedStoreId, 
  onStoreChange 
}) => {
  const [stores, setStores] = useState<Store[]>([])
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
        console.error('店舗取得エラー:', error)
        return
      }

      setStores(data || [])
    } catch (error) {
      console.error('店舗取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return null
  }

  // 店舗が1つしかない場合は表示しない
  if (stores.length <= 1) {
    return null
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Label htmlFor="store">店舗</Label>
        <select
          id="store"
          value={selectedStoreId}
          onChange={(e) => onStoreChange(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {stores.map(store => (
            <option key={store.id} value={store.id}>{store.name}</option>
          ))}
        </select>
      </CardContent>
    </Card>
  )
}
