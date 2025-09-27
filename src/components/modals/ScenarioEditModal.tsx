import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Badge } from '@/components/ui/badge'
import { ConditionalSettings, ConditionalSetting } from '@/components/ui/conditional-settings'
import type { Scenario, FlexiblePricing, PricingModifier } from '@/types'

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
  gm_count: number
  gm_assignments: { role: 'main' | 'sub'; reward: number; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number }[]
  // 時間帯別料金設定
  license_costs: { time_slot: string; amount: number; type: 'percentage' | 'fixed'; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number }[]
  participation_costs: { time_slot: string; amount: number; type: 'percentage' | 'fixed'; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number }[]
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
    gm_count: 1,
    gm_assignments: [{ role: 'main', reward: 2000 }],
    // 項目別料金設定
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
  
  
  // ライセンス代項目別入力用
  const [newLicenseCostTimeSlot, setNewLicenseCostTimeSlot] = useState<string>('通常')
  const [newLicenseCostAmount, setNewLicenseCostAmount] = useState(0)
  const [newLicenseCostType, setNewLicenseCostType] = useState<'percentage' | 'fixed'>('fixed')
  
  // 参加費項目別入力用
  const [newParticipationCostTimeSlot, setNewParticipationCostTimeSlot] = useState<string>('通常')
  const [newParticipationCostAmount, setNewParticipationCostAmount] = useState(0)
  
  // 新規入力欄の表示制御
  const [showNewGmItem, setShowNewGmItem] = useState(true)
  

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


  // 個別GM削除ハンドラー
  const removeGmAssignment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      gm_count: prev.gm_count - 1,
      gm_assignments: prev.gm_assignments.filter((_, i) => i !== index)
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
          type: newLicenseCostType,
          status: getItemStatus(newLicenseCostAmount, 0),
          usageCount: 0
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
        participation_costs: [...(prev.participation_costs || []), { 
          time_slot: newParticipationCostTimeSlot, 
          amount: newParticipationCostAmount,
          type: 'fixed',
          status: getItemStatus(newParticipationCostAmount, 0),
          usageCount: 0
        }]
      }))
      setNewParticipationCostTimeSlot('通常')
      setNewParticipationCostAmount(0)
    }
  }

  const removeParticipationCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      participation_costs: (prev.participation_costs || []).filter((_, i) => i !== index)
    }))
  }

  // 参加費の新しいコンポーネント用ハンドラー
  const handleParticipationCostsChange = (costs: ConditionalSetting[]) => {
    setFormData(prev => ({
      ...prev,
      participation_costs: costs.map(cost => ({
        time_slot: cost.condition,
        amount: cost.amount,
        type: 'fixed' as const,
        status: cost.status,
        usageCount: cost.usageCount
      }))
    }))
  }

  const handleNewParticipationCostChange = (newCost: ConditionalSetting) => {
    setNewParticipationCostTimeSlot(newCost.condition)
    setNewParticipationCostAmount(newCost.amount)
  }

  const handleAddParticipationCost = () => {
    addParticipationCost()
  }

  const handleClearNewParticipationCost = () => {
    setNewParticipationCostTimeSlot('通常')
    setNewParticipationCostAmount(0)
  }

  // GM設定の新しいコンポーネント用ハンドラー
  const handleGmAssignmentsChange = (assignments: ConditionalSetting[]) => {
    const gmAssignments = assignments.map(assignment => ({
      role: assignment.condition as 'main' | 'sub',
      reward: assignment.amount,
      status: assignment.status,
      usageCount: assignment.usageCount
    }))
    setFormData(prev => ({
      ...prev,
      gm_assignments: gmAssignments,
      gm_count: gmAssignments.length
    }))
  }

  const handleNewGmAssignmentChange = (_newAssignment: ConditionalSetting) => {
    // 新しいGM配置の変更は特に処理しない（追加時に処理）
  }

  const handleAddGmAssignment = () => {
    console.log('handleAddGmAssignment called!')
    console.log('Current gm_assignments:', formData.gm_assignments)
    setFormData(prev => {
      const newAssignments = [...prev.gm_assignments, { 
        role: 'sub' as const, 
        reward: 2000,
        status: getItemStatus(2000, 0),
        usageCount: 0
      }]
      console.log('New gm_assignments:', newAssignments)
      return {
        ...prev,
        gm_assignments: newAssignments,
        gm_count: prev.gm_count + 1
      }
    })
  }

  const handleRemoveGmAssignment = (index: number) => {
    removeGmAssignment(index)
  }

  const handleClearNewGmAssignment = () => {
    console.log('handleClearNewGmAssignment called!')
    // 新規入力欄をデフォルト状態にリセット
    // ConditionalSettingsコンポーネント内で管理されているnewItemの状態をリセット
    // 実際には、newItemの値を初期状態に戻すためのハンドラーを呼ぶ必要がある
  }

  const handleHideNewGmItem = () => {
    console.log('handleHideNewGmItem called!')
    setShowNewGmItem(false)
  }

  // ライセンス料の新しいコンポーネント用ハンドラー
  const handleLicenseCostsChange = (costs: ConditionalSetting[]) => {
    setFormData(prev => ({
      ...prev,
      license_costs: costs.map(cost => ({
        time_slot: cost.condition,
        amount: cost.amount,
        type: cost.type || 'fixed' as const,
        status: cost.status,
        usageCount: cost.usageCount
      }))
    }))
  }

  const handleNewLicenseCostChange = (newCost: ConditionalSetting) => {
    setNewLicenseCostTimeSlot(newCost.condition)
    setNewLicenseCostAmount(newCost.amount)
    setNewLicenseCostType(newCost.type as 'percentage' | 'fixed' || 'fixed')
  }

  const handleAddLicenseCost = () => {
    addLicenseCost()
  }

  const handleClearNewLicenseCost = () => {
    setNewLicenseCostTimeSlot('通常')
    setNewLicenseCostAmount(0)
    setNewLicenseCostType('fixed')
  }

  // GM役割に応じた説明文を生成
  const getGmRoleDescription = (role: string) => {
    const descriptions: { [key: string]: string } = {
      'main': 'ゲーム進行の主担当',
      'sub': 'メインGMのサポート役'
    }
    return descriptions[role] || ''
  }


  // 時間帯オプション
  const timeSlotOptions = [
    { value: '通常', label: '通常' },
    { value: '朝', label: '朝' },
    { value: '昼', label: '昼' },
    { value: '夜', label: '夜' },
    { value: '平日', label: '平日' },
    { value: '土日祝', label: '土日祝' },
    { value: '平日朝', label: '平日朝' },
    { value: '平日昼', label: '平日昼' },
    { value: '平日夜', label: '平日夜' },
    { value: '土日祝朝', label: '土日祝朝' },
    { value: '土日祝昼', label: '土日祝昼' },
    { value: '土日祝夜', label: '土日祝夜' }
  ]

  // GM役割オプション
  const gmRoleOptions = [
    { value: 'main', label: 'メインGM' },
    { value: 'sub', label: 'サブGM' }
  ]

  // 時間帯に応じた説明文を生成（参加費用）
  const getTimeSlotDescription = (timeSlot: string) => {
    const descriptions: { [key: string]: string } = {
      '通常': '基本の参加費',
      '朝': '朝の時間帯の参加費',
      '昼': '昼の時間帯の参加費',
      '夜': '夜の時間帯の参加費',
      '平日': '平日の参加費',
      '土日祝': '土日祝日の参加費',
      '平日朝': '平日朝の時間帯の参加費',
      '平日昼': '平日昼の時間帯の参加費',
      '平日夜': '平日夜の時間帯の参加費',
      '土日祝朝': '土日祝日朝の時間帯の参加費',
      '土日祝昼': '土日祝日昼の時間帯の参加費',
      '土日祝夜': '土日祝日夜の時間帯の参加費'
    }
    return descriptions[timeSlot] || ''
  }

  // 時間帯に応じた説明文を生成（ライセンス料用）
  const getLicenseTimeSlotDescription = (timeSlot: string) => {
    const descriptions: { [key: string]: string } = {
      '通常': '基本のライセンス料',
      '朝': '朝の時間帯のライセンス料',
      '昼': '昼の時間帯のライセンス料',
      '夜': '夜の時間帯のライセンス料',
      '平日': '平日のライセンス料',
      '土日祝': '土日祝日のライセンス料',
      '平日朝': '平日朝の時間帯のライセンス料',
      '平日昼': '平日昼の時間帯のライセンス料',
      '平日夜': '平日夜の時間帯のライセンス料',
      '土日祝朝': '土日祝日朝の時間帯のライセンス料',
      '土日祝昼': '土日祝日昼の時間帯のライセンス料',
      '土日祝夜': '土日祝日夜の時間帯のライセンス料'
    }
    return descriptions[timeSlot] || ''
  }

  // 金額を表示用にフォーマット（カンマ区切り + 円）
  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseInt(amount) || 0 : amount
    if (num === 0) return ''
    return `${num.toLocaleString()}円`
  }

  // 表示用文字列から数値を抽出
  const parseCurrency = (value: string) => {
    return parseInt(value.replace(/[^\d]/g, '')) || 0
  }

  // ステータス判定ロジック
  const getItemStatus = (amount: number, usageCount?: number): 'active' | 'legacy' | 'unused' | 'ready' => {
    console.log('getItemStatus called:', { amount, usageCount })
    if (usageCount && usageCount > 0) {
      console.log('returning active')
      return 'active' // 使用実績あり
    }
    if (amount > 0) {
      console.log('returning ready')
      return 'ready' // 金額設定済み、運用可能
    }
    console.log('returning unused')
    return 'unused' // 未設定
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
        status: (scenario.status as 'available' | 'maintenance' | 'retired') || 'available',
        participation_fee: scenario.participation_fee || 3000,
        production_costs: scenario.production_costs || (scenario.production_cost > 0 ? [{ item: '制作費', amount: scenario.production_cost }] : []),
        genre: scenario.genre || [],
        required_props: (() => {
          if (!Array.isArray(scenario.required_props) || scenario.required_props.length === 0) {
            return []
          }
          if (typeof scenario.required_props[0] === 'object') {
            return (scenario.required_props as any[]).map(prop => ({
              item: prop.item || prop,
              amount: prop.amount || 0,
              frequency: prop.frequency || 'recurring'
            }))
          } else {
            return (scenario.required_props as unknown as string[]).map(prop => ({ 
              item: prop, 
              amount: 0, 
              frequency: 'recurring' as const 
            }))
          }
        })(),
        has_pre_reading: scenario.has_pre_reading || false,
        gm_count: scenario.gm_assignments?.length || 2,
        gm_assignments: scenario.gm_assignments || [
          { 
            role: 'main' as const, 
            reward: 2000,
            status: getItemStatus(2000, 8),
            usageCount: 8
          },
          { 
            role: 'sub' as const, 
            reward: 1500,
            status: getItemStatus(1500, 3),
            usageCount: 3
          }
        ],
        // 項目別料金設定の初期化
        license_costs: scenario.license_costs || [
          { 
            time_slot: '通常', 
            amount: 500, 
            type: 'fixed' as const,
            status: getItemStatus(500, 12),
            usageCount: 12
          },
          { 
            time_slot: '平日', 
            amount: 300, 
            type: 'fixed' as const,
            status: getItemStatus(300, 5),
            usageCount: 5
          },
          { 
            time_slot: '土日祝', 
            amount: 800, 
            type: 'fixed' as const,
            status: getItemStatus(800, 0),
            usageCount: 0
          }
        ],
        participation_costs: scenario.participation_costs || (scenario.participation_fee > 0 ? [
          { 
            time_slot: '通常', 
            amount: scenario.participation_fee, 
            type: 'fixed' as const,
            status: getItemStatus(scenario.participation_fee, 15),
            usageCount: 15
          },
          { 
            time_slot: '平日', 
            amount: scenario.participation_fee - 500, 
            type: 'fixed' as const,
            status: getItemStatus(scenario.participation_fee - 500, 8),
            usageCount: 8
          }
        ] : []),
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
        status: 'available' as const,
        participation_fee: 3000,
        production_costs: [],
        genre: [],
        required_props: [],
        has_pre_reading: false,
        gm_count: 1,
        gm_assignments: [{ 
          role: 'main' as const, 
          reward: 2000,
          status: getItemStatus(2000, 0),
          usageCount: 0
        }],
        license_costs: [{ 
          time_slot: '通常', 
          amount: 0, 
          type: 'fixed' as const,
          status: getItemStatus(0, 0),
          usageCount: 0
        }],
        participation_costs: [{ 
          time_slot: '通常', 
          amount: 3000, 
          type: 'fixed' as const,
          status: getItemStatus(3000, 0),
          usageCount: 0
        }],
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
      status: formData.status as 'available' | 'maintenance' | 'retired',
      participation_fee: formData.participation_fee,
      license_costs: formData.license_costs,
      participation_costs: formData.participation_costs,
      production_cost: totalProductionCost,
      // production_costs: formData.production_costs, // データベースに存在しないため一時的にコメントアウト
      genre: formData.genre,
      required_props: formData.required_props, // Keep as object array with frequency
      has_pre_reading: formData.has_pre_reading,
      gm_assignments: formData.gm_assignments,
      available_gms: scenario?.available_gms || [],
      // 柔軟な料金設定を保存
      flexible_pricing: formData.use_flexible_pricing ? formData.flexible_pricing : undefined,
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

            {/* 参加費（項目別） */}
            <ConditionalSettings
              title="参加費"
              subtitle="時間帯や曜日に応じて異なる参加費を設定できます"
              items={(formData.participation_costs || []).map(cost => ({
                condition: cost.time_slot,
                amount: cost.amount,
                type: 'fixed' as const,
                status: cost.status,
                usageCount: cost.usageCount
              }))}
              newItem={{
                condition: newParticipationCostTimeSlot,
                amount: newParticipationCostAmount,
                type: 'fixed' as const
              }}
              conditionOptions={timeSlotOptions}
              showDescription={true}
              getDescription={getTimeSlotDescription}
              onItemsChange={handleParticipationCostsChange}
              onNewItemChange={handleNewParticipationCostChange}
              onAddItem={handleAddParticipationCost}
              onRemoveItem={removeParticipationCost}
              onClearNewItem={handleClearNewParticipationCost}
              addButtonText="条件を追加"
            />

            {/* ジャンル */}
            <div>
              <Label htmlFor="genre">ジャンル</Label>
              <MultiSelect
                options={genreOptions}
                selectedValues={formData.genre}
                onSelectionChange={(value) => setFormData(prev => ({ ...prev, genre: value }))}
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
                {/* GM報酬 */}
                <ConditionalSettings
                  title="GM報酬"
                  subtitle="役割に応じて異なる報酬を設定できます"
                  items={formData.gm_assignments.map((assignment, index) => {
                    console.log(`GM Assignment ${index}:`, assignment)
                    return {
                      condition: assignment.role,
                      amount: assignment.reward,
                      type: 'fixed' as const,
                      status: assignment.status,
                      usageCount: assignment.usageCount
                    }
                  })}
                  newItem={{
                    condition: 'sub',
                    amount: 2000,
                    type: 'fixed' as const,
                    status: getItemStatus(2000, 0),
                    usageCount: 0
                  }}
                  conditionOptions={gmRoleOptions}
                  showDescription={true}
                  showNewItem={showNewGmItem}
                  getDescription={getGmRoleDescription}
                  onItemsChange={handleGmAssignmentsChange}
                  onNewItemChange={handleNewGmAssignmentChange}
                  onAddItem={handleAddGmAssignment}
                  onRemoveItem={handleRemoveGmAssignment}
                  onClearNewItem={handleClearNewGmAssignment}
                  onHideNewItem={handleHideNewGmItem}
                  addButtonText="GMを追加"
                  placeholder="報酬"
                />

                {/* ライセンス料 */}
                <ConditionalSettings
                  title="ライセンス料"
                  subtitle="時間帯や曜日に応じて異なる料金を設定できます"
                  items={(formData.license_costs || []).map(cost => ({
                    condition: cost.time_slot,
                    amount: cost.amount,
                    type: cost.type,
                    status: cost.status,
                    usageCount: cost.usageCount
                  }))}
                  newItem={{
                    condition: newLicenseCostTimeSlot,
                    amount: newLicenseCostAmount,
                    type: newLicenseCostType
                  }}
                  conditionOptions={timeSlotOptions}
                  showTypeSelector={true}
                  showDescription={true}
                  getDescription={getLicenseTimeSlotDescription}
                  onItemsChange={handleLicenseCostsChange}
                  onNewItemChange={handleNewLicenseCostChange}
                  onAddItem={handleAddLicenseCost}
                  onRemoveItem={removeLicenseCost}
                  onClearNewItem={handleClearNewLicenseCost}
                  addButtonText="条件を追加"
                />

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
                      type="text"
                      placeholder="金額"
                      value={formatCurrency(newRequiredPropAmount || 0)}
                      onChange={(e) => setNewRequiredPropAmount(parseCurrency(e.target.value))}
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
                              {prop.item}: {formatCurrency(prop.amount)}
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
                        合計: {formatCurrency(formData.required_props.reduce((sum, prop) => sum + prop.amount, 0))}
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
                      type="text"
                      placeholder="金額"
                      value={formatCurrency(newProductionAmount || 0)}
                      onChange={(e) => setNewProductionAmount(parseCurrency(e.target.value))}
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
                            {cost.item}: {formatCurrency(cost.amount)}
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
                        合計: {formatCurrency(formData.production_costs.reduce((sum, cost) => sum + cost.amount, 0))}
                      </div>
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
                                type="text"
                                value={modifier.modifier_type === 'percentage' ? (modifier.license_modifier || '') : formatCurrency(modifier.license_modifier || 0)}
                                onChange={(e) => {
                                  const value = modifier.modifier_type === 'percentage' 
                                    ? parseInt(e.target.value.replace(/[^\d]/g, '')) || 0
                                    : parseCurrency(e.target.value)
                                  const updatedModifiers = [...formData.flexible_pricing.pricing_modifiers]
                                  updatedModifiers[index] = { ...modifier, license_modifier: value }
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
                                type="text"
                                value={modifier.modifier_type === 'percentage' ? (modifier.participation_modifier || '') : formatCurrency(modifier.participation_modifier || 0)}
                                onChange={(e) => {
                                  const value = modifier.modifier_type === 'percentage' 
                                    ? parseInt(e.target.value.replace(/[^\d]/g, '')) || 0
                                    : parseCurrency(e.target.value)
                                  const updatedModifiers = [...formData.flexible_pricing.pricing_modifiers]
                                  updatedModifiers[index] = { ...modifier, participation_modifier: value }
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
