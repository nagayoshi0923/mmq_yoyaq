/**
 * 組織デザイン設定
 * 組織トップページのデザインに関わる設定を管理
 */
import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Save, Loader2, Palette, Image, Upload, X } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { PageHeader } from '@/components/layout/PageHeader'
import { SectionTitle } from '@/components/settings/SectionTitle'

export function OrganizationDesignSettings() {
  const { organization, isLoading, refetch: refetchOrg } = useOrganization()
  const [themeColor, setThemeColor] = useState('#E60012')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [faviconUrl, setFaviconUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  // 組織のデザイン設定を反映
  useEffect(() => {
    if (organization) {
      setThemeColor(organization.theme_color || '#E60012')
      setHeaderImageUrl(organization.header_image_url || '')
      setFaviconUrl(organization.favicon_url || '')
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

  // ファビコンアップロード
  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // バリデーション（1MB制限、小さい画像なので）
    const validation = validateImageFile(file, 1)
    if (!validation.valid) {
      showToast.error(validation.error || 'ファイルが無効です')
      return
    }

    setUploadingFavicon(true)
    try {
      const result = await uploadImage(file, 'key-visuals', 'favicons', true)
      if (result) {
        setFaviconUrl(result.url)
        showToast.success('ファビコンをアップロードしました')
      } else {
        showToast.error('ファビコンのアップロードに失敗しました')
      }
    } catch (error) {
      logger.error('ファビコンアップロードエラー:', error)
      showToast.error('ファビコンのアップロードに失敗しました')
    } finally {
      setUploadingFavicon(false)
      if (faviconInputRef.current) {
        faviconInputRef.current.value = ''
      }
    }
  }

  // ファビコン削除
  const handleRemoveFavicon = () => {
    setFaviconUrl('')
  }

  // 保存
  const handleSave = async () => {
    if (!organization) return

    setSaving(true)
    try {
      const result = await updateOrganization(organization.id, {
        theme_color: themeColor,
        header_image_url: headerImageUrl || null,
        favicon_url: faviconUrl || null
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
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader title="デザイン設定" description="予約サイトの見た目・ブランド表示を管理します">
        <Button size="sm" onClick={handleSave} disabled={saving || uploading || uploadingFavicon}>
          {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {!saving && <Save className="w-3.5 h-3.5 mr-1.5" />}
          保存
        </Button>
      </PageHeader>

      {/* テーマカラー */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Palette}
          label="テーマカラー"
          description="サイトのアクセントカラーです。予約ページ（/{slug}）のボタンや強調色に適用されます。"
        />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="w-14 h-10 rounded border border-gray-300 cursor-pointer"
              />
              <Input
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                placeholder="#E60012"
                className="w-32 font-mono"
              />
              <div
                className="px-5 py-2 rounded text-white text-sm font-medium"
                style={{ backgroundColor: themeColor }}
              >
                プレビュー
              </div>
            </div>
            <p className="text-xs text-muted-foreground">カラーピッカーまたは16進数コードで指定してください。</p>
          </div>
        </div>
      </section>

      {/* ヘッダー画像 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Image}
          label="ヘッダー画像"
          description="予約サイトトップのヒーロー画像として表示されます。推奨サイズは横幅1200px以上・高さ300〜400px程度です。"
        />
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleImageUpload}
            className="hidden"
            id="header-image-upload"
          />

          <div className="space-y-1.5">
            {headerImageUrl ? (
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
            <p className="text-xs text-muted-foreground">画像を変更するとすぐにプレビューへ反映されます。「保存」を押すまで確定されません。</p>
          </div>
        </div>
      </section>

      {/* ファビコン */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Image}
          label="ファビコン"
          description="ブラウザのタブに表示されるアイコンです。正方形（推奨: 32×32px または 64×64px）の画像を設定してください。"
        />
        <div className="space-y-4">
          <input
            ref={faviconInputRef}
            type="file"
            accept="image/png,image/x-icon,image/svg+xml"
            onChange={handleFaviconUpload}
            className="hidden"
            id="favicon-upload"
          />

          <div className="space-y-1.5">
            <div className="flex items-center gap-4">
              {faviconUrl ? (
                <div className="relative">
                  <div className="w-16 h-16 rounded border bg-gray-50 flex items-center justify-center overflow-hidden">
                    <img
                      src={faviconUrl}
                      alt="ファビコン"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFavicon}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 rounded-full text-white transition-colors"
                    title="削除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                  <span className="text-xs text-gray-400">未設定</span>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => faviconInputRef.current?.click()}
                disabled={uploadingFavicon}
              >
                {uploadingFavicon ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {faviconUrl ? 'ファビコンを変更' : 'ファビコンをアップロード'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">PNG, ICO, SVG形式（1MB以下）。予約サイトのタブに表示されます。</p>
          </div>
        </div>
      </section>
    </div>
  )
}
