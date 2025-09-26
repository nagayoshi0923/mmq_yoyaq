import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Badge } from '@/components/ui/badge'
import type { Scenario, FlexiblePricing, PricingModifier, GMConfiguration } from '@/types'

interface ScenarioEditModalProps {
  scenario: Scenario | null
  isOpen: boolean
  onClose: () => void
  onSave: (scenario: Scenario) => void
}

interface ScenarioFormData {
  title: string
  author: string
  description: string
  duration: number // 分単位
  player_count_min: number
  player_count_max: number
  difficulty: number
  rating?: number
  status: string
  participation_fee: number
  production_costs: { item: string; amount: number }[]
  genre: string[]
  required_props: { item: string; amount: number; frequency: 'recurring' | 'one-time' }[]
  has_pre_reading: boolean
  // 時間帯別料金設定
  gm_costs: { time_slot: string; amount: number; role: 'main' | 'sub' }[]
  license_costs: { time_slot: string; amount: number; type: 'percentage' | 'fixed' }[]
  participation_costs: { time_slot: string; amount: number; type: 'percentage' | 'fixed' }[]
  // 柔軟な料金設定
  use_flexible_pricing: boolean
  flexible_pricing: FlexiblePricing
}

const statusOptions = [
  { value: 'available', label: '利用可能' },
  { value: 'maintenance', label: 'メンテナンス中' },
  { value: 'retired', label: '引退済み' }
]

const genreOptions = [
  'ホラー',
  'ミステリー',
  'クラシック',
  'コメディ',
  'SF',
  'ファンタジー',
  'サスペンス',
  'アクション',
  'ドラマ',
  'ロマンス'
].map(genre => ({ id: genre, name: genre }))

