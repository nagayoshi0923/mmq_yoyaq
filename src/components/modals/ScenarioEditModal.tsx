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
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { MigrationConfirmationDialog } from '@/components/ui/migration-confirmation-dialog'
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
  license_rewards: { item: string; amount: number; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number }[]
  has_pre_reading: boolean
  gm_count: number
  gm_assignments: { role: string; reward: number; status?: 'active' | 'legacy' | 'unused' | 'ready'; usageCount?: number }[]
  // 時間帯別料金設定
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
    license_rewards: [],
    has_pre_reading: false,
    gm_count: 1,
    gm_assignments: [{ role: 'main', reward: 2000 }],
    // 項目別料金設定
    participation_costs: [{ time_slot: '通常', amount: 3000, type: 'fixed' }],
    use_flexible_pricing: false,
    flexible_pricing: {
      base_pricing: {
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
  
  // ライセンス報酬用
  const [newLicenseRewardItem, setNewLicenseRewardItem] = useState('通常')
  const [newLicenseRewardAmount, setNewLicenseRewardAmount] = useState(0)
  
  // 削除確認ダイアログ用
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null)
  const [deleteItemName, setDeleteItemName] = useState('')
  const [deleteItemType, setDeleteItemType] = useState('')
  
  // 移行確認ダイアログ用
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false)
  const [existingActiveReward, setExistingActiveReward] = useState<{ index: number; reward: any } | null>(null)
  
  // 過去のみ非表示状態管理
  const [hideLegacyRewards, setHideLegacyRewards] = useState(false)
  
  
  
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

  // ライセンス報酬管理
  const addLicenseReward = () => {
    if (newLicenseRewardItem && newLicenseRewardAmount > 0) {
      console.log('DEBUG: Adding license reward', {
        newItem: newLicenseRewardItem,
        newAmount: newLicenseRewardAmount,
        existingRewards: formData.license_rewards.map(r => ({ item: r.item, status: r.status, amount: r.amount }))
      })
      
      // 同じ項目で使用中の設定があるかチェック
      const existingActiveIndex = formData.license_rewards.findIndex(reward => 
        reward.item === newLicenseRewardItem && reward.status === 'active'
      )
      
      console.log('DEBUG: Existing active check', {
        existingActiveIndex,
        foundReward: existingActiveIndex !== -1 ? formData.license_rewards[existingActiveIndex] : null
      })
      
      if (existingActiveIndex !== -1) {
        // 使用中の項目がある場合は移行確認ダイアログを表示
        console.log('DEBUG: Showing migration dialog for license')
        setExistingActiveReward({
          index: existingActiveIndex,
          reward: formData.license_rewards[existingActiveIndex]
        })
        setMigrationDialogOpen(true)
      } else {
        // 使用中の項目がない場合は通常の追加
        console.log('DEBUG: Normal license add')
        setFormData(prev => ({
          ...prev,
          license_rewards: [...prev.license_rewards, { 
            item: newLicenseRewardItem, 
            amount: newLicenseRewardAmount,
            status: getItemStatus(newLicenseRewardAmount, 0),
            usageCount: 0
          }]
        }))
        setNewLicenseRewardItem('通常')
        setNewLicenseRewardAmount(0)
      }
    }
  }

  const handleDeleteClick = (index: number) => {
    setDeleteTargetIndex(index)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (deleteTargetIndex === null) return
    
    const reward = formData.license_rewards[deleteTargetIndex]
    
    // 使用実績がある場合はlegacyステータスに変更、未使用の場合は完全削除
    if (reward.usageCount && reward.usageCount > 0) {
      setFormData(prev => ({
        ...prev,
        license_rewards: prev.license_rewards.map((item, i) => 
          i === deleteTargetIndex ? { ...item, status: 'legacy' as const } : item
        )
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        license_rewards: prev.license_rewards.filter((_, i) => i !== deleteTargetIndex)
      }))
    }
    
    setDeleteDialogOpen(false)
    setDeleteTargetIndex(null)
  }

  // 移行確認後の処理
  const handleLicenseMigrationConfirm = () => {
    if (existingActiveReward) {
      // 既存の項目を「過去のみ」に変更
      const updatedRewards = [...formData.license_rewards]
      updatedRewards[existingActiveReward.index] = {
        ...existingActiveReward.reward,
        status: 'legacy'
      }
      
      // 新しい項目を「使用中」として追加
      const newActiveReward = {
        item: newLicenseRewardItem,
        amount: newLicenseRewardAmount,
        status: 'active' as const,
        usageCount: 0
      }
      
      setFormData(prev => ({
        ...prev,
        license_rewards: [...updatedRewards, newActiveReward]
      }))
      
      // 入力欄をリセット
      setNewLicenseRewardItem('通常')
      setNewLicenseRewardAmount(0)
      setExistingActiveReward(null)
    }
  }

  // 移行キャンセル後の処理
  const handleLicenseMigrationCancel = () => {
    setExistingActiveReward(null)
    // 新規入力欄はそのまま（キャンセルしただけ）
  }

  // 個別GM削除ハンドラー
  const removeGmAssignment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      gm_count: prev.gm_count - 1,
      gm_assignments: prev.gm_assignments.filter((_, i) => i !== index)
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
    const nextRole = getNextAvailableRole()
    setFormData(prev => ({
      ...prev,
      gm_assignments: [...prev.gm_assignments, { 
        role: nextRole, 
        reward: 2000,
        status: getItemStatus(2000, 0),
        usageCount: 0
      }],
      gm_count: prev.gm_count + 1
    }))
  }

  const handleRemoveGmAssignment = (index: number) => {
    removeGmAssignment(index)
  }

  const handleClearNewGmAssignment = () => {
    // 新規入力欄をデフォルト状態にリセット
    // ConditionalSettingsコンポーネント内で管理されているnewItemの状態をリセット
    // 実際には、newItemの値を初期状態に戻すためのハンドラーを呼ぶ必要がある
  }

  const handleHideNewGmItem = () => {
    setShowNewGmItem(false)
  }


  // GM役割に応じた説明文を生成
  const getGmRoleDescription = (role: string) => {
    if (role === 'main') return 'ゲーム進行の主担当'
    if (role === 'sub1') return 'メインGMのサポート役'
    
    // sub2以降は動的に生成
    const roleNumber = parseInt(role.replace('sub', ''))
    if (roleNumber >= 2) {
      return `カスタム設定${roleNumber - 1}`
    }
    
    return ''
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

  // GM役割オプションを動的に生成
  const generateGmRoleOptions = (maxCount: number = 20) => {
    const options = [
      { value: 'main', label: 'メインGM' },
      { value: 'sub1', label: 'サブGM' }
    ]
    
    // 設定1から設定N-2まで動的に追加
    for (let i = 2; i <= maxCount; i++) {
      options.push({
        value: `sub${i}`,
        label: `設定${i - 1}`
      })
    }
    
    return options
  }

  // 現在必要な役割数に基づいてオプションを生成
  const getCurrentGmRoleOptions = () => {
    const currentMaxRole = Math.max(
      ...formData.gm_assignments.map(assignment => {
        if (assignment.role === 'main') return 0
        if (assignment.role === 'sub1') return 1
        return parseInt(assignment.role.replace('sub', ''))
      }),
      2 // 最低でも設定1まで表示
    )
    return generateGmRoleOptions(currentMaxRole + 2) // 次の設定も含める
  }

  const gmRoleOptions = getCurrentGmRoleOptions()

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


  // 金額を表示用にフォーマット（カンマ区切り + 円）
  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseInt(amount) || 0 : amount
    if (num === 0) return ''
    return `${num.toLocaleString()}円`
  }

  // 全角数字を半角数字に変換
  const convertFullWidthToHalfWidth = (str: string) => {
    return str.replace(/[０-９]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
    })
  }

  // 表示用文字列から数値を抽出
  const parseCurrency = (value: string) => {
    // 全角数字を半角に変換してから処理
    const halfWidthValue = convertFullWidthToHalfWidth(value)
    return parseInt(halfWidthValue.replace(/[^\d]/g, '')) || 0
  }

  // ステータス判定ロジック
  const getItemStatus = (amount: number, usageCount?: number): 'active' | 'legacy' | 'unused' | 'ready' => {
    if (usageCount && usageCount > 0) {
      return 'active' // 使用実績あり
    }
    if (amount > 0) {
      return 'ready' // 金額設定済み、運用可能
    }
    return 'unused' // 未設定
  }


  // 新規追加用の利用可能な役割を取得
  const getAvailableGmRolesForNew = () => {
    const usedRoles = formData.gm_assignments.map(assignment => assignment.role)
    return gmRoleOptions.filter(option => !usedRoles.includes(option.value as any))
  }

  // 次に利用可能な役割を取得（新規追加用）
  const getNextAvailableRole = (): string => {
    const availableRoles = getAvailableGmRolesForNew()
    if (availableRoles.length > 0) {
      return availableRoles[0].value
    }
    
    // 利用可能な役割がない場合、新しい設定Nを生成
    const usedRoles = formData.gm_assignments.map(assignment => assignment.role)
    const maxSubNumber = Math.max(
      ...usedRoles
        .filter(role => role.startsWith('sub'))
        .map(role => parseInt(role.replace('sub', '')))
        .filter(num => !isNaN(num)),
      1 // 最低でもsub1から開始
    )
    
    return `sub${maxSubNumber + 1}`
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
        license_rewards: (() => {
          if (!Array.isArray(scenario.license_rewards) || scenario.license_rewards.length === 0) {
            // テスト用データを表示
            return [
              { 
                item: '通常', 
                amount: 1500, 
                status: 'active', 
                usageCount: 12 
              },
              { 
                item: '土日祝', 
                amount: 2000, 
                status: 'legacy', 
                usageCount: 8 
              },
              { 
                item: '特別', 
                amount: 2500, 
                status: 'ready', 
                usageCount: 0 
              }
            ]
          }
          return (scenario.license_rewards as any[]).map(reward => ({
            item: reward.item || '',
            amount: reward.amount || 0,
            status: reward.status || getItemStatus(reward.amount || 0, reward.usageCount || 0),
            usageCount: reward.usageCount || 0
          }))
        })(),
        has_pre_reading: scenario.has_pre_reading || false,
        gm_count: scenario.gm_costs?.length || 2,
        gm_assignments: scenario.gm_costs || [
          { 
            role: 'main' as const, 
            reward: 2000,
            status: getItemStatus(2000, 8),
            usageCount: 8
          },
          { 
            role: 'sub1' as const, 
            reward: 1500,
            status: getItemStatus(1500, 3),
            usageCount: 3
          }
        ],
        // 項目別料金設定の初期化
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
        license_rewards: [
          // テスト用: 使用中データ
          { 
            item: '通常', 
            amount: 1500, 
            status: 'active', 
            usageCount: 12 
          },
          // テスト用: 過去のみデータ
          { 
            item: '土日祝', 
            amount: 2000, 
            status: 'legacy', 
            usageCount: 8 
          },
          // テスト用: 運用可能データ
          { 
            item: '特別', 
            amount: 2500, 
            status: 'ready', 
            usageCount: 0 
          }
        ],
        has_pre_reading: false,
        gm_count: 1,
        gm_assignments: [{ 
          role: 'main' as const, 
          reward: 2000,
          status: getItemStatus(2000, 0),
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
      participation_costs: formData.participation_costs,
      production_cost: totalProductionCost,
      // production_costs: formData.production_costs, // データベースに存在しないため一時的にコメントアウト
      genre: formData.genre,
      required_props: formData.required_props, // Keep as object array with frequency
      license_rewards: formData.license_rewards, // ライセンス報酬を保存
      has_pre_reading: formData.has_pre_reading,
      gm_costs: formData.gm_assignments,
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

  // GM報酬用state
  const [gmRewards, setGmRewards] = useState<ConditionalSetting[]>([])
  const [newGmReward, setNewGmReward] = useState<ConditionalSetting>({ condition: '', amount: 0, type: 'fixed', status: 'ready' })

  // GM報酬用ハンドラ
  const handleGmRewardsChange = (items: ConditionalSetting[]) => setGmRewards(items)
  const handleNewGmRewardChange = (item: ConditionalSetting) => setNewGmReward(item)
  const handleAddGmReward = () => {
    setGmRewards(prev => [...prev, newGmReward])
    setNewGmReward({ condition: '', amount: 0, type: 'fixed', status: 'ready' })
  }
  const handleRemoveGmReward = (index: number) => {
    setGmRewards(prev => prev.filter((_, i) => i !== index))
  }
  const handleClearNewGmReward = () => setNewGmReward({ condition: '', amount: 0, type: 'fixed', status: 'ready' })


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
                  subtitle="役割や条件ごとにGM報酬を設定できます"
                  items={gmRewards}
                  newItem={newGmReward}
                  conditionOptions={timeSlotOptions} // ここは必要に応じてGM用の選択肢に変更可
                  showDescription={true}
                  showStatusSelector={true}
                  itemType="GM報酬"
                  getDescription={getTimeSlotDescription}
                  onItemsChange={handleGmRewardsChange}
                  onNewItemChange={handleNewGmRewardChange}
                  onAddItem={handleAddGmReward}
                  onRemoveItem={handleRemoveGmReward}
                  onClearNewItem={handleClearNewGmReward}
                  addButtonText="GM報酬を追加"
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

                {/* ライセンス報酬 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">ライセンス報酬</h4>
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={hideLegacyRewards}
                        onChange={(e) => setHideLegacyRewards(e.target.checked)}
                        className="rounded"
                      />
                      過去のみを非表示
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Select value={newLicenseRewardItem} onValueChange={(value) => setNewLicenseRewardItem(value)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="時間帯を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlotOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="text"
                      placeholder="金額"
                      value={formatCurrency(newLicenseRewardAmount || 0)}
                      onChange={(e) => setNewLicenseRewardAmount(parseCurrency(e.target.value))}
                      className="w-[120px]"
                    />
                    <Button 
                      type="button" 
                      onClick={addLicenseReward}
                      disabled={!newLicenseRewardItem || newLicenseRewardAmount <= 0}
                    >
                      追加
                    </Button>
                  </div>
                  
                  {/* ライセンス報酬リスト */}
                  {formData.license_rewards.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {formData.license_rewards
                        .filter(reward => hideLegacyRewards ? reward.status !== 'legacy' : true)
                        .map((reward, displayIndex) => {
                          // 元のindexを取得（削除時に正しいindexを使用するため）
                          const originalIndex = formData.license_rewards.findIndex(original => original === reward)
                          return (
                        <div key={originalIndex} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {reward.item}: {formatCurrency(reward.amount)}
                            </span>
                            {reward.status && (
                              <Badge 
                                variant={
                                  reward.status === 'active' ? 'default' :
                                  reward.status === 'ready' ? 'secondary' :
                                  reward.status === 'legacy' ? 'outline' : 'destructive'
                                }
                                className="text-xs"
                              >
                                {reward.status === 'active' ? '使用中' :
                                 reward.status === 'ready' ? '待機設定' :
                                 reward.status === 'legacy' ? '過去のみ' : '無効'}
                                {reward.usageCount ? ` (${reward.usageCount}回)` : ''}
                              </Badge>
                            )}
                          </div>
                          {reward.status !== 'legacy' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(originalIndex)}
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                            >
                              ×
                            </Button>
                          )}
                        </div>
                          )
                        })}
                      <div className="text-sm font-medium text-right">
                        合計: {formatCurrency(formData.license_rewards.reduce((sum, reward) => sum + reward.amount, 0))}
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

        {/* 削除確認ダイアログ */}
        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open)
            if (!open) {
              setDeleteTargetIndex(null)
            }
          }}
          itemName={deleteTargetIndex !== null ? formData.license_rewards[deleteTargetIndex]?.item || '' : ''}
          itemType="ライセンス報酬"
          usageCount={deleteTargetIndex !== null ? formData.license_rewards[deleteTargetIndex]?.usageCount : 0}
          status={deleteTargetIndex !== null ? formData.license_rewards[deleteTargetIndex]?.status : undefined}
          scenarioName={formData.title}
          requireScenarioNameConfirmation={deleteTargetIndex !== null && formData.license_rewards[deleteTargetIndex]?.status === 'active'}
          onConfirm={confirmDelete}
        />

        {/* 移行確認ダイアログ */}
        <MigrationConfirmationDialog
          open={migrationDialogOpen}
          onOpenChange={setMigrationDialogOpen}
          itemName={existingActiveReward?.reward.item || ''}
          itemType="ライセンス報酬"
          existingAmount={existingActiveReward?.reward.amount || 0}
          newAmount={newLicenseRewardAmount}
          usageCount={existingActiveReward?.reward.usageCount || 0}
          onConfirm={handleLicenseMigrationConfirm}
          onCancel={handleLicenseMigrationCancel}
        />
      </DialogContent>
    </Dialog>
  )
}
