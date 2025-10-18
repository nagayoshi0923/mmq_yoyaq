import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { StoreEditModal } from '@/components/modals/StoreEditModal'
import { storeApi } from '@/lib/api'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
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
  Building,
  ArrowLeft,
  CalendarDays,
  DoorOpen
} from 'lucide-react'


export function StoreManagement() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // スクロール位置の保存と復元（汎用フックを使用）
  useScrollRestoration({ pageKey: 'store', isLoading: loading })

  useEffect(() => {
    loadStores()
  }, [])

  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && hash !== 'stores') {
        // 他のページに切り替わった場合、AdminDashboardに戻る
        window.location.href = '/#' + hash
      } else if (!hash) {
        // ダッシュボードに戻る
        window.location.href = '/'
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  async function loadStores() {
    try {
      setLoading(true)
      setError('')
      const data = await storeApi.getAll()
      setStores(data)
    } catch (err: any) {
      console.error('Error loading stores:', err)
      setError('店舗データの読み込みに失敗しました: ' + err.message)
      // エラー時は空配列を設定
      setStores([])
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteStore(store: Store) {
    if (!confirm(`「${store.name}」を削除してもよろしいですか？\n\nこの操作は取り消せません。`)) {
      return
    }

    try {
      await storeApi.delete(store.id)
      // 削除成功後、リストから除去
      setStores(prev => prev.filter(s => s.id !== store.id))
    } catch (err: any) {
      console.error('Error deleting store:', err)
      alert('店舗の削除に失敗しました: ' + err.message)
    }
  }

  function handleEditStore(store: Store) {
    setEditingStore(store)
    setIsEditModalOpen(true)
  }

  async function handleSaveStore(updatedStore: Store) {
    try {
      const savedStore = await storeApi.update(updatedStore.id, updatedStore)
      // 更新成功後、リストを更新
      setStores(prev => prev.map(s => s.id === savedStore.id ? savedStore : s))
    } catch (err: any) {
      console.error('Error updating store:', err)
      alert('店舗の更新に失敗しました: ' + err.message)
      throw err // モーダルでエラーハンドリングするため再throw
    }
  }

  function handleCloseEditModal() {
    setIsEditModalOpen(false)
    setEditingStore(null)
  }

  // 店舗識別色を返すヘルパー関数
  const getStoreThemeClasses = (shortName: string) => {
    switch (shortName) {
      case '馬場': return { dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800' }
      case '別館①': return { dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' }
      case '別館②': return { dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800' }
      case '大久保': return { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800' }
      case '大塚': return { dot: 'bg-red-500', badge: 'bg-red-100 text-red-800' }
      case '埼玉大宮': return { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' }
      default: return { dot: 'bg-gray-500', badge: 'bg-gray-100 text-gray-800' }
    }
  }

  // ステータスバッジを返すヘルパー関数
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-100 text-green-800">営業中</Badge>
      case 'temporarily_closed': return <Badge className="bg-yellow-100 text-yellow-800">一時休業</Badge>
      case 'closed': return <Badge className="bg-red-100 text-red-800">閉鎖</Badge>
      default: return <Badge className="bg-gray-100 text-gray-800">不明</Badge>
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="stores" />
        
        <div className="container mx-auto max-w-7xl px-8 py-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1>店舗管理</h1>
              <Button disabled>
                <Plus className="h-4 w-4 mr-2" />
                新規店舗
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mt-2"></div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="stores" />
        
        <div className="container mx-auto max-w-7xl px-8 py-6">
          <div className="space-y-6">
            <h1>店舗管理</h1>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-800">
                  <Trash2 className="h-5 w-5" />
                  <p>{error}</p>
                </div>
                <Button 
                  onClick={() => setError('')} 
                  className="mt-4"
                  variant="outline"
                >
                  再読み込み
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  const totalCapacity = stores.reduce((sum, store) => sum + (store.capacity || 0), 0)
  const totalRooms = stores.reduce((sum, store) => sum + (store.rooms || 0), 0)
  const activeStores = stores.filter(store => store.status === 'active').length

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="stores" />
      
      <div className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                戻る
              </Button>
              <div>
                <h1>店舗管理</h1>
                <p className="text-muted-foreground">
                  Queens Waltz 全{stores.length}店舗の管理
                </p>
              </div>
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
                  <StoreIcon className="h-5 w-5 text-muted-foreground" />
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
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{totalCapacity}名</p>
                    <p className="text-muted-foreground">総収容人数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{totalRooms}室</p>
                    <p className="text-muted-foreground">総部屋数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{activeStores}</p>
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
                    <div className="space-y-2">
                      {store.address && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{store.address}</span>
                        </div>
                      )}
                      {store.phone_number && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{store.phone_number}</span>
                        </div>
                      )}
                      {store.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{store.email}</span>
                        </div>
                      )}
                      {store.opening_date && (
                        <div className="flex items-center gap-2 text-sm">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          <span>開店日: {new Date(store.opening_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

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
                        <p className="text-sm line-clamp-2">{store.notes}</p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleEditStore(store)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        編集
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleDeleteStore(store)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        削除
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* 編集モーダル */}
      <StoreEditModal
        store={editingStore}
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSaveStore}
      />
    </div>
  )
}