export function ScenarioEditModal({ scenario, isOpen, onClose, onSave }: ScenarioEditModalProps) {
  const [formData, setFormData] = useState<ScenarioFormData>({
    title: '',
    author: '',
    description: '',
    duration: 120,
    player_count_min: 4,
    player_count_max: 8,
    difficulty: 3,
    rating: undefined,
    status: 'available',
    participation_fee: 3000,
    production_costs: [],
    genre: [],
    required_props: [],
    has_pre_reading: false,
    // 項目別料金設定
    gm_costs: [{ time_slot: '通常', amount: 2000, role: 'main' }],
    license_costs: [{ time_slot: '通常', amount: 0, type: 'fixed' }],
    participation_costs: [{ time_slot: '通常', amount: 3000, type: 'fixed' }],
    use_flexible_pricing: false,
    flexible_pricing: {
      base_pricing: {
        license_amount: 0,
        participation_fee: 3000
      },
      pricing_modifiers: [],
      gm_configuration: {
        required_count: 1,
        optional_count: 0,
        total_max: 2,
        special_requirements: ''
      }
    }
  })

  const [newProductionItem, setNewProductionItem] = useState('')
  const [newProductionAmount, setNewProductionAmount] = useState(0)
  const [newRequiredPropItem, setNewRequiredPropItem] = useState('')
  const [newRequiredPropAmount, setNewRequiredPropAmount] = useState(0)
  const [newRequiredPropFrequency, setNewRequiredPropFrequency] = useState<'recurring' | 'one-time'>('recurring')
  
  // GM報酬項目別入力用
  const [newGmCostTimeSlot, setNewGmCostTimeSlot] = useState<string>('通常')
  const [newGmCostAmount, setNewGmCostAmount] = useState(0)
  const [newGmCostRole, setNewGmCostRole] = useState<'main' | 'sub'>('main')
  
  // ライセンス代項目別入力用
  const [newLicenseCostTimeSlot, setNewLicenseCostTimeSlot] = useState<string>('通常')
  const [newLicenseCostAmount, setNewLicenseCostAmount] = useState(0)
  const [newLicenseCostType, setNewLicenseCostType] = useState<'percentage' | 'fixed'>('fixed')
  
  // 参加費項目別入力用
  const [newParticipationCostTimeSlot, setNewParticipationCostTimeSlot] = useState<string>('通常')
  const [newParticipationCostAmount, setNewParticipationCostAmount] = useState(0)
  const [newParticipationCostType, setNewParticipationCostType] = useState<'percentage' | 'fixed'>('fixed')
  

  const addProductionCost = () => {
    if (newProductionItem.trim() && newProductionAmount > 0) {
      setFormData(prev => ({
        ...prev,
        production_costs: [...prev.production_costs, { item: newProductionItem.trim(), amount: newProductionAmount }]
      }))
      setNewProductionItem('')
      setNewProductionAmount(0)
    }
  }

  const removeProductionCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      production_costs: prev.production_costs.filter((_, i) => i !== index)
    }))
  }

  const addRequiredProp = () => {
    if (newRequiredPropItem.trim() && newRequiredPropAmount > 0) {
      setFormData(prev => ({
        ...prev,
        required_props: [...prev.required_props, { 
          item: newRequiredPropItem.trim(), 
          amount: newRequiredPropAmount,
          frequency: newRequiredPropFrequency
        }]
      }))
      setNewRequiredPropItem('')
      setNewRequiredPropAmount(0)
      setNewRequiredPropFrequency('recurring')
    }
  }

  const removeRequiredProp = (index: number) => {
    setFormData(prev => ({
      ...prev,
      required_props: prev.required_props.filter((_, i) => i !== index)
    }))
  }

  // GM報酬項目別管理
  const addGmCost = () => {
    if (newGmCostAmount > 0) {
      setFormData(prev => ({
        ...prev,
        gm_costs: [...prev.gm_costs, { 
          time_slot: newGmCostTimeSlot, 
          amount: newGmCostAmount,
          role: newGmCostRole
        }]
      }))
      setNewGmCostTimeSlot('通常')
      setNewGmCostAmount(0)
      setNewGmCostRole('main')
    }
  }

  const removeGmCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      gm_costs: prev.gm_costs.filter((_, i) => i !== index)
    }))
  }

  // ライセンス代項目別管理
  const addLicenseCost = () => {
    if (newLicenseCostAmount > 0) {
      setFormData(prev => ({
        ...prev,
        license_costs: [...prev.license_costs, { 
          time_slot: newLicenseCostTimeSlot, 
          amount: newLicenseCostAmount,
          type: newLicenseCostType
        }]
      }))
      setNewLicenseCostTimeSlot('通常')
      setNewLicenseCostAmount(0)
      setNewLicenseCostType('fixed')
    }
  }

  const removeLicenseCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      license_costs: prev.license_costs.filter((_, i) => i !== index)
    }))
  }

  // 参加費項目別管理
  const addParticipationCost = () => {
    if (newParticipationCostAmount > 0) {
      setFormData(prev => ({
        ...prev,
        participation_costs: [...prev.participation_costs, { 
          time_slot: newParticipationCostTimeSlot, 
          amount: newParticipationCostAmount,
          type: newParticipationCostType
        }]
      }))
      setNewParticipationCostTimeSlot('通常')
      setNewParticipationCostAmount(0)
      setNewParticipationCostType('fixed')
    }
  }

  const removeParticipationCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      participation_costs: prev.participation_costs.filter((_, i) => i !== index)
    }))
  }

  useEffect(() => {
    if (scenario) {
      setFormData({
        title: scenario.title || '',
        author: scenario.author || '',
        description: scenario.description || '',
        duration: scenario.duration || 120,
        player_count_min: scenario.player_count_min || 4,
        player_count_max: scenario.player_count_max || 8,
        difficulty: scenario.difficulty || 3,
        rating: scenario.rating,
        status: scenario.status || 'available',
        participation_fee: scenario.participation_fee || 3000,
        production_costs: scenario.production_costs || (scenario.production_cost > 0 ? [{ item: '制作費', amount: scenario.production_cost }] : []),
        genre: scenario.genre || [],
        required_props: Array.isArray(scenario.required_props) && scenario.required_props.length > 0 && typeof scenario.required_props[0] === 'object' 
          ? (scenario.required_props as any[]).map(prop => ({
              item: prop.item || prop,
              amount: prop.amount || 0,
              frequency: prop.frequency || 'recurring'
            }))
          : (scenario.required_props as string[] || []).map(prop => ({ 
              item: prop, 
              amount: 0, 
              frequency: 'recurring' as const 
            })),
        has_pre_reading: scenario.has_pre_reading || false,
        // 項目別料金設定の初期化
        gm_costs: scenario.gm_costs || [{ time_slot: '通常', amount: 2000, role: 'main' as const }],
        license_costs: scenario.license_costs || [{ time_slot: '通常', amount: 0, type: 'fixed' as const }],
        participation_costs: scenario.participation_costs || (scenario.participation_fee > 0 ? [{ time_slot: '通常', amount: scenario.participation_fee, type: 'fixed' as const }] : []),
        use_flexible_pricing: !!scenario.flexible_pricing,
        flexible_pricing: scenario.flexible_pricing || {
          base_pricing: {
            license_amount: 0,
            participation_fee: scenario.participation_fee || 3000
          },
          pricing_modifiers: [],
          gm_configuration: {
            required_count: 1,
            optional_count: 0,
            total_max: 2,
            special_requirements: ''
          }
        }
      })
    } else {
      // 新規作成時のデフォルト値
      setFormData({
        title: '',
        author: '',
        description: '',
        duration: 120,
        player_count_min: 4,
        player_count_max: 8,
        difficulty: 3,
        rating: undefined,
        status: 'available',
        participation_fee: 3000,
        production_costs: [],
        genre: [],
        required_props: [],
        has_pre_reading: false
      })
    }
  }, [scenario])

  const handleSave = () => {
    const totalProductionCost = formData.production_costs.reduce((sum, cost) => sum + cost.amount, 0)
    
    const updatedScenario: Scenario = {
      id: scenario?.id || `new-${Date.now()}`,
      title: formData.title,
      author: formData.author,
      description: formData.description,
      duration: formData.duration,
      player_count_min: formData.player_count_min,
      player_count_max: formData.player_count_max,
      difficulty: formData.difficulty,
      rating: formData.rating,
      status: formData.status,
      participation_fee: formData.participation_fee,
      gm_costs: formData.gm_costs,
      license_costs: formData.license_costs,
      participation_costs: formData.participation_costs,
      production_cost: totalProductionCost,
      // production_costs: formData.production_costs, // データベースに存在しないため一時的にコメントアウト
      genre: formData.genre,
      required_props: formData.required_props, // Keep as object array with frequency
      has_pre_reading: formData.has_pre_reading,
      // 柔軟な料金設定を保存
      flexible_pricing: formData.use_flexible_pricing ? formData.flexible_pricing : undefined,
      available_gms: scenario?.available_gms || [],
      play_count: scenario?.play_count || 0,
      created_at: scenario?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // production_costsはローカルでのみ管理（データベースには保存しない）
    if (formData.production_costs.length > 0) {
      (updatedScenario as any).production_costs = formData.production_costs
    }

    onSave(updatedScenario)
    onClose()
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {scenario ? 'シナリオ編集' : '新規シナリオ作成'}
          </DialogTitle>
          <DialogDescription>
            {scenario ? 'シナリオの詳細情報を編集できます。' : '新しいシナリオの詳細情報を入力してください。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 基本情報 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">基本情報</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">タイトル *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="シナリオタイトル"
                />
              </div>
              <div>
                <Label htmlFor="author">作者 *</Label>
                <Input
                  id="author"
                  value={formData.author}
                  onChange={(e) => setFormData(prev => ({ ...prev, author: e.target.value }))}
                  placeholder="作者名"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="シナリオの説明"
                rows={3}
              />
            </div>
          </div>

          {/* ゲーム設定 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">ゲーム設定</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="duration">所要時間（分）</Label>
                <Input
                  id="duration"
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
                  min="30"
                  max="480"
                />
              </div>
              <div>
                <Label htmlFor="player_count_min">最小人数</Label>
                <Input
                  id="player_count_min"
                  type="number"
                  value={formData.player_count_min}
                  onChange={(e) => setFormData(prev => ({ ...prev, player_count_min: parseInt(e.target.value) || 1 }))}
                  min="1"
                  max="20"
                />
              </div>
              <div>
                <Label htmlFor="player_count_max">最大人数</Label>
                <Input
                  id="player_count_max"
                  type="number"
                  value={formData.player_count_max}
                  onChange={(e) => setFormData(prev => ({ ...prev, player_count_max: parseInt(e.target.value) || 1 }))}
                  min="1"
                  max="20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="difficulty">難易度（1-5）</Label>
                <Input
                  id="difficulty"
                  type="number"
                  value={formData.difficulty}
                  onChange={(e) => setFormData(prev => ({ ...prev, difficulty: parseInt(e.target.value) || 1 }))}
                  min="1"
                  max="5"
                />
              </div>
              <div>
                <Label htmlFor="status">ステータス</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
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
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="has_pre_reading"
                checked={formData.has_pre_reading}
                onChange={(e) => setFormData(prev => ({ ...prev, has_pre_reading: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="has_pre_reading">事前読み込みあり</Label>
            </div>

            {/* GM設定 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gm_required">必須GM人数</Label>
                <Input
                  id="gm_required"
                  type="number"
                  value={formData.flexible_pricing?.gm_configuration?.required_count || 1}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    flexible_pricing: {
                      ...prev.flexible_pricing,
                      gm_configuration: {
                        ...prev.flexible_pricing?.gm_configuration,
                        required_count: parseInt(e.target.value) || 1,
                        optional_count: prev.flexible_pricing?.gm_configuration?.optional_count || 0,
                        total_max: Math.max(parseInt(e.target.value) || 1, prev.flexible_pricing?.gm_configuration?.total_max || 2)
                      }
                    }
                  }))}
                  min="1"
                />
              </div>
              <div>
                <Label htmlFor="gm_max">最大GM人数</Label>
                <Input
                  id="gm_max"
                  type="number"
                  value={formData.flexible_pricing?.gm_configuration?.total_max || 2}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    flexible_pricing: {
                      ...prev.flexible_pricing,
                      gm_configuration: {
                        ...prev.flexible_pricing?.gm_configuration,
                        required_count: prev.flexible_pricing?.gm_configuration?.required_count || 1,
                        optional_count: Math.max(0, (parseInt(e.target.value) || 2) - (prev.flexible_pricing?.gm_configuration?.required_count || 1)),
                        total_max: parseInt(e.target.value) || 2
                      }
                    }
                  }))}
                  min={formData.flexible_pricing?.gm_configuration?.required_count || 1}
                />
              </div>
            </div>


            {/* 参加費（項目別） */}
            <div className="space-y-4">
              <h4 className="font-medium">参加費</h4>
              <div className="flex gap-2">
                <Select value={newParticipationCostTimeSlot} onValueChange={(value: string) => setNewParticipationCostTimeSlot(value)}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="通常">通常</SelectItem>
                    <SelectItem value="朝">朝</SelectItem>
                    <SelectItem value="昼">昼</SelectItem>
                    <SelectItem value="夜">夜</SelectItem>
                    <SelectItem value="平日">平日</SelectItem>
                    <SelectItem value="土日祝">土日祝</SelectItem>
                    <SelectItem value="平日朝">平日朝</SelectItem>
                    <SelectItem value="平日昼">平日昼</SelectItem>
                    <SelectItem value="平日夜">平日夜</SelectItem>
                    <SelectItem value="土日祝朝">土日祝朝</SelectItem>
                    <SelectItem value="土日祝昼">土日祝昼</SelectItem>
                    <SelectItem value="土日祝夜">土日祝夜</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="金額"
                  value={newParticipationCostAmount || ''}
                  onChange={(e) => setNewParticipationCostAmount(parseInt(e.target.value) || 0)}
                  min="0"
                  className="w-[120px]"
                />
                <Select value={newParticipationCostType} onValueChange={(value: 'percentage' | 'fixed') => setNewParticipationCostType(value)}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">固定額</SelectItem>
                    <SelectItem value="percentage">パーセンテージ</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  type="button" 
                  onClick={addParticipationCost}
                  disabled={newParticipationCostAmount <= 0}
                >
                  追加
                </Button>
              </div>
              
              {/* 参加費リスト */}
              {formData.participation_costs && formData.participation_costs.length > 0 && (
                <div className="mt-2 space-y-2">
                  {formData.participation_costs.map((cost, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {cost.time_slot}: {cost.type === 'percentage' ? `${cost.amount}%` : `¥${cost.amount.toLocaleString()}`}
                        </span>
                        <Badge 
                          variant="outline"
                          className="text-xs px-1 py-0.5"
                        >
                          {cost.type === 'percentage' ? 'パーセンテージ' : '固定額'}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeParticipationCost(index)}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ジャンル */}
            <div>
              <Label htmlFor="genre">ジャンル</Label>
              <MultiSelect
                options={genreOptions}
                value={formData.genre}
                onChange={(value) => setFormData(prev => ({ ...prev, genre: value }))}
                placeholder="ジャンルを選択してください"
                showBadges={true}
              />
            </div>
          </div>

          {/* コスト */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">コスト</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  // ルール追加：新しいルールを追加
                  const newModifier: PricingModifier = {
                    id: `modifier-${Date.now()}`,
                    condition: 'weekend',
                    modifier_type: 'fixed',
                    license_modifier: 0,
                    participation_modifier: 0,
                    description: '土日祝日料金',
                    active: true
                  }
                  setFormData(prev => ({
                    ...prev,
                    flexible_pricing: {
                      ...prev.flexible_pricing,
                      pricing_modifiers: [...prev.flexible_pricing.pricing_modifiers, newModifier]
                    }
                  }))
                }}
              >
                ルール追加
              </Button>
            </div>

            {/* 必要道具・制作費 */}
            <div className="space-y-6">
                {/* 必要道具 */}
                <div className="space-y-4">
                  <h4 className="font-medium">必要道具</h4>
                  <div className="flex gap-2">
                    <Input
                      placeholder="道具名"
                      value={newRequiredPropItem}
                      onChange={(e) => setNewRequiredPropItem(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="金額"
                      value={newRequiredPropAmount || ''}
                      onChange={(e) => setNewRequiredPropAmount(parseInt(e.target.value) || 0)}
                      min="0"
                      className="w-[120px]"
                    />
                    <Select value={newRequiredPropFrequency} onValueChange={(value: 'recurring' | 'one-time') => setNewRequiredPropFrequency(value)}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recurring">毎回</SelectItem>
                        <SelectItem value="one-time">1回のみ</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      type="button" 
                      onClick={addRequiredProp}
                      disabled={!newRequiredPropItem.trim() || newRequiredPropAmount <= 0}
                    >
                      追加
                    </Button>
                  </div>
                  
                  {/* 必要道具リスト */}
                  {formData.required_props.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {formData.required_props.map((prop, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {prop.item}: ¥{prop.amount.toLocaleString()}
                            </span>
                            <Badge 
                              variant={prop.frequency === 'recurring' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {prop.frequency === 'recurring' ? '毎回' : '1回のみ'}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRequiredProp(index)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                      <div className="text-sm font-medium text-right">
                        合計: ¥{formData.required_props.reduce((sum, prop) => sum + prop.amount, 0).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* 制作費・購入費 */}
                <div className="space-y-4">
                  <h4 className="font-medium">制作費・購入費</h4>
                  <div className="flex gap-2">
                    <Input
                      placeholder="項目名"
                      value={newProductionItem}
                      onChange={(e) => setNewProductionItem(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="金額"
                      value={newProductionAmount || ''}
                      onChange={(e) => setNewProductionAmount(parseInt(e.target.value) || 0)}
                      min="0"
                      className="w-[120px]"
                    />
                    <Button 
                      type="button" 
                      onClick={addProductionCost}
                      disabled={!newProductionItem.trim() || newProductionAmount <= 0}
                    >
                      追加
                    </Button>
                  </div>
                  
                  {/* 制作費リスト */}
                  {formData.production_costs.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {formData.production_costs.map((cost, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <span className="text-sm">
                            {cost.item}: ¥{cost.amount.toLocaleString()}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeProductionCost(index)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                      <div className="text-sm font-medium text-right">
                        合計: ¥{formData.production_costs.reduce((sum, cost) => sum + cost.amount, 0).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* ライセンス料（項目別） */}
                <div className="space-y-4">
                  <h4 className="font-medium">ライセンス料</h4>
                  <div className="flex gap-2">
                    <Select value={newLicenseCostTimeSlot} onValueChange={(value: string) => setNewLicenseCostTimeSlot(value)}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="通常">通常</SelectItem>
                        <SelectItem value="朝">朝</SelectItem>
                        <SelectItem value="昼">昼</SelectItem>
                        <SelectItem value="夜">夜</SelectItem>
                        <SelectItem value="平日">平日</SelectItem>
                        <SelectItem value="土日祝">土日祝</SelectItem>
                        <SelectItem value="平日朝">平日朝</SelectItem>
                        <SelectItem value="平日昼">平日昼</SelectItem>
                        <SelectItem value="平日夜">平日夜</SelectItem>
                        <SelectItem value="土日祝朝">土日祝朝</SelectItem>
                        <SelectItem value="土日祝昼">土日祝昼</SelectItem>
                        <SelectItem value="土日祝夜">土日祝夜</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="金額"
                      value={newLicenseCostAmount || ''}
                      onChange={(e) => setNewLicenseCostAmount(parseInt(e.target.value) || 0)}
                      min="0"
                      className="w-[120px]"
                    />
                    <Select value={newLicenseCostType} onValueChange={(value: 'percentage' | 'fixed') => setNewLicenseCostType(value)}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">固定額</SelectItem>
                        <SelectItem value="percentage">パーセンテージ</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      type="button" 
                      onClick={addLicenseCost}
                      disabled={newLicenseCostAmount <= 0}
                    >
                      追加
                    </Button>
                  </div>
                  
                  {/* ライセンス料リスト */}
                  {formData.license_costs && formData.license_costs.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {formData.license_costs.map((cost, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {cost.time_slot}: {cost.type === 'percentage' ? `${cost.amount}%` : `¥${cost.amount.toLocaleString()}`}
                            </span>
                            <Badge 
                              variant="outline"
                              className="text-xs px-1 py-0.5"
                            >
                              {cost.type === 'percentage' ? 'パーセンテージ' : '固定額'}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLicenseCost(index)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>


                {/* 料金修正ルール */}
                {formData.flexible_pricing?.pricing_modifiers && formData.flexible_pricing.pricing_modifiers.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">料金修正ルール</h4>
                    </div>
                    
                    <div className="space-y-3">
                      {(formData.flexible_pricing?.pricing_modifiers || []).map((modifier, index) => (
                        <div key={modifier.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <Input
                              placeholder="ルール説明"
                              value={modifier.description}
                              onChange={(e) => {
                                const updatedModifiers = [...formData.flexible_pricing.pricing_modifiers]
                                updatedModifiers[index] = { ...modifier, description: e.target.value }
                                setFormData(prev => ({
                                  ...prev,
                                  flexible_pricing: {
                                    ...prev.flexible_pricing,
                                    pricing_modifiers: updatedModifiers
                                  }
                                }))
                              }}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const updatedModifiers = formData.flexible_pricing.pricing_modifiers.filter((_, i) => i !== index)
                                setFormData(prev => ({
                                  ...prev,
                                  flexible_pricing: {
                                    ...prev.flexible_pricing,
                                    pricing_modifiers: updatedModifiers
                                  }
                                }))
                              }}
                              className="text-red-500 hover:text-red-700"
                            >
                              削除
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>条件</Label>
                              <Select
                                value={modifier.condition}
                                onValueChange={(value: 'weekday' | 'weekend' | 'holiday' | 'time_range' | 'custom') => {
                                  const updatedModifiers = [...formData.flexible_pricing.pricing_modifiers]
                                  updatedModifiers[index] = { ...modifier, condition: value }
                                  setFormData(prev => ({
                                    ...prev,
                                    flexible_pricing: {
                                      ...prev.flexible_pricing,
                                      pricing_modifiers: updatedModifiers
                                    }
                                  }))
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="weekday">平日</SelectItem>
                                  <SelectItem value="weekend">土日</SelectItem>
                                  <SelectItem value="holiday">祝日</SelectItem>
                                  <SelectItem value="time_range">時間帯</SelectItem>
                                  <SelectItem value="custom">カスタム</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>修正タイプ</Label>
                              <Select
                                value={modifier.modifier_type}
                                onValueChange={(value: 'fixed' | 'percentage') => {
                                  const updatedModifiers = [...formData.flexible_pricing.pricing_modifiers]
                                  updatedModifiers[index] = { ...modifier, modifier_type: value }
                                  setFormData(prev => ({
                                    ...prev,
                                    flexible_pricing: {
                                      ...prev.flexible_pricing,
                                      pricing_modifiers: updatedModifiers
                                    }
                                  }))
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fixed">固定額</SelectItem>
                                  <SelectItem value="percentage">割合</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>ライセンス料修正 {modifier.modifier_type === 'percentage' ? '(%)' : '(円)'}</Label>
                              <Input
                                type="number"
                                value={modifier.license_modifier}
                                onChange={(e) => {
                                  const updatedModifiers = [...formData.flexible_pricing.pricing_modifiers]
                                  updatedModifiers[index] = { ...modifier, license_modifier: parseInt(e.target.value) || 0 }
                                  setFormData(prev => ({
                                    ...prev,
                                    flexible_pricing: {
                                      ...prev.flexible_pricing,
                                      pricing_modifiers: updatedModifiers
                                    }
                                  }))
                                }}
                              />
                            </div>
                            <div>
                              <Label>参加費修正 {modifier.modifier_type === 'percentage' ? '(%)' : '(円)'}</Label>
                              <Input
                                type="number"
                                value={modifier.participation_modifier}
                                onChange={(e) => {
                                  const updatedModifiers = [...formData.flexible_pricing.pricing_modifiers]
                                  updatedModifiers[index] = { ...modifier, participation_modifier: parseInt(e.target.value) || 0 }
                                  setFormData(prev => ({
                                    ...prev,
                                    flexible_pricing: {
                                      ...prev.flexible_pricing,
                                      pricing_modifiers: updatedModifiers
                                    }
                                  }))
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* GM報酬（項目別） */}
                <div className="space-y-4">
                  <h4 className="font-medium">GM報酬</h4>
                  <div className="flex gap-2">
                    <Select value={newGmCostRole} onValueChange={(value: 'main' | 'sub') => setNewGmCostRole(value)}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="main">メインGM</SelectItem>
                        <SelectItem value="sub">サブGM</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={newGmCostTimeSlot} onValueChange={(value: string) => setNewGmCostTimeSlot(value)}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="通常">通常</SelectItem>
                        <SelectItem value="朝">朝</SelectItem>
                        <SelectItem value="昼">昼</SelectItem>
                        <SelectItem value="夜">夜</SelectItem>
                        <SelectItem value="平日">平日</SelectItem>
                        <SelectItem value="土日祝">土日祝</SelectItem>
                        <SelectItem value="平日朝">平日朝</SelectItem>
                        <SelectItem value="平日昼">平日昼</SelectItem>
                        <SelectItem value="平日夜">平日夜</SelectItem>
                        <SelectItem value="土日祝朝">土日祝朝</SelectItem>
                        <SelectItem value="土日祝昼">土日祝昼</SelectItem>
                        <SelectItem value="土日祝夜">土日祝夜</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="金額"
                      value={newGmCostAmount || ''}
                      onChange={(e) => setNewGmCostAmount(parseInt(e.target.value) || 0)}
                      min="0"
                      className="w-[120px]"
                    />
                    <Button 
                      type="button" 
                      onClick={addGmCost}
                      disabled={newGmCostAmount <= 0}
                    >
                      追加
                    </Button>
                  </div>
                  
                  {/* GM報酬リスト */}
                  {formData.gm_costs && formData.gm_costs.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {formData.gm_costs.map((cost, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={cost.role === 'main' ? 'default' : 'secondary'}
                              className="text-xs px-1 py-0.5"
                            >
                              {cost.role === 'main' ? 'メインGM' : 'サブGM'}
                            </Badge>
                            <span className="text-sm">
                              {cost.time_slot}: ¥{cost.amount.toLocaleString()}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeGmCost(index)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>


          </div>

        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={!formData.title || !formData.author}>
            {scenario ? '更新' : '作成'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
