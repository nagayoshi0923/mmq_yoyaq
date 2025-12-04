import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpButton } from '@/components/ui/help-button'
import { StoreEditModal } from '@/components/modals/StoreEditModal'
import { storeApi } from '@/lib/api'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import type { Store } from '@/types'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { 
  Store as StoreIcon, 
  Plus, 
  Edit, 
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
    setEditingStore(store)
    setIsEditModalOpen(true)
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
      showToast.error('店舗の保存に失敗しました', err.message)
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
      showToast.error('店舗の削除に失敗しました', err.message)
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
      // @ts-ignore
      case 'active': return <Badge variant="success">営業中</Badge>
      // @ts-ignore
      case 'temporarily_closed': return <Badge variant="warning">一時休業</Badge>
      // @ts-ignore
      case 'closed': return <Badge variant="gray">閉鎖</Badge>
      default: return <Badge variant="outline">不明</Badge>
    }
  }

  const totalCapacity = stores.reduce((sum, store) => sum + (store.capacity || 0), 0)
  const totalRooms = stores.reduce((sum, store) => sum + (store.rooms || 0), 0)
  const activeStores = stores.filter(store => store.status === 'active').length

  return (
    <AppLayout
      currentPage="stores"
      maxWidth="max-w-[1440px]"
      containerPadding="px-2 py-4 sm:px-6"
    >
      <div className="space-y-6">
          <PageHeader
            title="店舗管理"
            description={`Queens Waltz 全${stores.length}店舗の管理`}
          >
            <HelpButton topic="store" label="店舗管理マニュアル" />
            <Button 
              onClick={() => openEditModal(null)}
              size="sm"
            >
              <Plus className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">新規店舗</span>
              <span className="sm:hidden">新規</span>
            </Button>
          </PageHeader>

          {error && (
            <Card className="border-red-500 bg-red-50 shadow-none">
              <CardContent className="p-4 text-red-800 text-sm">
                {error}
              </CardContent>
            </Card>
          )}

          {/* 統計情報 */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            <Card className="shadow-none border">
              <CardContent className="p-3 sm:p-4 md:pt-6">
                <div className="flex items-center gap-2">
                  <StoreIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">{stores.length}</p>
                    <p className="text-xs text-muted-foreground truncate">総店舗数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none border">
              <CardContent className="p-3 sm:p-4 md:pt-6">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">{totalCapacity}名</p>
                    <p className="text-xs text-muted-foreground truncate">総収容人数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none border">
              <CardContent className="p-3 sm:p-4 md:pt-6">
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">{totalRooms}室</p>
                    <p className="text-xs text-muted-foreground truncate">総部屋数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none border">
              <CardContent className="p-3 sm:p-4 md:pt-6">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold">{activeStores}</p>
                    <p className="text-xs text-muted-foreground truncate">営業中店舗</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 店舗一覧 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {stores.map((store) => {
              const colors = getStoreThemeClasses(store.short_name)
              
              return (
                <Card key={store.id} className="bg-card border-border shadow-none">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colors.dot}`}></div>
                          <span className="truncate">{store.name}</span>
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {store.short_name}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-1 items-end flex-shrink-0">
                        {getStatusBadge(store.status)}
                        {store.ownership_type && (
                          <Badge 
                            // @ts-ignore
                            variant={
                              store.ownership_type === 'corporate' ? 'info' : 
                              store.ownership_type === 'office' ? 'purple' :
                              'warning'
                            }
                            className="text-[10px] px-1.5 py-0 font-normal"
                          >
                            {store.ownership_type === 'corporate' ? '直営店' : 
                             store.ownership_type === 'office' ? 'オフィス' : 'FC'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-4 space-y-4">
                    <div className="space-y-2">
                      {store.address && (
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <span className="break-words min-w-0">{store.address}</span>
                        </div>
                      )}
                      {store.phone_number && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="break-all">{store.phone_number}</span>
                        </div>
                      )}
                      {store.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="break-all truncate">{store.email}</span>
                        </div>
                      )}
                      {store.opening_date && (
                        <div className="flex items-center gap-2 text-sm">
                          <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">開店日: {new Date(store.opening_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">収容人数</p>
                        <p className="text-base font-bold">{store.capacity}名</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">部屋数</p>
                        <p className="text-base font-bold">{store.rooms}室</p>
                      </div>
                    </div>

                    {store.manager_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">店長</p>
                        <p className="text-sm">{store.manager_name}</p>
                      </div>
                    )}

                    {store.notes && (
                      <div>
                        <p className="text-xs text-muted-foreground">メモ</p>
                        <p className="text-sm line-clamp-2 break-words">{store.notes}</p>
                      </div>
                    )}

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleEditStore(store)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      編集
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
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
    </AppLayout>
  )
}
