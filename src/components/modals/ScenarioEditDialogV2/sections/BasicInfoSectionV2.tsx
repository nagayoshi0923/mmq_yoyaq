import { useRef, useState, useMemo, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Upload, X, Trash2, Wand2, FileText, BookOpen, Settings } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { generateSlugFromTitle } from '@/utils/toRomaji'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { useOrgScenariosForOptions } from '@/pages/ScenarioManagement/hooks/useOrgScenariosForOptions'
import { storeApi } from '@/lib/api'
import type { Store } from '@/types'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { useQueryClient } from '@tanstack/react-query'

// 統一スタイル（コンパクト）
const labelStyle = "text-xs font-medium mb-0.5 block"
const hintStyle = "text-[11px] text-muted-foreground mt-0.5"
const inputStyle = "h-7 text-xs"

interface BasicInfoSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
  scenarioId?: string | null
  onDelete?: () => void
}

export function BasicInfoSectionV2({ formData, setFormData, scenarioId, onDelete }: BasicInfoSectionV2Props) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [isAddAuthorDialogOpen, setIsAddAuthorDialogOpen] = useState(false)
  const [newAuthorName, setNewAuthorName] = useState('')
  const [editingOldAuthorName, setEditingOldAuthorName] = useState<string | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const queryClient = useQueryClient()
  
  useEffect(() => {
    const loadStores = async () => {
      try {
        const storesData = await storeApi.getAll()
        setStores(storesData)
      } catch (error) {
        logger.error('店舗データの取得エラー:', error)
      }
    }
    loadStores()
  }, [])
  
  const storeOptions = useMemo(() => {
    return stores.map(store => ({ id: store.id, name: store.name }))
  }, [stores])
  
  // organization_authors テーブルから作者情報を取得（sort_order 順）
  const { authors: orgAuthors } = useOrgScenariosForOptions()

  // 作者を organization_authors テーブルに自動登録
  const ensureAuthorInTable = async (name: string) => {
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return
      await supabase.from('organization_authors').upsert(
        { organization_id: orgId, name, sort_order: 9999 },
        { onConflict: 'organization_id,name' }
      )
      queryClient.invalidateQueries({ queryKey: ['org-authors'] })
    } catch {
      // テーブル登録失敗は致命的ではないので無視
    }
  }
  
  const authorEmailMap = useMemo(() => {
    // NOTE: author_email は scenarios テーブルにしかないため、ここでは空マップ
    // 将来 organization_scenarios に追加する場合はここを拡張
    return new Map<string, string>()
  }, [])
  
  const authorOptions = useMemo(() => {
    const authors = new Set<string>(orgAuthors)
    if (formData.author && !authors.has(formData.author)) {
      authors.add(formData.author)
    }
    return Array.from(authors).sort().map(author => ({ id: author, name: author }))
  }, [orgAuthors, formData.author])

  const handleAuthorChange = (authorName: string) => {
    setFormData(prev => {
      const existingEmail = authorEmailMap.get(authorName)
      return {
        ...prev,
        author: authorName,
        author_email: prev.author_email || existingEmail || ''
      }
    })
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // サイズ制限を緩和（20MBまで、大きな画像は自動圧縮される）
    const validation = validateImageFile(file, 20)
    if (!validation.valid) {
      showToast.error(validation.error || 'ファイルバリデーションエラー')
      return
    }

    setUploading(true)
    try {
      const result = await uploadImage(file, 'key-visuals')
      if (result) {
        setFormData(prev => ({ ...prev, key_visual_url: result.url }))
      } else {
        showToast.error('画像のアップロードに失敗しました')
      }
    } catch (error) {
      logger.error('画像アップロードエラー:', error)
      showToast.error('画像のアップロードに失敗しました')
    } finally {
      setUploading(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const handleImageRemove = () => {
    if (confirm('画像を削除しますか？')) {
      setFormData(prev => ({ ...prev, key_visual_url: '' }))
    }
  }

  const handleAddAuthor = async () => {
    if (!newAuthorName.trim()) {
      showToast.warning('作者名を入力してください')
      return
    }
    const trimmedName = newAuthorName.trim()

    // 編集・新規追加どちらも、現在のシナリオの作者名を変更するだけ
    // 保存時に organization_scenarios.override_author に保存される
    setFormData(prev => ({ ...prev, author: trimmedName }))

    if (editingOldAuthorName !== null && editingOldAuthorName !== trimmedName) {
      showToast.success(`作者名を「${trimmedName}」に変更しました（保存ボタンで反映）`)
    } else if (editingOldAuthorName === null) {
      // 新規追加時: テーブルにも自動登録
      await ensureAuthorInTable(trimmedName)
    }

    setNewAuthorName('')
    setEditingOldAuthorName(null)
    setIsAddAuthorDialogOpen(false)
  }

  return (
    <div className="space-y-3">

      {/* ── 基本情報 ── */}
      <div className="rounded-lg border bg-slate-50/70 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
          <FileText className="h-3.5 w-3.5" />基本情報
        </p>

        {/* 画像 + 管理作品 */}
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1">画像</span>
          <div className="flex items-start gap-4 flex-1">
            <div className="w-14 shrink-0">
              {formData.key_visual_url ? (
                <div className="relative group">
                  <OptimizedImage src={formData.key_visual_url} alt="Key Visual"
                    className="w-full aspect-[3/4] object-cover rounded border" />
                  <Button type="button" variant="destructive" size="icon"
                    className="absolute top-0 right-0 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleImageRemove}>
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </div>
              ) : (
                <div className="w-full aspect-[3/4] border-2 border-dashed rounded flex items-center justify-center bg-muted/30 hover:bg-muted/50 cursor-pointer"
                  onClick={() => imageInputRef.current?.click()}>
                  <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  <Upload className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch id="scenario_type" checked={formData.scenario_type === 'managed'}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, scenario_type: checked ? 'managed' : 'normal' }))}
                className="h-4 w-7" />
              <Label htmlFor="scenario_type" className="text-xs cursor-pointer">管理作品</Label>
              {formData.scenario_type === 'managed' && (
                <Badge className="bg-blue-100 text-blue-800 text-[10px] px-1 py-0">ライセンス管理</Badge>
              )}
            </div>
          </div>
        </div>

        {/* タイトル */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">タイトル *</span>
          <Input id="title" value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="シナリオ名称" className="h-7 text-xs flex-1" />
        </div>

        {/* Slug */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">Slug</span>
          <div className="flex gap-1 flex-1">
            <Input id="slug" value={formData.slug || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              placeholder="aiu-kairo" className="h-7 text-xs flex-1" />
            <Button type="button" variant="outline" size="sm" className="h-7 px-2"
              onClick={() => { if (formData.title) { setFormData(prev => ({ ...prev, slug: generateSlugFromTitle(formData.title) })); showToast.success('slug生成完了') } else showToast.error('タイトルを入力') }}
              title="タイトルから自動生成">
              <Wand2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* 作者 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">作者 *</span>
          <div className="flex-1">
            <MultiSelect options={authorOptions} selectedValues={formData.author ? [formData.author] : []}
              onSelectionChange={(values) => handleAuthorChange(values[0] || '')}
              placeholder="選択" showBadges={true} emptyText="見つかりません"
              emptyActionLabel="+ 追加"
              onEmptyAction={() => { setEditingOldAuthorName(null); setNewAuthorName(''); setIsAddAuthorDialogOpen(true) }}
              onEditOption={(value) => { setEditingOldAuthorName(value); setNewAuthorName(value); setIsAddAuthorDialogOpen(true) }}
              closeOnSelect={true} />
          </div>
        </div>

        {/* メール */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">
            メール
            {formData.author && authorEmailMap.has(formData.author) && <span className="text-green-600 ml-1">✓</span>}
          </span>
          <Input id="author_email" type="email" value={formData.author_email || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, author_email: e.target.value }))}
            placeholder="報告送信先" className="h-7 text-xs flex-1" />
        </div>
      </div>

      {/* ── 説明 ── */}
      <div className="rounded-lg border bg-slate-50/70 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
          <BookOpen className="h-3.5 w-3.5" />説明
        </p>

        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">あらすじ</span>
          <div className="flex-1">
            <Textarea id="description" value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3} placeholder="説明を入力（予約サイト表示用）" className="text-[11px]" />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">特記事項</span>
          <div className="flex-1">
            <Textarea id="caution" value={formData.caution || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, caution: e.target.value }))}
              rows={2} placeholder="例: ホラー表現あり / 暗い部屋での公演 / 激しい運動あり" className="text-[11px]" />
            <p className="text-[11px] text-muted-foreground mt-0.5">シナリオ詳細ページに表示</p>
          </div>
        </div>
      </div>

      {/* ── 設定 ── */}
      <div className="rounded-lg border bg-slate-50/70 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
          <Settings className="h-3.5 w-3.5" />設定
        </p>

        {/* キット数 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">キット数</span>
          <div className="w-20">
            <Select value={String(formData.kit_count || 1)} onValueChange={(value) => {
              const kitCount = parseInt(value)
              setFormData(prev => {
                let newCosts = [...prev.production_costs]
                const kitIndex = newCosts.findIndex(c => c.item === 'キット')
                if (kitCount === 0) {
                  newCosts = newCosts.filter(c => c.item !== 'キット')
                } else if (kitIndex >= 0) {
                  newCosts[kitIndex] = { ...newCosts[kitIndex], amount: kitCount * 30000 }
                } else {
                  newCosts = [{ item: 'キット', amount: kitCount * 30000 }, ...newCosts]
                }
                if (!newCosts.find(c => c.item === 'マニュアル')) newCosts.push({ item: 'マニュアル', amount: 10000 })
                if (!newCosts.find(c => c.item === 'スライド')) newCosts.push({ item: 'スライド', amount: 10000 })
                return { ...prev, kit_count: kitCount, production_costs: newCosts }
              })
            }}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0,1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 公演可能店舗 */}
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">公演可能店舗</span>
          <div className="flex-1">
            <StoreMultiSelect stores={stores} selectedStoreIds={formData.available_stores || []}
              onStoreIdsChange={(storeIds) => setFormData(prev => ({ ...prev, available_stores: storeIds }))}
              hideLabel={true} placeholder="全店舗で公演可能" />
          </div>
        </div>

        {/* 貸切受付時間枠（平日/土日祝） */}
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">貸切時間枠</span>
          <div className="flex-1 space-y-2">
            {([
              { label: '平日', field: 'private_booking_time_slots' as const },
              { label: '土日・祝日', field: 'private_booking_time_slots_weekend' as const },
            ] as const).map(({ label, field }) => {
              const slots: string[] = field === 'private_booking_time_slots'
                ? (formData.private_booking_time_slots || [])
                : (formData.private_booking_time_slots_weekend || [])
              const isEmpty = slots.length === 0
              return (
                <div key={field}>
                  <p className="text-[11px] text-slate-500 font-medium mb-1">{label}</p>
                  <div className="flex gap-2 flex-wrap">
                    {['朝公演', '昼公演', '夜公演'].map((slot) => {
                      const isSelected = slots.includes(slot)
                      return (
                        <button key={slot} type="button"
                          onClick={() => setFormData(prev => {
                            const current: string[] = field === 'private_booking_time_slots'
                              ? (prev.private_booking_time_slots || [])
                              : (prev.private_booking_time_slots_weekend || [])
                            const next = isSelected ? current.filter(s => s !== slot) : [...current, slot]
                            return { ...prev, [field]: next }
                          })}
                          className={`px-3 py-1 text-xs rounded-md border transition-colors ${isSelected ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}>
                          {slot}
                        </button>
                      )
                    })}
                    {field === 'private_booking_time_slots_weekend' && !isEmpty && (
                      <button type="button"
                        onClick={() => setFormData(prev => ({ ...prev, private_booking_time_slots_weekend: [] }))}
                        className="px-2 py-1 text-[11px] text-red-500 hover:text-red-700">
                        クリア（平日と同じにする）
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {field === 'private_booking_time_slots_weekend' && isEmpty
                      ? '未選択のため平日設定を流用'
                      : isEmpty ? '全枠受付' : ''}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* 貸切募集期間 */}
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">貸切募集期間</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Input type="date" value={formData.booking_start_date || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, booking_start_date: e.target.value || null }))}
                className="w-36 text-xs h-7" />
              <span className="text-xs text-muted-foreground">〜</span>
              <Input type="date" value={formData.booking_end_date || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, booking_end_date: e.target.value || null }))}
                className="w-36 text-xs h-7" />
              {(formData.booking_start_date || formData.booking_end_date) && (
                <button type="button"
                  onClick={() => setFormData(prev => ({ ...prev, booking_start_date: null, booking_end_date: null }))}
                  className="text-xs text-red-500 hover:text-red-700">クリア</button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">未設定で常時受付</p>
            {(formData.booking_start_date || formData.booking_end_date) && (() => {
              const now = new Date()
              const jstOffset = 9 * 60
              const jstNow = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60 * 1000)
              const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`
              const isOutOfPeriod = (formData.booking_start_date && todayStr < formData.booking_start_date) || (formData.booking_end_date && todayStr > formData.booking_end_date)
              return (
                <p className={`text-[11px] mt-0.5 ${isOutOfPeriod ? 'text-orange-600' : 'text-green-600'}`}>
                  {isOutOfPeriod ? '※ 現在は募集期間外です' : '※ 現在は募集期間中です'}
                </p>
              )
            })()}
          </div>
        </div>
      </div>

      {/* 作者追加・編集ダイアログ */}
      <Dialog open={isAddAuthorDialogOpen} onOpenChange={(open) => { if (!open) { setNewAuthorName(''); setEditingOldAuthorName(null) } setIsAddAuthorDialogOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOldAuthorName !== null ? '作者名を編集' : '新しい作者を追加'}</DialogTitle>
            <DialogDescription>
              {editingOldAuthorName !== null 
                ? '変更すると、この作者名を使用している全シナリオに反映されます' 
                : '新しい作者名を入力してください'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="newAuthorName">作者名</Label>
              <Input
                id="newAuthorName"
                value={newAuthorName}
                onChange={(e) => setNewAuthorName(e.target.value)}
                placeholder="例: 山田太郎"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddAuthor() }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewAuthorName(''); setEditingOldAuthorName(null); setIsAddAuthorDialogOpen(false) }}>
              キャンセル
            </Button>
            <Button onClick={handleAddAuthor}>
              {editingOldAuthorName !== null ? '変更' : '追加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除ボタン（既存シナリオの場合のみ表示） */}
      {scenarioId && onDelete && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-destructive">シナリオを削除</p>
              <p className="text-xs text-muted-foreground mt-0.5">この操作は取り消せません。関連する公演データは残ります。</p>
            </div>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />削除
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

