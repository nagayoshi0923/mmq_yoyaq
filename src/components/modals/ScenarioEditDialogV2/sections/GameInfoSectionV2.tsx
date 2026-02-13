import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

import { Checkbox } from '@/components/ui/checkbox'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { statusOptions, genreOptions } from '@/components/modals/ScenarioEditModal/utils/constants'
import { useScenariosQuery, scenarioKeys } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { useQueryClient } from '@tanstack/react-query'
import { showToast } from '@/utils/toast'
import { parseIntSafe } from '@/utils/number'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface GameInfoSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

// 統一スタイル
const labelStyle = "text-xs font-medium mb-0.5 block"
const hintStyle = "text-[11px] text-muted-foreground mt-0.5"
const inputStyle = "h-7 text-xs"

export function GameInfoSectionV2({ formData, setFormData }: GameInfoSectionV2Props) {
  const queryClient = useQueryClient()
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingOldCategoryName, setEditingOldCategoryName] = useState<string | null>(null) // nullなら新規追加モード
  const [isSavingCategory, setIsSavingCategory] = useState(false)

  const { data: scenarios = [] } = useScenariosQuery()
  
  const allUsedGenres = useMemo(() => {
    const genres = new Set<string>()
    scenarios.forEach(scenario => {
      if (scenario.genre && Array.isArray(scenario.genre)) {
        scenario.genre.forEach(genre => { if (genre) genres.add(genre) })
      }
    })
    if (formData.genre && Array.isArray(formData.genre)) {
      formData.genre.forEach(genre => { if (genre) genres.add(genre) })
    }
    return Array.from(genres).sort()
  }, [scenarios, formData.genre])

  const allGenreOptions = useMemo(() => {
    const genreMap = new Map<string, { id: string, name: string }>()
    genreOptions.forEach(opt => genreMap.set(opt.name, opt))
    allUsedGenres.forEach(genre => {
      if (!genreMap.has(genre)) genreMap.set(genre, { id: genre, name: genre })
    })
    return Array.from(genreMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }, [allUsedGenres])

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      showToast.warning('カテゴリ名を入力してください')
      return
    }
    const trimmedName = newCategoryName.trim()
    const currentGenres = formData.genre || []

    if (editingOldCategoryName !== null && editingOldCategoryName !== trimmedName) {
      // 編集モード: 全シナリオのカテゴリ名を一括変更
      setIsSavingCategory(true)
      try {
        // 1. scenarios テーブル: 旧名を含むレコードを取得して更新
        const { data: scenariosWithGenre } = await supabase
          .from('scenarios')
          .select('id, genre')
          .contains('genre', [editingOldCategoryName])
        
        if (scenariosWithGenre && scenariosWithGenre.length > 0) {
          for (const s of scenariosWithGenre) {
            const updatedGenre = (s.genre || []).map((g: string) => g === editingOldCategoryName ? trimmedName : g)
            await supabase.from('scenarios').update({ genre: updatedGenre }).eq('id', s.id)
          }
          logger.log(`scenarios: ${scenariosWithGenre.length}件のカテゴリ名を更新`)
        }

        // 2. scenario_masters テーブル: 同様に更新
        const { data: mastersWithGenre } = await supabase
          .from('scenario_masters')
          .select('id, genre')
          .contains('genre', [editingOldCategoryName])
        
        if (mastersWithGenre && mastersWithGenre.length > 0) {
          for (const m of mastersWithGenre) {
            const updatedGenre = (m.genre || []).map((g: string) => g === editingOldCategoryName ? trimmedName : g)
            await supabase.from('scenario_masters').update({ genre: updatedGenre }).eq('id', m.id)
          }
          logger.log(`scenario_masters: ${mastersWithGenre.length}件のカテゴリ名を更新`)
        }

        // 3. 現在のフォームデータも更新
        setFormData(prev => ({
          ...prev,
          genre: (prev.genre || []).map(g => g === editingOldCategoryName ? trimmedName : g)
        }))

        // キャッシュを無効化して一覧を最新に
        queryClient.invalidateQueries({ queryKey: scenarioKeys.all })
        // OrganizationScenarioList も再取得
        window.dispatchEvent(new CustomEvent('scenario-data-updated'))

        showToast.success(`カテゴリ名を「${editingOldCategoryName}」→「${trimmedName}」に変更しました`)
      } catch (err) {
        logger.error('カテゴリ名の一括更新エラー:', err)
        showToast.error('カテゴリ名の更新に失敗しました')
      } finally {
        setIsSavingCategory(false)
      }
    } else if (editingOldCategoryName === null) {
      // 新規追加モード
      if (!currentGenres.includes(trimmedName)) {
        setFormData(prev => ({ ...prev, genre: [...currentGenres, trimmedName] }))
      }
    }
    setNewCategoryName('')
    setEditingOldCategoryName(null)
    setIsAddCategoryDialogOpen(false)
  }

  return (
    <div className="space-y-4">
      {/* プレイ情報 */}
      <Card>
        <CardContent className="p-2">
          <div className="grid grid-cols-2 gap-5">
            {/* 所要時間 */}
            <div>
              <Label className={labelStyle}>所要時間（平日）</Label>
              <p className={hintStyle}>公演の目安時間。スケジュール枠の計算に使用されます</p>
              <div className="relative mt-1.5">
                <Input
                  id="duration"
                  type="text"
                  inputMode="numeric"
                  value={formData.duration === 0 ? '' : String(formData.duration ?? '')}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '')
                    setFormData(prev => ({ ...prev, duration: val === '' ? 0 : parseInt(val, 10) }))
                  }}
                  className={`${inputStyle} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">分</span>
              </div>
            </div>

            {/* 土日公演時間 */}
            <div>
              <Label className={labelStyle}>土日公演時間</Label>
              <p className={hintStyle}>土日・祝日に公演時間が変わる場合のみ設定</p>
              <div className="relative mt-1.5">
                <Input
                  id="weekend_duration"
                  type="number"
                  min="30"
                  max="480"
                  value={formData.weekend_duration ?? ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, weekend_duration: e.target.value ? parseInt(e.target.value) : null }))}
                  placeholder="未設定"
                  className={`${inputStyle} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">分</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* 追加準備時間 */}
            <div>
              <Label className={labelStyle}>追加準備時間</Label>
              <p className={hintStyle}>通常60分に加算。90分準備が必要な場合は30を入力</p>
              <div className="relative mt-1.5">
                <Input
                  id="extra_preparation_time"
                  type="text"
                  inputMode="numeric"
                  value={formData.extra_preparation_time ? String(formData.extra_preparation_time) : ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '')
                    const num = val === '' ? undefined : parseInt(val, 10)
                    setFormData(prev => ({ ...prev, extra_preparation_time: num || undefined }))
                  }}
                  className={`${inputStyle} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">分</span>
              </div>
            </div>

            {/* 人数 */}
            <div>
              <Label className={labelStyle}>プレイ人数</Label>
              <p className={hintStyle}>予約受付可能な参加人数。この範囲外は予約不可になります</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Input
                  id="player_count_min"
                  type="number"
                  min="1"
                  max="20"
                  value={formData.player_count_min}
                  onChange={(e) => setFormData(prev => ({ ...prev, player_count_min: parseIntSafe(e.target.value, 4) }))}
                  className={inputStyle}
                />
                <span className="text-muted-foreground shrink-0">〜</span>
                <Input
                  id="player_count_max"
                  type="number"
                  min="1"
                  max="20"
                  value={formData.player_count_max}
                  onChange={(e) => setFormData(prev => ({ ...prev, player_count_max: parseIntSafe(e.target.value, 8) }))}
                  className={inputStyle}
                />
                <span className="text-sm text-muted-foreground shrink-0">人</span>
              </div>
            </div>

            {/* 難易度 */}
            <div>
              <Label className={labelStyle}>難易度</Label>
              <p className={hintStyle}>お客様向けの難易度表示。予約サイトで参考情報として表示されます</p>
              <Select
                value={String(formData.difficulty)}
                onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: parseInt(value) || 3 }))}
              >
                <SelectTrigger className={`${inputStyle} mt-1.5`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">★☆☆☆☆ 初心者向け</SelectItem>
                  <SelectItem value="2">★★☆☆☆ 易しい</SelectItem>
                  <SelectItem value="3">★★★☆☆ 普通</SelectItem>
                  <SelectItem value="4">★★★★☆ 難しい</SelectItem>
                  <SelectItem value="5">★★★★★ 上級者向け</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 評価 */}
            <div>
              <Label className={labelStyle}>評価</Label>
              <p className={hintStyle}>運営側の内部評価。シナリオの優先度判断などに使用します</p>
              <Input
                id="rating"
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={formData.rating || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, rating: e.target.value ? parseFloat(e.target.value) : undefined }))}
                placeholder="未評価"
                className={`${inputStyle} mt-1.5`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* カテゴリ・ステータス */}
      <Card>
        <CardContent className="p-2">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <Label className={labelStyle}>カテゴリ</Label>
              <p className={hintStyle}>シナリオの分類タグ。検索・フィルター機能で使用されます</p>
              <MultiSelect
                options={allGenreOptions}
                selectedValues={formData.genre || []}
                onSelectionChange={(values) => setFormData(prev => ({ ...prev, genre: values }))}
                placeholder="カテゴリを選択"
                showBadges={true}
                emptyText="カテゴリが見つかりません"
                emptyActionLabel="+ カテゴリを追加"
                onEmptyAction={() => { setEditingOldCategoryName(null); setNewCategoryName(''); setIsAddCategoryDialogOpen(true) }}
                onEditOption={(value) => {
                  setEditingOldCategoryName(value)
                  setNewCategoryName(value)
                  setIsAddCategoryDialogOpen(true)
                }}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label className={labelStyle}>ステータス</Label>
              <p className={hintStyle}>「準備中」は予約不可、「公開中」は予約可、「引退」は非表示</p>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as 'draft' | 'active' | 'retired' }))}
              >
                <SelectTrigger className={`${inputStyle} mt-1.5`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 事前読み込み */}
          <div className="flex items-start gap-2 mt-5 pt-4 border-t">
            <Checkbox
              id="has_pre_reading"
              checked={formData.has_pre_reading}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, has_pre_reading: checked === true }))}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="has_pre_reading" className="text-sm cursor-pointer">
                事前読み込みあり
              </Label>
              <p className={hintStyle}>ONにすると予約時に「事前に資料を読む必要があります」と表示されます</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* カテゴリ追加・編集ダイアログ */}
      <Dialog open={isAddCategoryDialogOpen} onOpenChange={(open) => { if (!open) { setNewCategoryName(''); setEditingOldCategoryName(null) }; setIsAddCategoryDialogOpen(open) }}>
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
                onKeyDown={(e) => { if (e.key === 'Enter' && !isSavingCategory) handleAddCategory() }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isSavingCategory} onClick={() => { setNewCategoryName(''); setEditingOldCategoryName(null); setIsAddCategoryDialogOpen(false) }}>
              キャンセル
            </Button>
            <Button onClick={handleAddCategory} disabled={isSavingCategory}>
              {isSavingCategory ? '更新中...' : (editingOldCategoryName !== null ? '変更' : '追加')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

