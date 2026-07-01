import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Trash2, Gamepad2, Tag } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditDialogV2/types'
import { statusOptions } from '@/components/modals/ScenarioEditDialogV2/utils/constants'
import { useOrgScenariosForOptions } from '@/pages/ScenarioManagement/hooks/useOrgScenariosForOptions'
import { showToast } from '@/utils/toast'
import { parseIntSafe } from '@/utils/number'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { useQueryClient } from '@tanstack/react-query'

interface GameInfoSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

// 統一スタイル
const labelStyle = "text-xs font-medium mb-0.5 block"
const hintStyle = "text-[11px] text-muted-foreground mt-0.5"
const inputStyle = "h-7 text-xs"

export function GameInfoSectionV2({ formData, setFormData }: GameInfoSectionV2Props) {
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingOldCategoryName, setEditingOldCategoryName] = useState<string | null>(null) // nullなら新規追加モード
  const queryClient = useQueryClient()

  // organization_categories テーブルからカテゴリ情報を取得（sort_order 順）
  const { genres: orgGenres } = useOrgScenariosForOptions()
  
  // テーブルのカテゴリ + 現在のフォームデータ内のカテゴリをマージ
  const allGenreOptions = useMemo(() => {
    const genreMap = new Map<string, { id: string, name: string }>()
    // テーブルから取得したカテゴリ（sort_order 順）
    orgGenres.forEach(genre => {
      genreMap.set(genre, { id: genre, name: genre })
    })
    // フォームデータ内のカテゴリも追加（テーブルに未登録のものがあれば）
    if (formData.genre && Array.isArray(formData.genre)) {
      formData.genre.forEach(genre => {
        if (genre && !genreMap.has(genre)) {
          genreMap.set(genre, { id: genre, name: genre })
        }
      })
    }
    return Array.from(genreMap.values())
  }, [orgGenres, formData.genre])

  // カテゴリを organization_categories テーブルに自動登録
  const ensureCategoryInTable = async (name: string) => {
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return
      // ON CONFLICT で重複は無視
      await supabase.from('organization_categories').upsert(
        { organization_id: orgId, name, sort_order: 9999 },
        { onConflict: 'organization_id,name' }
      )
      // キャッシュ更新
      queryClient.invalidateQueries({ queryKey: ['org-categories'] })
    } catch {
      // テーブル登録失敗は致命的ではないので無視
    }
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      showToast.warning('カテゴリ名を入力してください')
      return
    }
    const trimmedName = newCategoryName.trim()
    const currentGenres = formData.genre || []

    if (editingOldCategoryName !== null && editingOldCategoryName !== trimmedName) {
      // 編集モード: 現在のシナリオのカテゴリ名を置換するだけ
      // 保存時に organization_scenarios.override_genre に保存される
      setFormData(prev => ({
        ...prev,
        genre: (prev.genre || []).map(g => g === editingOldCategoryName ? trimmedName : g)
      }))
      showToast.success(`カテゴリ名を「${trimmedName}」に変更しました（保存ボタンで反映）`)
    } else if (editingOldCategoryName === null) {
      // 新規追加モード
      if (!currentGenres.includes(trimmedName)) {
        setFormData(prev => ({ ...prev, genre: [...currentGenres, trimmedName] }))
      }
      // テーブルにも自動登録
      await ensureCategoryInTable(trimmedName)
    }
    setNewCategoryName('')
    setEditingOldCategoryName(null)
    setIsAddCategoryDialogOpen(false)
  }

  const handleDeleteCategory = () => {
    if (!editingOldCategoryName) return
    // eslint-disable-next-line no-alert
    if (!window.confirm(`カテゴリ「${editingOldCategoryName}」をこのシナリオから削除しますか？`)) return

    setFormData(prev => ({
      ...prev,
      genre: (prev.genre || []).filter(g => g !== editingOldCategoryName)
    }))
    showToast.success(`カテゴリ「${editingOldCategoryName}」を削除しました（保存ボタンで反映）`)
    setNewCategoryName('')
    setEditingOldCategoryName(null)
    setIsAddCategoryDialogOpen(false)
  }

  return (
    <div className="space-y-3">
      {/* ── プレイ情報 ── */}
      <div className="rounded-lg border bg-slate-50/70 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
          <Gamepad2 className="h-3.5 w-3.5" />プレイ情報
        </p>

        {/* 所要時間 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[80px] shrink-0 text-right">所要時間</span>
          <div className="flex items-center gap-2 flex-1">
            <div className="relative w-24">
              <Input id="duration" type="text" inputMode="numeric"
                value={formData.duration === 0 ? '' : String(formData.duration ?? '')}
                onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setFormData(prev => ({ ...prev, duration: val === '' ? 0 : parseInt(val, 10) })) }}
                className="h-7 text-xs pr-7" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">分</span>
            </div>
            <span className="text-xs text-muted-foreground">平日</span>
            <div className="relative w-24">
              <Input id="weekend_duration" type="number" min="30" max="480"
                value={formData.weekend_duration ?? ''}
                onChange={(e) => setFormData(prev => ({ ...prev, weekend_duration: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="同じ" className="h-7 text-xs pr-7" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">分</span>
            </div>
            <span className="text-xs text-muted-foreground">土日祝</span>
          </div>
        </div>

        {/* 追加準備時間 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[80px] shrink-0 text-right">追加準備</span>
          <div className="relative w-24">
            <Input id="extra_preparation_time" type="text" inputMode="numeric"
              value={formData.extra_preparation_time ? String(formData.extra_preparation_time) : ''}
              onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setFormData(prev => ({ ...prev, extra_preparation_time: val === '' ? undefined : parseInt(val, 10) || undefined })) }}
              className="h-7 text-xs pr-7" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">分</span>
          </div>
          <span className="text-[11px] text-muted-foreground">通常60分に加算</span>
        </div>

        {/* プレイ人数 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[80px] shrink-0 text-right">プレイ人数</span>
          <div className="flex items-center gap-2">
            <Input id="player_count_min" type="number" min="1" max="20" value={formData.player_count_min}
              onChange={(e) => setFormData(prev => ({ ...prev, player_count_min: parseIntSafe(e.target.value, 4) }))}
              className="h-7 text-xs w-14" />
            <span className="text-xs text-muted-foreground">〜</span>
            <Input id="player_count_max" type="number" min="1" max="20" value={formData.player_count_max}
              onChange={(e) => setFormData(prev => ({ ...prev, player_count_max: parseIntSafe(e.target.value, 8) }))}
              className="h-7 text-xs w-14" />
            <span className="text-xs text-muted-foreground">人</span>
          </div>
        </div>

        {/* 男女比 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[80px] shrink-0 text-right">男女比</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">男</span>
            <Input id="male_count" type="number" min="0" max="20" value={formData.male_count ?? ''}
              onChange={(e) => setFormData(prev => ({ ...prev, male_count: e.target.value === '' ? null : parseIntSafe(e.target.value, 0) }))}
              placeholder="-" className="h-7 text-xs w-12" />
            <span className="text-xs text-muted-foreground">女</span>
            <Input id="female_count" type="number" min="0" max="20" value={formData.female_count ?? ''}
              onChange={(e) => setFormData(prev => ({ ...prev, female_count: e.target.value === '' ? null : parseIntSafe(e.target.value, 0) }))}
              placeholder="-" className="h-7 text-xs w-12" />
            <span className="text-xs text-muted-foreground">他</span>
            <Input id="other_count" type="number" min="0" max="20" value={formData.other_count ?? ''}
              onChange={(e) => setFormData(prev => ({ ...prev, other_count: e.target.value === '' ? null : parseIntSafe(e.target.value, 0) }))}
              placeholder="-" className="h-7 text-xs w-12" />
          </div>
        </div>

        {/* 難易度 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[80px] shrink-0 text-right">難易度</span>
          <div className="w-48">
            <Select value={String(formData.difficulty)} onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: parseInt(value) || 3 }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">★☆☆☆☆ 初心者向け</SelectItem>
                <SelectItem value="2">★★☆☆☆ 易しい</SelectItem>
                <SelectItem value="3">★★★☆☆ 普通</SelectItem>
                <SelectItem value="4">★★★★☆ 難しい</SelectItem>
                <SelectItem value="5">★★★★★ 上級者向け</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 評価 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[80px] shrink-0 text-right">評価</span>
          <Input id="rating" type="number" min="1" max="5" step="0.1"
            value={formData.rating || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, rating: e.target.value ? parseFloat(e.target.value) : undefined }))}
            placeholder="未評価" className="h-7 text-xs w-20" />
          <span className="text-[11px] text-muted-foreground">内部評価（1〜5）</span>
        </div>
      </div>

      {/* ── カテゴリ・ステータス ── */}
      <div className="rounded-lg border bg-slate-50/70 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
          <Tag className="h-3.5 w-3.5" />カテゴリ・ステータス
        </p>

        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-[80px] shrink-0 text-right pt-1.5">カテゴリ</span>
          <div className="flex-1">
            <MultiSelect options={allGenreOptions} selectedValues={formData.genre || []}
              onSelectionChange={(values) => setFormData(prev => ({ ...prev, genre: values }))}
              placeholder="カテゴリを選択" showBadges={true} emptyText="カテゴリが見つかりません"
              emptyActionLabel="+ カテゴリを追加"
              onEmptyAction={() => { setEditingOldCategoryName(null); setNewCategoryName(''); setIsAddCategoryDialogOpen(true) }}
              onEditOption={(value) => { setEditingOldCategoryName(value); setNewCategoryName(value); setIsAddCategoryDialogOpen(true) }} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-[80px] shrink-0 text-right">ステータス</span>
          <div className="w-40">
            <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as 'draft' | 'active' | 'retired' }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* カテゴリ追加・編集ダイアログ */}
      <Dialog open={isAddCategoryDialogOpen} onOpenChange={(open) => { if (!open) { setNewCategoryName(''); setEditingOldCategoryName(null) } setIsAddCategoryDialogOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOldCategoryName !== null ? 'カテゴリ名を編集' : '新しいカテゴリを追加'}</DialogTitle>
            <DialogDescription>
              {editingOldCategoryName !== null 
                ? '変更すると、このカテゴリを使用している全シナリオに反映されます' 
                : '新しいカテゴリ名を入力してください'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="newCategoryName">カテゴリ名</Label>
              <Input
                id="newCategoryName"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="例: アドベンチャー"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory() }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <div>
              {editingOldCategoryName !== null && (
                <Button variant="destructive" size="sm" onClick={handleDeleteCategory}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  削除
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setNewCategoryName(''); setEditingOldCategoryName(null); setIsAddCategoryDialogOpen(false) }}>
                キャンセル
              </Button>
              <Button onClick={handleAddCategory}>
                {editingOldCategoryName !== null ? '変更' : '追加'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

