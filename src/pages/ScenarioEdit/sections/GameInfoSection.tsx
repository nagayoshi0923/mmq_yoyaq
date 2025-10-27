import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Checkbox } from '@/components/ui/checkbox'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { statusOptions, genreOptions } from '@/components/modals/ScenarioEditModal/utils/constants'

interface GameInfoSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function GameInfoSection({ formData, setFormData }: GameInfoSectionProps) {
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
            <Label htmlFor="genre">ジャンル</Label>
            <MultiSelect
              options={genreOptions.map(g => ({ value: g.value, label: g.label }))}
              selected={formData.genre}
              onChange={(values) => setFormData(prev => ({ ...prev, genre: values }))}
              placeholder="ジャンルを選択"
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
    </div>
  )
}

