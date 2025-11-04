import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { statusOptions, genreOptions } from '@/components/modals/ScenarioEditModal/utils/constants'
import { useScenariosQuery } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'

interface GameInfoSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function GameInfoSection({ formData, setFormData }: GameInfoSectionProps) {
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  // 既存のシナリオからカテゴリリストを取得
  const { data: scenarios = [] } = useScenariosQuery()
  
  // 全シナリオから使用されているカテゴリを抽出
  const allUsedGenres = useMemo(() => {
    const genres = new Set<string>()
    scenarios.forEach(scenario => {
      if (scenario.genre && Array.isArray(scenario.genre)) {
        scenario.genre.forEach(genre => {
          if (genre) genres.add(genre)
        })
      }
    })
    // 現在選択されているカテゴリも含める
    if (formData.genre && Array.isArray(formData.genre)) {
      formData.genre.forEach(genre => {
        if (genre) genres.add(genre)
      })
    }
    return Array.from(genres).sort()
  }, [scenarios, formData.genre])

  // 固定のgenreOptionsと、実際に使用されているカテゴリをマージ
  const allGenreOptions = useMemo(() => {
    const genreMap = new Map<string, { id: string, name: string }>()
    
    // 固定のgenreOptionsを追加
    genreOptions.forEach(opt => {
      genreMap.set(opt.name, opt)
    })
    
    // 実際に使用されているカテゴリを追加（固定リストにないもの）
    allUsedGenres.forEach(genre => {
      if (!genreMap.has(genre)) {
        genreMap.set(genre, { id: genre, name: genre })
      }
    })
    
    return Array.from(genreMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }, [allUsedGenres])

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      alert('カテゴリ名を入力してください')
      return
    }

    // 既に選択されているカテゴリに追加
    const currentGenres = formData.genre || []
    if (!currentGenres.includes(newCategoryName.trim())) {
      setFormData(prev => ({
        ...prev,
        genre: [...currentGenres, newCategoryName.trim()]
      }))
    }

    setNewCategoryName('')
    setIsAddCategoryDialogOpen(false)
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 pb-2 border-b">ゲーム情報</h3>
      <div className="space-y-6">
          {/* プレイ情報 */}
          <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="duration">所要時間（分）</Label>
              <Input
                id="duration"
                type="number"
                min="30"
                max="480"
                value={formData.duration}
                onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 120 }))}
              />
            </div>
            <div>
              <Label htmlFor="player_count_min">最小人数</Label>
              <Input
                id="player_count_min"
                type="number"
                min="1"
                max="20"
                value={formData.player_count_min}
                onChange={(e) => setFormData(prev => ({ ...prev, player_count_min: parseInt(e.target.value) || 4 }))}
              />
            </div>
            <div>
              <Label htmlFor="player_count_max">最大人数</Label>
              <Input
                id="player_count_max"
                type="number"
                min="1"
                max="20"
                value={formData.player_count_max}
                onChange={(e) => setFormData(prev => ({ ...prev, player_count_max: parseInt(e.target.value) || 8 }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="difficulty">難易度（1-5）</Label>
              <Input
                id="difficulty"
                type="number"
                min="1"
                max="5"
                value={formData.difficulty}
                onChange={(e) => setFormData(prev => ({ ...prev, difficulty: parseInt(e.target.value) || 3 }))}
              />
              <p className="text-sm text-muted-foreground mt-1">
                1: 初心者向け / 5: 上級者向け
              </p>
            </div>
            <div>
              <Label htmlFor="rating">評価（1-5）</Label>
              <Input
                id="rating"
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={formData.rating || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, rating: e.target.value ? parseFloat(e.target.value) : undefined }))}
                placeholder="評価なし"
              />
            </div>
          </div>
          </div>

          {/* カテゴリ・ステータス */}
          <div className="space-y-4 pt-4 border-t">
          <div>
            <Label htmlFor="genre">カテゴリ</Label>
            <MultiSelect
              options={allGenreOptions}
              selectedValues={formData.genre || []}
              onSelectionChange={(values) => setFormData(prev => ({ ...prev, genre: values }))}
              placeholder="カテゴリを選択"
              showBadges={true}
              emptyText="カテゴリが見つかりません"
              emptyActionLabel="+ カテゴリを追加"
              onEmptyAction={() => setIsAddCategoryDialogOpen(true)}
            />
          </div>

          <div>
            <Label htmlFor="status">ステータス</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as any }))}
            >
              <SelectTrigger>
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

          <div className="flex items-center space-x-2">
            <Checkbox
              id="has_pre_reading"
              checked={formData.has_pre_reading}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, has_pre_reading: checked === true }))}
            />
            <Label htmlFor="has_pre_reading" className="text-sm font-normal cursor-pointer">
              事前読み込みあり
            </Label>
          </div>
          </div>
      </div>

      {/* カテゴリ追加ダイアログ */}
      <Dialog open={isAddCategoryDialogOpen} onOpenChange={setIsAddCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しいカテゴリを追加</DialogTitle>
            <DialogDescription>
              新しいカテゴリ名を入力してください
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddCategory()
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNewCategoryName('')
              setIsAddCategoryDialogOpen(false)
            }}>
              キャンセル
            </Button>
            <Button onClick={handleAddCategory}>
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

