import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { PageHeader } from '@/components/layout/PageHeader'
import { StoreEditModal } from '@/components/modals/StoreEditModal'
import { storeApi } from '@/lib/api'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import type { Store } from '@/types'
import { logger } from '@/utils/logger'
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
      logger.error('Error loading stores:', err)
      setError('店舗データの読み込みに失敗しました: ' + err.message)
      // エラー時は空配列を設定
      setStores([])
    } finally {
      setLoading(false)
    }
  }


  function handleEditStore(store: Store) {
    setEditingStore(store)
    setIsEditModalOpen(true)
  }

  function openEditModal(store: Store | null) {
    console.log('openEditModal called with:', store)
    setEditingStore(store)
    setIsEditModalOpen(true)
    console.log('Modal state set to open')
  }

  async function handleSaveStore(updatedStore: Store) {
    try {
      // idの有無で新規作成か更新かを判定
      if (updatedStore.id) {
        // 更新
        const savedStore = await storeApi.update(updatedStore.id, updatedStore)
        setStores(prev => prev.map(s => s.id === savedStore.id ? savedStore : s))
      } else {
        // 新規作成
        const newStore = await storeApi.create(updatedStore)
        setStores(prev => [...prev, newStore])
      }
    } catch (err: any) {
      logger.error('Error saving store:', err)
      alert('店舗の保存に失敗しました: ' + err.message)
      throw err // モーダルでエラーハンドリングするため再throw
    }
  }

  async function handleDeleteStore(store: Store) {
    try {
      await storeApi.delete(store.id)
      // 削除成功後、リストから除去
      setStores(prev => prev.filter(s => s.id !== store.id))
    } catch (err: any) {
      logger.error('Error deleting store:', err)
      alert('店舗の削除に失敗しました: ' + err.message)
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
        
        <div className="container mx-auto max-w-7xl px-2 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-6 max-w-full overflow-hidden">
          <div className="space-y-3 sm:space-y-4 md:space-y-6">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div className="flex-1">
                  <h1>店舗管理</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Queens Waltz の店舗を管理
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button disabled size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    新規店舗
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
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
        
        <div className="container mx-auto max-w-7xl px-2 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-6 max-w-full overflow-hidden">
          <div className="space-y-3 sm:space-y-4 md:space-y-6">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div className="flex-1">
                  <h1>店舗管理</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Queens Waltz の店舗を管理
                  </p>
                </div>
              </div>
            </div>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex items-center gap-2 text-red-800 text-sm sm:text-base">
                  <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                  <p className="break-words">{error}</p>
                </div>
                <Button 
                  onClick={() => setError('')} 
                  className="mt-3 sm:mt-4"
                  variant="outline"
                  size="sm"
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
      
      <div className="container mx-auto max-w-7xl px-2 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-6 max-w-full overflow-hidden">
        <div className="space-y-3 sm:space-y-4 md:space-y-6">
          <PageHeader
            title="店舗管理"
            description={`Queens Waltz 全${stores.length}店舗の管理`}
          >
            <Button 
              onClick={() => openEditModal(null)}
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              新規店舗
            </Button>
          </PageHeader>

          {/* 統計情報 */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            <Card>
              <CardContent className="pt-3 sm:pt-4 md:pt-6">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <StoreIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-base md:text-lg truncate">{stores.length}</p>
                    <p className="text-xs text-muted-foreground truncate">総店舗数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3 sm:pt-4 md:pt-6">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-base md:text-lg truncate">{totalCapacity}名</p>
                    <p className="text-xs text-muted-foreground truncate">総収容人数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3 sm:pt-4 md:pt-6">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <DoorOpen className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-base md:text-lg truncate">{totalRooms}室</p>
                    <p className="text-xs text-muted-foreground truncate">総部屋数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3 sm:pt-4 md:pt-6">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Building className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-base md:text-lg truncate">{activeStores}</p>
                    <p className="text-xs text-muted-foreground truncate">営業中店舗</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 店舗一覧 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {stores.map((store) => {
              const colors = getStoreThemeClasses(store.short_name)
              
              return (
                <Card key={store.id} className="bg-card border-border">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-lg">
                          <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0 ${colors.dot}`}></div>
                          <span className="truncate">{store.name}</span>
                        </CardTitle>
                        <CardDescription className="text-xs sm:text-sm truncate">
                          {store.short_name}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-1 sm:gap-2 flex-shrink-0">
                        <div className="scale-75 sm:scale-100 origin-top-right">
                          {getStatusBadge(store.status)}
                        </div>
                        {store.ownership_type && (
                          <Badge className={
                            `text-xs px-1 sm:px-2 py-0 ${
                              store.ownership_type === 'corporate' ? 'bg-blue-100 text-blue-800' : 
                              store.ownership_type === 'office' ? 'bg-purple-100 text-purple-800' :
                              'bg-amber-100 text-amber-800'
                            }`
                          }>
                            {store.ownership_type === 'corporate' ? '直営店' : 
                             store.ownership_type === 'office' ? 'オフィス' : 'FC'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-2 sm:space-y-3 md:space-y-4">
                    <div className="space-y-1.5 sm:space-y-2">
                      {store.address && (
                        <div className="flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm">
                          <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <span className="break-words min-w-0">{store.address}</span>
                        </div>
                      )}
                      {store.phone_number && (
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                          <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                          <span className="break-all">{store.phone_number}</span>
                        </div>
                      )}
                      {store.email && (
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                          <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                          <span className="break-all truncate">{store.email}</span>
                        </div>
                      )}
                      {store.opening_date && (
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                          <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">開店日: {new Date(store.opening_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 pt-2 border-t border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">収容人数</p>
                        <p className="text-base sm:text-lg">{store.capacity}名</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">部屋数</p>
                        <p className="text-base sm:text-lg">{store.rooms}室</p>
                      </div>
                    </div>

                    {store.manager_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">店長</p>
                        <p className="text-xs sm:text-sm truncate">{store.manager_name}</p>
                      </div>
                    )}

                    {store.notes && (
                      <div>
                        <p className="text-xs text-muted-foreground">メモ</p>
                        <p className="text-xs sm:text-sm line-clamp-2 break-words">{store.notes}</p>
                      </div>
                    )}

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full text-xs sm:text-sm"
                      onClick={() => handleEditStore(store)}
                    >
                      <Edit className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                      編集
                    </Button>
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
        onDelete={handleDeleteStore}
      />
    </div>
  )
}
