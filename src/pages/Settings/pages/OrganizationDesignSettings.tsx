/**
 * 組織デザイン設定
 * 組織トップページのデザインに関わる設定を管理
 */
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Save, Loader2, Palette, Image, Upload, X } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

export function OrganizationDesignSettings() {
  const { organization, isLoading, refetch: refetchOrg } = useOrganization()
  const [themeColor, setThemeColor] = useState('#E60012')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 組織のデザイン設定を反映
  useEffect(() => {
    if (organization) {
      setThemeColor(organization.theme_color || '#E60012')
      setHeaderImageUrl(organization.header_image_url || '')
    }
  }, [organization])

  // 画像アップロード
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // バリデーション
    const validation = validateImageFile(file, 10) // 10MB制限
    if (!validation.valid) {
      showToast.error(validation.error || 'ファイルが無効です')
      return
    }

    setUploading(true)
    try {
      const result = await uploadImage(file, 'key-visuals', 'organization-headers', true)
      if (result) {
        setHeaderImageUrl(result.url)
        showToast.success('画像をアップロードしました')
      } else {
        showToast.error('画像のアップロードに失敗しました')
      }
    } catch (error) {
      logger.error('画像アップロードエラー:', error)
      showToast.error('画像のアップロードに失敗しました')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 画像削除
  const handleRemoveImage = () => {
    setHeaderImageUrl('')
  }

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
          {/* アップロードエリア */}
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleImageUpload}
              className="hidden"
              id="header-image-upload"
            />
            
            {headerImageUrl ? (
              // 画像プレビュー
              <div className="relative rounded-lg overflow-hidden border bg-gray-50">
                <img 
                  src={headerImageUrl} 
                  alt="ヘッダープレビュー"
                  className="w-full h-40 object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.src = ''
                    target.alt = '画像を読み込めません'
                  }}
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                  title="画像を削除"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              // アップロードボタン
              <label
                htmlFor="header-image-upload"
                className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-500">アップロード中...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-gray-400" />
                    <span className="text-sm text-gray-500">クリックして画像を選択</span>
                    <span className="text-xs text-gray-400">JPEG, PNG, GIF, WebP（10MB以下）</span>
                  </div>
                )}
              </label>
            )}

            {/* 画像変更ボタン */}
            {headerImageUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                画像を変更
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            推奨サイズ: 横幅1200px以上、高さ300px〜400px程度
          </p>
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || uploading}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          保存
        </Button>
      </div>
    </div>
  )
}
