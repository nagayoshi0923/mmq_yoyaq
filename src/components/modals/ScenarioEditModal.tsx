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
  license_amount: number
  participation_fee: number
  gm_fee: number
  production_costs: { item: string; amount: number }[]
  genre: string[]
  required_props: { item: string; amount: number; frequency: 'recurring' | 'one-time' }[]
  has_pre_reading: boolean
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
    license_amount: 0,
    participation_fee: 3000,
    gm_fee: 2000,
    production_costs: [],
    genre: [],
    required_props: [],
    has_pre_reading: false,
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
  
  // 詳細設定の表示状態
  const [showAdvancedPricing, setShowAdvancedPricing] = useState(false)

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
        license_amount: scenario.license_amount || 0,
        participation_fee: scenario.participation_fee || 3000,
        gm_fee: scenario.gm_fee || 2000,
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
        use_flexible_pricing: !!scenario.flexible_pricing,
        flexible_pricing: scenario.flexible_pricing || {
          base_pricing: {
            license_amount: scenario.license_amount || 0,
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
        license_amount: 0,
        participation_fee: 3000,
        gm_fee: 2000,
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
      license_amount: formData.license_amount,
      participation_fee: formData.participation_fee,
      gm_fee: formData.gm_fee,
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
          </div>

          {/* 料金設定 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">料金設定</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedPricing(!showAdvancedPricing)}
              >
                {showAdvancedPricing ? '簡単設定' : 'ルール追加'}
              </Button>
            </div>

            {!showAdvancedPricing ? (
              // シンプル設定
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="license_amount">ライセンス料（円）</Label>
                    <Input
                      id="license_amount"
                      type="number"
                      value={formData.license_amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, license_amount: parseInt(e.target.value) || 0 }))}
                      min="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="participation_fee">参加費（円）</Label>
                    <Input
                      id="participation_fee"
                      type="number"
                      value={formData.participation_fee}
                      onChange={(e) => setFormData(prev => ({ ...prev, participation_fee: parseInt(e.target.value) || 0 }))}
                      min="0"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="gm_fee">GM代（円）</Label>
                  <Input
                    id="gm_fee"
                    type="number"
                    value={formData.gm_fee}
                    onChange={(e) => setFormData(prev => ({ ...prev, gm_fee: parseInt(e.target.value) || 0 }))}
                    min="0"
                  />
                </div>
              </div>
            ) : (
              // 詳細設定
              <div className="space-y-6">
                {/* 基本料金 */}
                <div className="space-y-4">
                  <h4 className="font-medium">基本料金</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>ライセンス料（円）</Label>
                      <Input
                        type="number"
                        value={formData.flexible_pricing.base_pricing.license_amount}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          flexible_pricing: {
                            ...prev.flexible_pricing,
                            base_pricing: {
                              ...prev.flexible_pricing.base_pricing,
                              license_amount: parseInt(e.target.value) || 0
                            }
                          }
                        }))}
                        min="0"
                      />
                    </div>
                    <div>
                      <Label>参加費（円）</Label>
                      <Input
                        type="number"
                        value={formData.flexible_pricing.base_pricing.participation_fee}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          flexible_pricing: {
                            ...prev.flexible_pricing,
                            base_pricing: {
                              ...prev.flexible_pricing.base_pricing,
                              participation_fee: parseInt(e.target.value) || 0
                            }
                          }
                        }))}
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                {/* GM設定 */}
                <div className="space-y-4">
                  <h4 className="font-medium">GM設定</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>必須人数</Label>
                      <Input
                        type="number"
                        value={formData.flexible_pricing.gm_configuration.required_count}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          flexible_pricing: {
                            ...prev.flexible_pricing,
                            gm_configuration: {
                              ...prev.flexible_pricing.gm_configuration,
                              required_count: parseInt(e.target.value) || 0
                            }
                          }
                        }))}
                        min="0"
                      />
                    </div>
                    <div>
                      <Label>追加可能人数</Label>
                      <Input
                        type="number"
                        value={formData.flexible_pricing.gm_configuration.optional_count}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          flexible_pricing: {
                            ...prev.flexible_pricing,
                            gm_configuration: {
                              ...prev.flexible_pricing.gm_configuration,
                              optional_count: parseInt(e.target.value) || 0
                            }
                          }
                        }))}
                        min="0"
                      />
                    </div>
                    <div>
                      <Label>最大人数</Label>
                      <Input
                        type="number"
                        value={formData.flexible_pricing.gm_configuration.total_max}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          flexible_pricing: {
                            ...prev.flexible_pricing,
                            gm_configuration: {
                              ...prev.flexible_pricing.gm_configuration,
                              total_max: parseInt(e.target.value) || 0
                            }
                          }
                        }))}
                        min="0"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>特別要件</Label>
                    <Textarea
                      value={formData.flexible_pricing.gm_configuration.special_requirements || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        flexible_pricing: {
                          ...prev.flexible_pricing,
                          gm_configuration: {
                            ...prev.flexible_pricing.gm_configuration,
                            special_requirements: e.target.value
                          }
                        }
                      }))}
                      placeholder="特別な要件があれば記載してください"
                    />
                  </div>
                </div>

                {/* 料金修正ルール */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">料金修正ルール</h4>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
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
                  
                  {formData.flexible_pricing.pricing_modifiers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">料金修正ルールが設定されていません</p>
                  ) : (
                    <div className="space-y-3">
                      {formData.flexible_pricing.pricing_modifiers.map((modifier, index) => (
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
                  )}
                </div>

                <div>
                  <Label htmlFor="gm_fee">GM代（円）</Label>
                  <Input
                    id="gm_fee"
                    type="number"
                    value={formData.gm_fee}
                    onChange={(e) => setFormData(prev => ({ ...prev, gm_fee: parseInt(e.target.value) || 0 }))}
                    min="0"
                  />
                </div>
              </div>
            )}

            <div>
              <Label>必要道具</Label>
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
                          className="text-xs px-1 py-0.5"
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

            <div>
              <Label>制作費</Label>
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
          </div>

          {/* ジャンル */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">ジャンル</h3>
            
            <div>
              <Label>ジャンル</Label>
              <MultiSelect
                options={genreOptions}
                selectedValues={formData.genre}
                onSelectionChange={(values) => setFormData(prev => ({ ...prev, genre: values }))}
                placeholder="ジャンルを選択"
                showBadges={true}
              />
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
