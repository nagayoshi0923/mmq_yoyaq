/**
 * 組織デザイン設定
 * 組織トップページのデザインに関わる設定を管理
 */
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Save, Loader2, Palette, Image } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

export function OrganizationDesignSettings() {
  const { organization, isLoading, refetch: refetchOrg } = useOrganization()
  const [themeColor, setThemeColor] = useState('#E60012')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [saving, setSaving] = useState(false)

  // 組織のデザイン設定を反映
  useEffect(() => {
    if (organization) {
      setThemeColor(organization.theme_color || '#E60012')
      setHeaderImageUrl(organization.header_image_url || '')
    }
  }, [organization])

  // 保存
  const handleSave = async () => {
    if (!organization) return

    setSaving(true)
    try {
      const result = await updateOrganization(organization.id, {
        theme_color: themeColor,
        header_image_url: headerImageUrl || null
      })
      if (result) {
        showToast.success('デザイン設定を保存しました')
        refetchOrg()
      } else {
        showToast.error('保存に失敗しました')
      }
    } catch (error) {
      logger.error('デザイン設定保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
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
            テーマカラーやヘッダー画像を設定できます。
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
        </CardContent>
      </Card>

      {/* ヘッダー画像設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            ヘッダー画像
          </CardTitle>
          <CardDescription>
            予約トップページに表示されるヘッダー画像を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="header_image_url">画像URL</Label>
            <Input
              id="header_image_url"
              value={headerImageUrl}
              onChange={(e) => setHeaderImageUrl(e.target.value)}
              placeholder="https://example.com/header.jpg"
            />
            <p className="text-xs text-muted-foreground">
              推奨サイズ: 横幅1200px以上、高さ300px〜400px程度
            </p>
          </div>
          
          {headerImageUrl && (
            <div className="rounded-lg overflow-hidden border bg-gray-50">
              <img 
                src={headerImageUrl} 
                alt="ヘッダープレビュー"
                className="w-full h-40 object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  const errorDiv = target.nextElementSibling
                  if (errorDiv) errorDiv.classList.remove('hidden')
                }}
              />
              <div className="hidden p-4 text-center text-sm text-muted-foreground">
                画像を読み込めませんでした。URLが正しいか確認してください。
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          保存
        </Button>
      </div>
    </div>
  )
}
