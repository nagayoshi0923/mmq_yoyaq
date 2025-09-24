import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { storeApi } from '@/lib/api'
import { getStoreColors } from '@/lib/utils'
import type { Store } from '@/types'
import { 
  Store as StoreIcon, 
  Plus, 
  Edit, 
  Trash2, 
  MapPin, 
  Phone, 
  Mail, 
  Users,
  Building
} from 'lucide-react'

export function StoreManagement() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStores()
  }, [])

  async function loadStores() {
    try {
      setLoading(true)
      const data = await storeApi.getAll()
      setStores(data)
    } catch (error: any) {
      setError('店舗データの読み込みに失敗しました: ' + error.message)
      console.error('Error loading stores:', error)
    } finally {
      setLoading(false)
    }
  }

  function getStoreThemeClasses(storeShortName: string) {
    const storeIdMap: Record<string, string> = {
      '馬場': 'takadanobaba',
      '別館①': 'bekkan1', 
      '別館②': 'bekkan2',
      '大久保': 'okubo',
      '大塚': 'otsuka',
      '埼玉大宮': 'omiya'
    }
    
    const storeId = storeIdMap[storeShortName] || 'takadanobaba'
    return getStoreColors(storeId)
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">営業中</Badge>
      case 'temporarily_closed':
        return <Badge className="bg-yellow-100 text-yellow-800">一時休業</Badge>
      case 'closed':
        return <Badge className="bg-red-100 text-red-800">閉店</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1>店舗管理</h1>
            <Button disabled>
              <Plus className="h-4 w-4 mr-2" />
              新規店舗
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <h1>店舗管理</h1>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-800">
                <Trash2 className="h-5 w-5" />
                <p>{error}</p>
              </div>
              <Button 
                onClick={loadStores} 
                className="mt-4"
                variant="outline"
              >
                再読み込み
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1>店舗管理</h1>
            <p className="text-muted-foreground">
              Queens Waltz 全{stores.length}店舗の管理
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            新規店舗
          </Button>
        </div>

        {/* 統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <StoreIcon className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{stores.length}</p>
                  <p className="text-muted-foreground">総店舗数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {stores.reduce((sum, store) => sum + store.capacity, 0)}
                  </p>
                  <p className="text-muted-foreground">総収容人数</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {stores.reduce((sum, store) => sum + store.rooms, 0)}
                  </p>
                  <p className="text-muted-foreground">総部屋数</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <StoreIcon className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {stores.filter(s => s.status === 'active').length}
                  </p>
                  <p className="text-muted-foreground">営業中店舗</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 店舗一覧 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((store) => {
            const colors = getStoreThemeClasses(store.short_name)
            
            return (
              <Card key={store.id} className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${colors.dot}`}></div>
                        {store.name}
                      </CardTitle>
                      <CardDescription>
                        {store.short_name}
                      </CardDescription>
                    </div>
                    {getStatusBadge(store.status)}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* 基本情報 */}
                  <div className="space-y-2">
                    {store.address && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4" />
                        <span>{store.address}</span>
                      </div>
                    )}
                    
                    {store.phone_number && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4" />
                        <span>{store.phone_number}</span>
                      </div>
                    )}
                    
                    {store.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4" />
                        <span>{store.email}</span>
                      </div>
                    )}
                  </div>

                  {/* 詳細情報 */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">収容人数</p>
                      <p className="text-lg font-bold">{store.capacity}名</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">部屋数</p>
                      <p className="text-lg font-bold">{store.rooms}室</p>
                    </div>
                  </div>

                  {store.manager_name && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">店長</p>
                      <p>{store.manager_name}</p>
                    </div>
                  )}

                  {store.notes && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">メモ</p>
                      <p className="text-sm">{store.notes}</p>
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Edit className="h-4 w-4 mr-2" />
                      編集
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
