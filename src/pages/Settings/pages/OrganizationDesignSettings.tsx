/**
 * 組織デザイン設定
 * 組織トップページのデザインに関わる設定を管理
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Save, Loader2, Palette, Image, Store } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface StoreDesign {
  id: string
  name: string
  short_name: string
  header_image_url: string | null
  color: string
}

export function OrganizationDesignSettings() {
  const { organization, refetch: refetchOrg } = useOrganization()
  const [themeColor, setThemeColor] = useState('#E60012')
  const [stores, setStores] = useState<StoreDesign[]>([])
  const [loading, setLoading] = useState(true)
  const [savingTheme, setSavingTheme] = useState(false)
  const [savingStoreId, setSavingStoreId] = useState<string | null>(null)

  // 初期データ取得
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        // 店舗データ取得
        const storeData = await storeApi.getAll()
        if (storeData) {
          // 通常店舗のみ（臨時会場・オフィス除外）
          const regularStores = storeData.filter(
            (s: any) => !s.is_temporary && s.ownership_type !== 'office' && s.status === 'active'
          )
          setStores(regularStores.map((s: any) => ({
            id: s.id,
            name: s.name,
            short_name: s.short_name,
            header_image_url: s.header_image_url || null,
            color: s.color || '#3B82F6'
          })))
        }
      } catch (error) {
        logger.error('デザイン設定取得エラー:', error)
        showToast.error('データの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // 組織のテーマカラーを反映
  useEffect(() => {
    if (organization?.theme_color) {
      setThemeColor(organization.theme_color)
    }
  }, [organization])

  // テーマカラー保存
  const handleSaveThemeColor = async () => {
    if (!organization) return

    setSavingTheme(true)
    try {
      const result = await updateOrganization(organization.id, {
        theme_color: themeColor
      })
      if (result) {
        showToast.success('テーマカラーを保存しました')
        refetchOrg()
      } else {
        showToast.error('保存に失敗しました')
      }
    } catch (error) {
      logger.error('テーマカラー保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSavingTheme(false)
    }
  }

  // 店舗ヘッダー画像を更新
  const handleStoreHeaderChange = (storeId: string, url: string) => {
    setStores(prev => prev.map(s => 
      s.id === storeId ? { ...s, header_image_url: url || null } : s
    ))
  }

  // 店舗ヘッダー画像を保存
  const handleSaveStoreHeader = async (storeId: string) => {
    const store = stores.find(s => s.id === storeId)
    if (!store) return

    setSavingStoreId(storeId)
    try {
      const { error } = await supabase
        .from('stores')
        .update({ header_image_url: store.header_image_url })
        .eq('id', storeId)

      if (error) throw error
      showToast.success(`${store.short_name || store.name}のヘッダー画像を保存しました`)
    } catch (error) {
      logger.error('店舗ヘッダー保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSavingStoreId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 説明 */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <p className="text-sm text-blue-800">
            <strong>このページでできること：</strong>
            予約トップページのデザインに関わる設定を行います。
            テーマカラーや店舗ごとのヘッダー画像を設定できます。
          </p>
        </CardContent>
      </Card>

      {/* テーマカラー設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            テーマカラー
          </CardTitle>
          <CardDescription>
            予約トップページのアクセントカラーやボタンの色に使用されます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className="w-16 h-12 rounded border border-gray-300 cursor-pointer"
            />
            <Input
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              placeholder="#E60012"
              className="w-32 font-mono"
            />
            <div 
              className="px-6 py-2 rounded text-white text-sm font-medium"
              style={{ backgroundColor: themeColor }}
            >
              プレビュー
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button onClick={handleSaveThemeColor} disabled={savingTheme}>
              {savingTheme && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              保存
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 店舗ヘッダー画像設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            店舗ヘッダー画像
          </CardTitle>
          <CardDescription>
            予約トップページに表示される店舗ごとのヘッダー画像を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {stores.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              設定可能な店舗がありません
            </p>
          ) : (
            stores.map((store) => (
              <div key={store.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{store.short_name || store.name}</span>
                  <div 
                    className="w-4 h-4 rounded-full border"
                    style={{ backgroundColor: store.color }}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor={`header-${store.id}`}>ヘッダー画像URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`header-${store.id}`}
                      value={store.header_image_url || ''}
                      onChange={(e) => handleStoreHeaderChange(store.id, e.target.value)}
                      placeholder="https://example.com/header.jpg"
                      className="flex-1"
                    />
                    <Button 
                      onClick={() => handleSaveStoreHeader(store.id)}
                      disabled={savingStoreId === store.id}
                      size="sm"
                    >
                      {savingStoreId === store.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
                
                {store.header_image_url && (
                  <div className="rounded-lg overflow-hidden border bg-gray-50">
                    <img 
                      src={store.header_image_url} 
                      alt={`${store.name}ヘッダー`}
                      className="w-full h-32 object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        target.nextElementSibling?.classList.remove('hidden')
                      }}
                    />
                    <div className="hidden p-4 text-center text-sm text-muted-foreground">
                      画像を読み込めませんでした
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
