/**
 * 組織デザイン設定
 * 組織トップページのデザインに関わる設定を管理
 */
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Save, Loader2, Palette, Image, Upload, X, Check } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { updateOrganization } from '@/lib/organization'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { PageHeader } from '@/components/layout/PageHeader'
import { SectionTitle } from '@/components/settings/SectionTitle'
import { THEME_PRESETS, DEFAULT_PRESET, findPresetByPrimary } from '@/lib/themePresets'

export function OrganizationDesignSettings() {
  const { organization, isLoading, refetch: refetchOrg } = useOrganization()
  const [themeColor, setThemeColor] = useState(DEFAULT_PRESET.primary)
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
      setThemeColor(organization.theme_color || DEFAULT_PRESET.primary)
      setHeaderImageUrl(organization.header_image_url || '')
      setFaviconUrl(organization.favicon_url || '')
    }
  }, [organization])

  const currentPreset = findPresetByPrimary(themeColor)

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
          description="予約サイトのヘッダー帯・ボタン・強調色に適用されます。UI が崩れないよう検証済みのプリセットから選択してください。"
        />

        {/* サンプルプレビュー (プリセット選択の上に配置) */}
        {currentPreset && (
          <div className="mb-5 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              選択中のプリセット「{currentPreset.label}」で予約サイトはこう見えます (サンプル)
            </p>
            <div className="border rounded-lg overflow-hidden bg-gray-50">
              {/* ヘッダー帯サンプル */}
              <div
                className="px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: currentPreset.primary, color: currentPreset.onPrimary }}
              >
                <span className="text-sm">← 戻る</span>
                <span className="opacity-50">|</span>
                <span className="text-sm font-medium">シナリオ詳細</span>
              </div>

              {/* コンテンツ風 */}
              <div className="p-4 bg-white space-y-3">
                {/* タイトル風 */}
                <div className="text-lg font-bold">サンプルシナリオタイトル</div>

                {/* バッジ群 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded"
                    style={{ backgroundColor: currentPreset.primaryLight, color: currentPreset.primary }}
                  >
                    おすすめ
                  </span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded"
                    style={{ backgroundColor: currentPreset.accent, color: '#000' }}
                  >
                    ロングセラー
                  </span>
                </div>

                {/* セクションヘッダー帯 (あらすじ風) */}
                <div
                  className="px-3 py-1.5 rounded text-sm font-medium"
                  style={{ backgroundColor: currentPreset.primary, color: currentPreset.onPrimary }}
                >
                  📖 あらすじ
                </div>

                {/* ボタン群 */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium rounded transition-colors"
                    style={{ backgroundColor: currentPreset.primary, color: currentPreset.onPrimary }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = currentPreset.primaryHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = currentPreset.primary }}
                  >
                    予約する
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium rounded bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                  >
                    貸切リクエスト
                  </button>
                  <span className="text-xs text-muted-foreground ml-2">(ホバーで色が変わります)</span>
                </div>

                {/* 注意 (アンバー固定) */}
                <div className="text-xs px-3 py-2 rounded bg-amber-50 text-amber-800 border-l-4 border-amber-500">
                  参加したい日程を選択してください
                </div>

                {/* 警告/エラー (赤色固定) */}
                <div className="text-xs px-3 py-2 rounded bg-red-50 text-red-700 border border-red-200">
                  ⚠ 予約に失敗しました
                </div>

                {/* 凡例 */}
                <div className="pt-2 mt-2 border-t space-y-1 text-[10px] text-muted-foreground leading-relaxed">
                  <div>※ <span className="font-medium text-amber-700">アンバー</span>: 注意喚起・入力催促 (テーマに依存しない)</div>
                  <div>※ <span className="font-medium text-red-600">赤</span>: 警告・エラー (テーマに依存しない)</div>
                  <div>※ <span className="font-medium text-purple-700">紫</span>: 貸切リクエスト関連 (通常予約と区別、 テーマに依存しない)</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {THEME_PRESETS.map((preset) => {
            const isSelected = currentPreset?.key === preset.key
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => setThemeColor(preset.primary)}
                className={`relative flex flex-col items-stretch overflow-hidden rounded-lg border transition-all ${
                  isSelected
                    ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-1'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <div
                  className="flex items-center justify-between px-3 py-2"
                  style={{ backgroundColor: preset.primary, color: preset.onPrimary }}
                >
                  <span className="text-xs font-medium">{preset.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </div>
                <div className="flex gap-1 px-2 py-1.5 bg-white">
                  <div className="h-2.5 flex-1 rounded" style={{ backgroundColor: preset.primaryHover }} />
                  <div className="h-2.5 flex-1 rounded" style={{ backgroundColor: preset.primaryLight }} />
                  <div className="h-2.5 flex-1 rounded" style={{ backgroundColor: preset.accent }} />
                </div>
                <div className="px-2 pb-1.5 text-[9px] text-muted-foreground font-mono text-left">
                  {preset.primary}
                </div>
              </button>
            )
          })}
        </div>
        {!currentPreset && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            現在の設定 ({themeColor}) はプリセットに無いカスタムカラーです。プリセットを選ぶと上書きされます。
          </p>
        )}
      </section>

      {/* タイポスケール サンプル */}
      {currentPreset && (
        <section className="bg-white rounded-xl border p-6">
          <SectionTitle
            icon={Palette}
            label="タイポスケール (適用予定のサンプル)"
            description="予約サイトの文字サイズ階層を統一する設計案。 シナリオ詳細ページのモックでサンプル表示。 OK なら本実装します。"
          />
          <div className="border bg-gray-50 overflow-hidden">
            {/* ヘッダー帯 */}
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: currentPreset.primary, color: currentPreset.onPrimary }}
            >
              <span className="text-sm">← 戻る</span>
              <span className="opacity-50">|</span>
              <span className="text-sm font-medium">シナリオ詳細</span>
            </div>

            {/* ヒーロー (シナリオ概要) */}
            <div className="bg-zinc-900 text-white p-5 grid grid-cols-[120px_1fr] gap-4">
              <div className="bg-zinc-700 aspect-[3/4] flex items-center justify-center text-zinc-500 text-xs">画像</div>
              <div className="space-y-2">
                <div className="text-xs text-zinc-400">作者名</div>
                <h1 className="text-2xl font-bold leading-tight">サンプルシナリオタイトル</h1>
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <span>👥 7名</span>
                  <span>⏱ 210分</span>
                  <span className="font-medium text-white">¥5,000〜</span>
                </div>
                <div className="text-sm text-zinc-300">📍 馬場・大塚・大久保</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="px-2 py-0.5 text-xs bg-white/10 border border-white/20">LARP</span>
                  <span
                    className="px-2 py-0.5 text-xs"
                    style={{ backgroundColor: currentPreset.primaryLight, color: currentPreset.primary }}
                  >
                    オススメ
                  </span>
                  <span
                    className="px-2 py-0.5 text-xs"
                    style={{ backgroundColor: currentPreset.accent, color: '#fff' }}
                  >
                    ロングセラー
                  </span>
                </div>
              </div>
            </div>

            {/* セクション (あらすじ) */}
            <div className="bg-white">
              <div
                className="px-4 py-2.5 flex items-center gap-2"
                style={{ backgroundColor: currentPreset.primary, color: currentPreset.onPrimary }}
              >
                <span>📖</span>
                <h2 className="text-base font-semibold">あらすじ</h2>
              </div>
              <div className="p-4">
                <p className="text-sm leading-relaxed text-gray-700">
                  ここに本文が入ります。 本文は <span className="font-mono text-[10px] bg-gray-100 px-1">text-sm (14px)</span> で読みやすい行間。 見出しと本文のサイズ差で階層が明確になります。
                </p>
              </div>
            </div>

            {/* セクション (注意事項) */}
            <div className="bg-white border-t">
              <div className="px-4 py-2.5">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  注意事項
                  <span className="text-xs text-amber-600 font-normal">※必ずご確認ください</span>
                </h2>
              </div>
              <ul className="px-4 pb-4 space-y-1 text-sm text-gray-700">
                <li>・入店可能時間は開演時間の10分前です</li>
                <li>・公演時間は目安です</li>
              </ul>
            </div>

            {/* 右パネル (予約UI) のサンプル */}
            <div className="bg-white border-t p-4 space-y-4">
              <div className="text-xs font-medium text-muted-foreground mb-2">— 予約パネル (右カラム) サンプル —</div>

              {/* タブ */}
              <div className="grid grid-cols-2 border-b">
                <div className="text-center py-2 text-sm font-medium border-b-2 border-gray-900 -mb-px">公演日程</div>
                <div className="text-center py-2 text-sm text-gray-500">貸切リクエスト</div>
              </div>

              {/* ラベル + 内容 (すべて同一階層) — 全ラベルを text-sm font-medium で統一 */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">店舗で絞り込み</label>
                <div className="border px-3 py-2 text-sm bg-white flex items-center justify-between">
                  <span className="text-gray-500">店舗を選択</span>
                  <span className="text-xs text-gray-400">▼</span>
                </div>
              </div>

              {/* アナウンス (アンバー) */}
              <div className="text-sm px-3 py-2 bg-amber-50 text-amber-800 border-l-4 border-amber-500">
                参加したい日程を選択してください
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">日付を選択</label>
                <div className="border p-4 text-sm text-center text-muted-foreground">
                  現在予約可能な公演はありません
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">人数を選択</label>
                <div className="border p-3 flex items-center justify-between text-sm">
                  <span className="text-gray-700">予約人数</span>
                  <span className="border px-2 py-0.5 text-sm">1名 ▼</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">料金</label>
                <div className="border p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">参加費(1名)</span>
                    <span className="font-medium">¥5,000</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">人数</span>
                    <span className="font-medium">1名</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between items-baseline">
                    <span className="text-sm text-muted-foreground">合計</span>
                    <span className="text-lg font-bold" style={{ color: currentPreset.primary }}>¥5,000</span>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-medium text-gray-900 mb-1.5 flex items-center">
                  注意事項
                  <span className="ml-2 text-xs text-amber-600 font-normal">※必ずご確認ください</span>
                </h2>
                <ul className="border p-3 space-y-1 text-sm text-muted-foreground">
                  <li>・入店可能時間は開演時間の10分前です</li>
                  <li>・公演時間は目安です</li>
                </ul>
              </div>

              <div className="pt-2 border-t text-[10px] text-muted-foreground leading-relaxed space-y-0.5">
                <div className="font-medium text-gray-900 mb-0.5">タイポスケール</div>
                <div>・ラベル (店舗で絞り込み / 人数を選択 / 料金 / 注意事項) : <span className="font-mono">text-sm font-medium</span></div>
                <div>・本文 / 選択値 / 注意事項本文 : <span className="font-mono">text-sm</span></div>
                <div>・キャプション (アンバー※ など) : <span className="font-mono">text-xs</span></div>
                <div>・合計金額のみ強調 : <span className="font-mono">text-lg font-bold</span></div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-gray-900 mb-1">タイポスケール (適用予定)</div>
            <div>・H1 (シナリオタイトル) : <span className="font-mono">text-2xl (24px) bold</span></div>
            <div>・H2 (セクションヘッダー) : <span className="font-mono">text-base (16px) semibold</span></div>
            <div>・メタ情報 / 本文 : <span className="font-mono">text-sm (14px)</span></div>
            <div>・バッジ / キャプション : <span className="font-mono">text-xs (12px)</span></div>
            <div>・作者名 / 注釈 : <span className="font-mono">text-xs (12px) muted</span></div>
          </div>
        </section>
      )}

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
