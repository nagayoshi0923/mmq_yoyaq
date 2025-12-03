import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Badge } from '@/components/ui/badge'
// ConditionalSetting: 型として使われているが、実際には使用されていない（ItemizedSettingsコンポーネントで直接処理される）
// import { ConditionalSetting } from '@/components/ui/conditional-settings'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { ItemizedSettings } from '@/components/ui/itemized-settings'
import { Upload, X } from 'lucide-react'
import type { Scenario, Staff } from '@/types'
import { staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { formatDateJST, getCurrentJST } from '@/utils/dateUtils'
import { logger } from '@/utils/logger'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { OptimizedImage } from '@/components/ui/optimized-image'

// 型定義
import type { ScenarioEditModalProps, ScenarioFormData } from './ScenarioEditModal/types'

// 定数
import { statusOptions, genreOptions } from './ScenarioEditModal/utils/constants'

// ヘルパー関数
// convertFullWidthToHalfWidthはファイル内で再定義されているため、インポートを削除

// 注: formatCurrency と parseCurrency は現在未使用ですが、
// 将来的な料金表示機能のために残しています

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
    license_amount: 0,
    gm_test_license_amount: 0,
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
    },
    key_visual_url: ''
  })

  // 画像アップロード用のstate
  const [uploading, setUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [newProductionItem, setNewProductionItem] = useState('')
  const [newProductionAmount, setNewProductionAmount] = useState(0)
  const [newRequiredPropItem, setNewRequiredPropItem] = useState('')
  const [newRequiredPropAmount, setNewRequiredPropAmount] = useState(0)
  const [newRequiredPropFrequency, setNewRequiredPropFrequency] = useState<'recurring' | 'one-time'>('recurring')
  
  // スタッフデータ用のstate
  const [staff, setStaff] = useState<Staff[]>([])
  // loadingStaff: setLoadingStaffは使用されているが、loadingStaffの値は未使用（将来のローディング表示で使用予定）
  // @ts-expect-error - loadingStaffの値は未使用だが、setLoadingStaffは使用されているため保持
  const [loadingStaff, setLoadingStaff] = useState(false)
  
  // 担当関係データ用のstate
  const [currentAssignments, setCurrentAssignments] = useState<any[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  
  // ライセンス報酬用（未使用 - ライセンス報酬はItemizedSettingsコンポーネントで管理）
  // newLicenseRewardItem, setNewLicenseRewardItem, newLicenseRewardAmountInput, setNewLicenseRewardAmountInput,
  // newLicenseRewardType, setNewLicenseRewardType: 未使用（ライセンス報酬の追加機能は現在実装されていない）
  
  // 削除確認ダイアログ用
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null)
  // deleteItemName, deleteItemType: 未使用のため削除
  
  // 移行確認ダイアログ用（未使用）
  // migrationDialogOpen, setMigrationDialogOpen, existingActiveReward, setExistingActiveReward: 未使用（移行確認ダイアログ機能は未実装）
  
  // hideLegacyRewards: 未使用のため削除

  // ライセンス報酬の「通常」設定バリデーション（未使用 - ItemizedSettingsコンポーネントで直接処理される）
  // validateLicenseNormalSetting: 未使用
  // @ts-expect-error - 未使用だが将来のバリデーション表示機能で使用予定
  const validateLicenseNormalSetting = () => {
    const hasNormalSetting = formData.license_rewards.some(reward => 
      reward.item === '通常' && (reward.status === 'active' || reward.status === 'ready')
    )
    const hasOtherSettings = formData.license_rewards.some(reward => 
      reward.item !== '通常' && (reward.status === 'active' || reward.status === 'ready')
    )
    
    if (hasOtherSettings && !hasNormalSetting) {
      return {
        hasError: true,
        message: '「通常」の設定が必要です。他の条件設定がある場合は、基本となる「通常」の設定を追加してください。'
      }
    }
    
    return { hasError: false, message: '' }
  }

  // licenseValidation: 未使用のため削除（将来のバリデーション表示機能で使用予定）

  // 参加費の「通常」設定バリデーション
  const validateParticipationNormalSetting = (items: Array<{ originalTimeSlot?: string; item?: string; status?: string }>) => {
    const hasNormalSetting = items.some(item => 
      (item.originalTimeSlot === '通常' || item.item === '通常') && (item.status === 'active' || item.status === 'ready')
    )
    const hasOtherSettings = items.some(item => 
      (item.originalTimeSlot !== '通常' && item.item !== '通常') && (item.status === 'active' || item.status === 'ready')
    )
    
    if (hasOtherSettings && !hasNormalSetting) {
      return {
        hasError: true,
        message: '「通常」の設定が必要です。他の時間帯設定がある場合は、基本となる「通常」の設定を追加してください。'
      }
    }
    
    return { hasError: false, message: '' }
  }

  // GM報酬用の選択肢
  const gmRoleOptions = [
    { value: 'main', label: 'メインGM' },
    { value: 'sub', label: 'サブGM' },
    { value: 'special1', label: '設定1' },
    { value: 'special2', label: '設定2' },
    { value: 'special3', label: '設定3' }
  ]

  // GM役割の英語値を日本語表示に変換
  // 画像アップロードハンドラー
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // ファイルバリデーション
    const validation = validateImageFile(file, 5)
    if (!validation.valid) {
      alert(validation.error)
      return
    }

    setUploading(true)
    try {
      const result = await uploadImage(file, 'key-visuals')
      if (result) {
        setFormData(prev => ({ ...prev, key_visual_url: result.url }))
      } else {
        alert('画像のアップロードに失敗しました')
      }
    } catch (error) {
      logger.error('画像アップロードエラー:', error)
      alert('画像のアップロードに失敗しました')
    } finally {
      setUploading(false)
      // inputをリセット
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
    }
  }

  // 画像削除ハンドラー
  const handleImageRemove = () => {
    if (confirm('画像を削除しますか？')) {
      setFormData(prev => ({ ...prev, key_visual_url: '' }))
    }
  }

  const getGmRoleLabel = (roleValue: string) => {
    const option = gmRoleOptions.find(opt => opt.value === roleValue)
    return option ? option.label : roleValue
  }

  // GM報酬の「メインGM」設定バリデーション
  const validateGmMainSetting = (items: Array<{ originalRole?: string; item?: string; status?: string }>) => {
    const hasMainSetting = items.some(item => 
      (item.originalRole === 'main' || item.item === 'メインGM') && (item.status === 'active' || item.status === 'ready')
    )
    const hasOtherSettings = items.some(item => 
      (item.originalRole !== 'main' && item.item !== 'メインGM') && (item.status === 'active' || item.status === 'ready')
    )
    
    if (hasOtherSettings && !hasMainSetting) {
      return {
        hasError: true,
        message: '「メインGM」の設定が必要です。他の役割設定がある場合は、基本となる「メインGM」の設定を追加してください。'
      }
    }
    
    return { hasError: false, message: '' }
  }
  
  
  
  // 参加費項目別入力用
  const [newParticipationCostTimeSlot, setNewParticipationCostTimeSlot] = useState<string>('通常')
  const [newParticipationCostAmount, setNewParticipationCostAmount] = useState(0)
  
  // showNewGmItem: 未使用のため削除（将来のGM追加UIで使用予定）
  

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
    setFormData(prev => {
      const newProps = prev.required_props.filter((prop, i) => i !== index && prop != null)
      return {
        ...prev,
        required_props: newProps
      }
    })
  }

  // ライセンス報酬管理（未使用 - ライセンス報酬はItemizedSettingsコンポーネントで管理）
  // addLicenseReward: 未使用（ライセンス報酬の追加機能は現在実装されていない）
  
  // handleDeleteClick: 未使用（削除機能はDeleteConfirmationDialogで直接処理される）

  const confirmDelete = (action: 'delete' | 'archive') => {
    if (deleteTargetIndex === null) return
    
    // reward: 未使用（将来の確認表示で使用予定）
    // const reward = formData.license_rewards[deleteTargetIndex]
    
    if (action === 'archive') {
      // アーカイブ: ステータスを「過去のみ」に変更
      setFormData(prev => ({
        ...prev,
        license_rewards: prev.license_rewards.map((item, i) => 
          i === deleteTargetIndex ? { ...item, status: 'legacy' as const } : item
        )
      }))
    } else {
      // 完全削除: 項目を完全に削除
      setFormData(prev => ({
        ...prev,
        license_rewards: prev.license_rewards.filter((_, i) => i !== deleteTargetIndex)
      }))
    }
    
    setDeleteDialogOpen(false)
    setDeleteTargetIndex(null)
  }

  // 移行確認後の処理（未使用）
  // handleLicenseMigrationConfirm, handleLicenseMigrationCancel: 未使用
  // migrationDialogOpen, existingActiveReward: 未使用（移行確認ダイアログ機能は未実装）


  // 個別GM削除ハンドラー（未使用 - ItemizedSettingsコンポーネントで直接処理される）
  // @ts-expect-error - 未使用だが将来の直接削除機能で使用予定
  const removeGmAssignment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      gm_count: prev.gm_count - 1,
      gm_assignments: prev.gm_assignments.filter((_, i) => i !== index)
    }))
  }


  // 参加費項目別管理（未使用 - ItemizedSettingsコンポーネントで直接処理される）
  // addParticipationCost: 未使用
  // @ts-expect-error - 未使用だが将来の直接追加機能で使用予定
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

  // removeParticipationCost: 未使用（ItemizedSettingsコンポーネントで直接処理されるため）
  
  // 参加費の新しいコンポーネント用ハンドラー（未使用）
  // handleParticipationCostsChange, handleNewParticipationCostChange, handleAddParticipationCost, 
  // handleClearNewParticipationCost: ItemizedSettingsコンポーネントで直接処理されるため未使用
  
  // GM設定の新しいコンポーネント用ハンドラー（未使用）
  // handleGmAssignmentsChange: ItemizedSettingsコンポーネントで直接処理されるため未使用

  // handleNewGmAssignmentChange: 未使用（ItemizedSettingsコンポーネントで直接処理される）
  // const handleNewGmAssignmentChange = (_newAssignment: ConditionalSetting) => {
  //   // 新しいGM配置の変更は特に処理しない（追加時に処理）
  // }

  // handleAddGmAssignment: 未使用（ItemizedSettingsコンポーネントで直接処理される）
  // @ts-expect-error - 未使用だが将来の直接追加機能で使用予定
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

  // handleRemoveGmAssignment: 未使用（ItemizedSettingsコンポーネントで直接処理される）
  // const handleRemoveGmAssignment = (index: number) => {
  //   removeGmAssignment(index)
  // }

  // handleClearNewGmAssignment: 未使用（ItemizedSettingsコンポーネントで直接処理される）
  // const handleClearNewGmAssignment = () => {
  //   // 新規入力欄をデフォルト状態にリセット
  // }

  // handleHideNewGmItem: 未使用（ItemizedSettingsコンポーネントで直接処理される）
  // const handleHideNewGmItem = () => {
  //   setShowNewGmItem(false)
  // }

  // GM役割に応じた説明文を生成（未使用）
  // getGmRoleDescription: 未使用（将来の説明表示機能で使用予定）
  // @ts-expect-error - 未使用だが将来の説明表示機能で使用予定
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


  // 参加費用の時間帯オプション
  const timeSlotOptions = [
    { value: '通常', label: '通常' },
    { value: 'GMテスト', label: 'GMテスト' },
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

  // ライセンス報酬の時間帯オプション（未使用）
  // licenseRewardOptions: 未使用（ライセンス報酬の追加機能は現在実装されていない）
  // @ts-expect-error - 未使用だが将来のライセンス報酬追加機能で使用予定
  const licenseRewardOptions = [
    { value: '通常', label: '通常' },
    { value: 'GMテスト', label: 'GMテスト' },
    { value: '土日祝', label: '土日祝' },
    { value: '特別', label: '特別' }
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

  // 現在必要な役割数に基づいてオプションを生成（未使用）
  // getCurrentGmRoleOptions: 未使用（ItemizedSettingsコンポーネントで直接処理される）
  // @ts-expect-error - 未使用だが将来の直接オプション生成機能で使用予定
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


  // 時間帯に応じた説明文を生成（参加費用）（未使用）
  // getTimeSlotDescription: 未使用（将来の説明表示機能で使用予定）
  // @ts-expect-error - 未使用だが将来の説明表示機能で使用予定
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
    if (amount >= 0) {
      return 'ready' // 金額設定済み、運用可能（0円も含む）
    }
    return 'unused' // 未設定（マイナス値など）
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
        license_amount: (scenario.license_amount ?? 0),
        gm_test_license_amount: (scenario.gm_test_license_amount ?? 0),
        license_rewards: [],
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
        },
        key_visual_url: scenario.key_visual_url || ''
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
        },
        key_visual_url: ''
      })
    }
  }, [scenario])


  // スタッフデータと担当関係データを取得
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingStaff(true)
        
        // スタッフデータを取得
        const staffData = await staffApi.getAll()
        setStaff(staffData)
        
        // 既存シナリオの場合、担当関係データを取得
        if (scenario?.id) {
          const assignments = await assignmentApi.getScenarioAssignments(scenario.id)
          setCurrentAssignments(assignments)
          // スタッフIDを設定
          setSelectedStaffIds(assignments.map(a => a.staff_id))
        } else {
          // 新規作成の場合は空に
          setCurrentAssignments([])
          setSelectedStaffIds([])
        }
      } catch (error) {
        logger.error('Error loading data:', error)
      } finally {
        setLoadingStaff(false)
      }
    }

    if (isOpen) {
      loadData()
    }
  }, [isOpen, scenario?.id])

  // モーダルが開かれる度に担当関係データを再取得
  useEffect(() => {
    const reloadAssignments = async () => {
      if (isOpen && scenario?.id) {
        try {
          const assignments = await assignmentApi.getScenarioAssignments(scenario.id)
          setCurrentAssignments(assignments)
          setSelectedStaffIds(assignments.map(a => a.staff_id))
        } catch (error) {
          logger.error('Error reloading assignments:', error)
        }
      }
    }

    if (isOpen) {
      reloadAssignments()
    }
  }, [isOpen])

  const handleSave = async () => {
    try {
      const totalProductionCost = formData.production_costs.reduce((sum, cost) => sum + cost.amount, 0)
      
      // 選択されたスタッフIDからスタッフ名を取得
      const selectedStaffNames = selectedStaffIds.map(staffId => {
        const staffMember = staff.find(s => s.id === staffId)
        return staffMember?.name || staffId
      }).filter(name => name && !name.includes('-')) // UUIDを除外
      
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
        license_amount: formData.license_amount || 0,
        gm_test_license_amount: formData.gm_test_license_amount || 0,
        license_rewards: [], // 空配列で保存（旧形式は使用しない）
        has_pre_reading: formData.has_pre_reading,
        gm_costs: formData.gm_assignments,
        available_gms: selectedStaffNames, // 選択されたGMの名前を保存
        // 柔軟な料金設定を保存
        flexible_pricing: formData.use_flexible_pricing ? formData.flexible_pricing : undefined,
        play_count: scenario?.play_count || 0,
        key_visual_url: formData.key_visual_url || undefined,
        created_at: scenario?.created_at || formatDateJST(getCurrentJST()),
        updated_at: formatDateJST(getCurrentJST())
      }

      // production_costsはローカルでのみ管理（データベースには保存しない）
      if (formData.production_costs.length > 0) {
        (updatedScenario as any).production_costs = formData.production_costs
      }

      // 担当GM関係をリレーションテーブルで更新
      if (updatedScenario.id) {
        const originalStaffIds = currentAssignments.map(a => a.staff_id).sort()
        const newStaffIds = [...selectedStaffIds].sort()
        
        // 担当GMが変更された場合、リレーションテーブルを更新
        if (JSON.stringify(originalStaffIds) !== JSON.stringify(newStaffIds)) {
          try {
            if (scenario?.id) {
              // 既存シナリオの場合
              await assignmentApi.updateScenarioAssignments(updatedScenario.id, selectedStaffIds)
            } else {
              // 新規作成の場合（保存後にIDが確定してから担当関係を追加）
              // 新規作成時はupdatedScenario.idが仮のIDなので、実際のシナリオ保存後に処理する
            }
          } catch (syncError) {
            logger.error('Error updating GM assignments:', syncError)
            alert('シナリオは保存されましたが、担当GMの更新に失敗しました。手動で確認してください。')
          }
        }
      }

      // シナリオを保存
      onSave(updatedScenario)
      onClose()
    } catch (error) {
      logger.error('Error saving scenario:', error)
      logger.error('Error details:', {
        message: (error as Error).message,
        stack: (error as Error).stack,
        error: error
      })
      alert('シナリオの保存に失敗しました: ' + (error as Error).message || 'Unknown error')
    }
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
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4 pb-2 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-blue-600">基本情報</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                {/* キービジュアル画像 */}
                <div className="flex-shrink-0">
                  <Label>キービジュアル</Label>
                  <div className="mt-2">
                    {formData.key_visual_url ? (
                      <div className="relative w-32 h-40 bg-gray-200 rounded overflow-hidden group">
                        <OptimizedImage
                          src={formData.key_visual_url}
                          alt="キービジュアル"
                          className="w-full h-full object-cover"
                          responsive={true}
                          srcSetSizes={[128, 256]}
                          breakpoints={{ mobile: 128, tablet: 128, desktop: 256 }}
                          useWebP={true}
                          quality={85}
                          fallback={
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                              No Image
                            </div>
                          }
                        />
                        <button
                          type="button"
                          onClick={handleImageRemove}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="画像を削除"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="w-32 h-40 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                        <Upload className="h-8 w-8 text-gray-400 mb-2" />
                        <span className="text-xs text-gray-500 text-center px-2">
                          {uploading ? 'アップロード中...' : '画像を選択'}
                        </span>
                        <input
                          ref={imageInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploading}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* タイトルと作者 */}
                <div className="flex-1 space-y-4">
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
          </div>

          {/* ゲーム設定 */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4 pb-2 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-green-600">ゲーム設定</h3>
            </div>
            
            <div className="space-y-6">
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

              {/* 参加費（項目別） */}
              <div className="mt-6">
                <ItemizedSettings
                  title="参加費"
                  subtitle="時間帯や曜日に応じて異なる参加費を設定できます"
                  items={formData.participation_costs.map(cost => ({
                    item: cost.time_slot,
                    amount: cost.amount,
                    type: cost.type,
                    status: cost.status,
                    usageCount: cost.usageCount,
                    originalTimeSlot: cost.time_slot, // 元の時間帯値を保持
                    startDate: cost.startDate, // 開始日を保持
                    endDate: cost.endDate // 終了日を保持
                  }))}
                  conditionOptions={timeSlotOptions}
                  showTypeSelector={true}
                  showHideLegacyToggle={true}
                  itemType="参加費"
                  scenarioName={formData.title}
                  getItemStatus={getItemStatus}
                  validateNormalSetting={(items) => validateParticipationNormalSetting(items)}
                  onItemsChange={(items) => setFormData(prev => ({ 
                    ...prev, 
                    participation_costs: items.map(item => ({
                      time_slot: item.originalTimeSlot || item.item, // 元の時間帯値を使用
                      amount: item.amount,
                      type: item.type || 'fixed',
                      status: item.status,
                      usageCount: item.usageCount,
                      startDate: item.startDate, // 開始日を保持
                      endDate: item.endDate // 終了日を保持
                    }))
                  }))}
                />
              </div>

              {/* ジャンル */}
              <div className="mt-6">
                <Label htmlFor="genre">ジャンル</Label>
                <MultiSelect
                  options={genreOptions}
                  selectedValues={formData.genre}
                  onSelectionChange={(value) => setFormData(prev => ({ ...prev, genre: value }))}
                  placeholder="ジャンルを選択してください"
                  showBadges={true}
                />
              </div>

              {/* 担当GM */}
              <div className="mt-6">
                <Label htmlFor="available_gms">担当GM</Label>
                <div className="text-xs text-muted-foreground mb-2">
                  担当開始時期は自動的に記録されます
                </div>
              {(() => {
                // 通常のGMスタッフ
                const activeGMs = staff.filter(s => Array.isArray(s.role) && s.role.includes('gm') && s.status === 'active')
                
                // 既に担当GMとして設定されているスタッフ（role/statusに関係なく含める）
                const assignedStaff = staff.filter(s => selectedStaffIds.includes(s.id))
                
                // 重複を除いて結合
                const allAvailableStaff = [...activeGMs]
                assignedStaff.forEach(assignedStaff => {
                  if (!allAvailableStaff.some(s => s.id === assignedStaff.id)) {
                    allAvailableStaff.push(assignedStaff)
                  }
                })
                
                const gmOptions = allAvailableStaff.map(staffMember => ({
                  id: staffMember.id,
                  name: staffMember.name,
                  displayInfo: `経験値${staffMember.experience} | ${staffMember.line_name || ''}${
                    !staffMember.role.includes('gm') || staffMember.status !== 'active' 
                      ? ' (非アクティブGM)' 
                      : ''
                  }`
                }))
                
                return (
                  <MultiSelect
                    options={gmOptions}
                    selectedValues={selectedStaffIds}
                    onSelectionChange={setSelectedStaffIds}
                    placeholder="担当GMを選択してください"
                    showBadges={true}
                    useIdAsValue={true}
                  />
                )
              })()}
            </div>

          </div>

          {/* コスト */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4 pb-2 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-orange-600">コスト</h3>
            </div>

            <div className="space-y-6">
                {/* GM報酬 */}
                <ItemizedSettings
                  title="GM報酬"
                  subtitle="役割に応じて異なる報酬を設定できます"
                  items={formData.gm_assignments.map(assignment => ({
                    item: getGmRoleLabel(assignment.role),
                    amount: assignment.reward,
                    type: 'fixed',
                    status: assignment.status,
                    usageCount: assignment.usageCount,
                    originalRole: assignment.role, // 元の英語値を保持
                    startDate: assignment.startDate, // 開始日を保持
                    endDate: assignment.endDate // 終了日を保持
                  }))}
                  conditionOptions={gmRoleOptions}
                  showTypeSelector={false}
                  showHideLegacyToggle={true}
                  itemType="GM報酬"
                  scenarioName={formData.title}
                  getItemStatus={getItemStatus}
                  validateNormalSetting={(items) => validateGmMainSetting(items)}
                  onItemsChange={(items) => setFormData(prev => ({ 
                    ...prev, 
                    gm_assignments: items.map(item => ({
                      role: item.originalRole || item.item, // 元の英語値を使用
                      reward: item.amount,
                      status: item.status,
                      usageCount: item.usageCount,
                      startDate: item.startDate, // 開始日を保持
                      endDate: item.endDate // 終了日を保持
                    }))
                  }))}
                />


                {/* 必要道具 */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-800">必要道具</h4>
                  <div className="flex gap-2">
                    <Input
                      placeholder="道具名"
                      value={newRequiredPropItem}
                      onChange={(e) => setNewRequiredPropItem(e.target.value)}
                      className="flex-1"
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
                    <Input
                      type="text"
                      placeholder="円"
                      value={formatCurrency(newRequiredPropAmount || 0)}
                      onChange={(e) => setNewRequiredPropAmount(parseCurrency(e.target.value))}
                      className="w-[120px]"
                    />
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
                      {formData.required_props.filter(prop => prop != null).map((prop, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {prop?.item || ''}: {formatCurrency(prop?.amount || 0)}
                            </span>
                            <Badge 
                              variant={prop?.frequency === 'recurring' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {prop?.frequency === 'recurring' ? '毎回' : '1回のみ'}
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
                  <div>
                    <h4 className="font-medium text-gray-800">ライセンス報酬</h4>
                    <p className="text-xs text-muted-foreground">作者に支払うライセンス料を設定します</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="license_amount">通常ライセンス料</Label>
                      <div className="relative">
                        <Input
                          id="license_amount"
                          type="number"
                          min="0"
                          step="100"
                          value={formData.license_amount || 0}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            license_amount: parseInt(e.target.value) || 0 
                          }))}
                          className="pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          円
                        </span>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="gm_test_license_amount">GMテストライセンス料</Label>
                      <div className="relative">
                        <Input
                          id="gm_test_license_amount"
                          type="number"
                          min="0"
                          step="100"
                          value={formData.gm_test_license_amount || 0}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            gm_test_license_amount: parseInt(e.target.value) || 0 
                          }))}
                          className="pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          円
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        GMが練習用に実施する公演のライセンス料
                      </p>
                    </div>
                  </div>
                </div>

                {/* 制作費・購入費 */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-800">制作費・購入費</h4>
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
                      <h4 className="font-medium text-gray-800">料金修正ルール</h4>
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

        <div className="flex justify-end space-x-2 pt-6 mt-6 border-t border-gray-200">
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

      </DialogContent>
    </Dialog>
  )
}
