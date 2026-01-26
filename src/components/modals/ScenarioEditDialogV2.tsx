import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Save, FileText, Gamepad2, Coins, Users, TrendingUp, CalendarDays, ChevronLeft, ChevronRight, BookOpen, Shield, RefreshCw, ArrowUp } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ScenarioMasterEditDialog } from './ScenarioMasterEditDialog'
import { MasterSelectDialog } from './MasterSelectDialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useScenariosQuery, useScenarioMutation, useDeleteScenarioMutation } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { scenarioMasterApi, type ScenarioMaster } from '@/lib/api/scenarioMasterApi'

// V2セクションコンポーネント（カード形式でレイアウト改善）
import { BasicInfoSectionV2 } from './ScenarioEditDialogV2/sections/BasicInfoSectionV2'
import { GameInfoSectionV2 } from './ScenarioEditDialogV2/sections/GameInfoSectionV2'
import { PricingSectionV2 } from './ScenarioEditDialogV2/sections/PricingSectionV2'
import { GmSettingsSectionV2 } from './ScenarioEditDialogV2/sections/GmSettingsSectionV2'
import { CostsPropsSectionV2 } from './ScenarioEditDialogV2/sections/CostsPropsSectionV2'
import { PerformancesSectionV2 } from './ScenarioEditDialogV2/sections/PerformancesSectionV2'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

// API関連
import { staffApi, scenarioApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId, getCurrentOrganization } from '@/lib/organization'
import type { Staff } from '@/types'

interface ScenarioEditDialogV2Props {
  isOpen: boolean
  onClose: () => void
  scenarioId: string | null
  onSaved?: () => void
  onScenarioChange?: (scenarioId: string | null) => void
  /** ソートされたシナリオIDリスト（矢印キーでの切り替えに使用） */
  sortedScenarioIds?: string[]
}

// タブ定義
const TABS = [
  { id: 'basic', label: '基本情報', icon: FileText },
  { id: 'game', label: 'ゲーム設定', icon: Gamepad2 },
  { id: 'pricing', label: '料金', icon: Coins },
  { id: 'gm', label: 'GM', icon: Users },
  { id: 'costs', label: '売上', icon: TrendingUp },
  { id: 'performances', label: '公演実績', icon: CalendarDays },
] as const

type TabId = typeof TABS[number]['id']

// localStorageからタブを取得する関数
const getSavedTab = (): TabId => {
  const saved = localStorage.getItem('scenarioEditDialogTab')
  if (saved && ['basic', 'game', 'pricing', 'gm', 'costs', 'performances'].includes(saved)) {
    return saved as TabId
  }
  return 'basic'
}

export function ScenarioEditDialogV2({ isOpen, onClose, scenarioId, onSaved, onScenarioChange, sortedScenarioIds }: ScenarioEditDialogV2Props) {
  // 初期値をlocalStorageから取得（コンポーネントマウント時に正しいタブを表示）
  const [activeTab, setActiveTab] = useState<TabId>(getSavedTab)
  
  // ダイアログを開く度、またはシナリオが変わった時にタブを復元
  useEffect(() => {
    if (isOpen) {
      setActiveTab(getSavedTab())
    }
  }, [isOpen, scenarioId])

  const [formData, setFormData] = useState<ScenarioFormData>({
    title: '',
    slug: '',
    author: '',
    author_email: '',
    description: '',
    duration: 120,
    player_count_min: 8,
    player_count_max: 8,
    difficulty: 3,
    rating: undefined,
    status: 'available',
    participation_fee: 3000,
    production_costs: [
      { item: 'キット', amount: 30000 },
      { item: 'マニュアル', amount: 10000 },
      { item: 'スライド', amount: 10000 },
    ],
    kit_count: 1,
    depreciation_per_performance: 0,
    genre: [],
    required_props: [],
    license_amount: 0,
    gm_test_license_amount: 0,
    license_rewards: [
      { item: 'normal', amount: 0, type: 'fixed' },
      { item: 'gmtest', amount: 0, type: 'fixed' }
    ],
    has_pre_reading: false,
    gm_count: 1,
    gm_assignments: [],  // 空配列 = デフォルト報酬を使用
    participation_costs: [
      { time_slot: 'normal', amount: 4000, type: 'fixed' },
      { time_slot: 'gmtest', amount: 3000, type: 'fixed' },
    ],
    use_flexible_pricing: false,
    flexible_pricing: {
      base_pricing: { participation_fee: 3000 },
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

  const { data: scenarios = [] } = useScenariosQuery()
  const scenarioMutation = useScenarioMutation()
  const deleteMutation = useDeleteScenarioMutation()
  const { user } = useAuth()
  const isLicenseAdmin = user?.role === 'license_admin'
  
  // マスター編集ダイアログ（MMQ運営者用）
  const [masterEditDialogOpen, setMasterEditDialogOpen] = useState(false)
  
  // マスターデータ（相違検出用）
  const [masterData, setMasterData] = useState<ScenarioMaster | null>(null)
  const [loadingMaster, setLoadingMaster] = useState(false)
  
  // 現在編集中のシナリオ（マスター編集用） - useEffectより前に定義する必要あり
  const currentScenario = scenarioId 
    ? scenarios.find(s => s.id === scenarioId || s.scenario_master_id === scenarioId) 
    : null
  const currentMasterId = currentScenario?.scenario_master_id || formData.scenario_master_id
  
  // 組織名を取得
  const [organizationName, setOrganizationName] = useState<string>('')
  useEffect(() => {
    const fetchOrg = async () => {
      const org = await getCurrentOrganization()
      setOrganizationName(org?.name || '')
    }
    fetchOrg()
  }, [])

  // マスターデータを取得（相違検出用）
  useEffect(() => {
    const fetchMaster = async () => {
      const masterId = currentScenario?.scenario_master_id || formData.scenario_master_id
      if (!masterId || !isOpen) {
        setMasterData(null)
        return
      }
      
      try {
        setLoadingMaster(true)
        const data = await scenarioMasterApi.getById(masterId)
        setMasterData(data)
      } catch (error) {
        logger.error('マスターデータ取得エラー:', error)
        setMasterData(null)
      } finally {
        setLoadingMaster(false)
      }
    }
    
    fetchMaster()
  }, [isOpen, scenarioId, currentScenario?.scenario_master_id, formData.scenario_master_id])

  // マスターとの相違を検出
  const masterDiffs = useMemo(() => {
    if (!masterData) return { count: 0, fields: {} as Record<string, { master: any; current: any }>, byTab: {} as Record<string, number> }
    
    const diffs: Record<string, { master: any; current: any }> = {}
    
    // 比較対象フィールドとタブのマッピング
    const fieldToTab: Record<string, string> = {
      title: 'basic',
      author: 'basic',
      description: 'basic',
      key_visual_url: 'basic',
      duration: 'game',
      player_count_min: 'game',
      player_count_max: 'game',
      genre: 'game',
    }
    
    // 比較対象フィールド
    if (masterData.title !== formData.title) {
      diffs.title = { master: masterData.title, current: formData.title }
    }
    if (masterData.author !== formData.author) {
      diffs.author = { master: masterData.author, current: formData.author }
    }
    if (masterData.description !== formData.description) {
      diffs.description = { master: masterData.description, current: formData.description }
    }
    if (masterData.key_visual_url !== formData.key_visual_url) {
      diffs.key_visual_url = { master: masterData.key_visual_url, current: formData.key_visual_url }
    }
    if (masterData.official_duration !== formData.duration) {
      diffs.duration = { master: masterData.official_duration, current: formData.duration }
    }
    if (masterData.player_count_min !== formData.player_count_min) {
      diffs.player_count_min = { master: masterData.player_count_min, current: formData.player_count_min }
    }
    if (masterData.player_count_max !== formData.player_count_max) {
      diffs.player_count_max = { master: masterData.player_count_max, current: formData.player_count_max }
    }
    if (JSON.stringify(masterData.genre || []) !== JSON.stringify(formData.genre || [])) {
      diffs.genre = { master: masterData.genre, current: formData.genre }
    }
    
    // タブごとの相違件数を計算
    const byTab: Record<string, number> = {}
    for (const field of Object.keys(diffs)) {
      const tab = fieldToTab[field] || 'basic'
      byTab[tab] = (byTab[tab] || 0) + 1
    }
    
    return { count: Object.keys(diffs).length, fields: diffs, byTab }
  }, [masterData, formData])

  // マスターから同期
  const handleSyncFromMaster = () => {
    if (!masterData) return
    
    setFormData(prev => ({
      ...prev,
      title: masterData.title || prev.title,
      author: masterData.author || prev.author,
      description: masterData.description || prev.description,
      key_visual_url: masterData.key_visual_url || prev.key_visual_url,
      duration: masterData.official_duration || prev.duration,
      player_count_min: masterData.player_count_min || prev.player_count_min,
      player_count_max: masterData.player_count_max || prev.player_count_max,
      genre: masterData.genre || prev.genre,
    }))
    showToast.success('マスターから同期しました')
  }

  // マスターに反映
  const handleApplyToMaster = async () => {
    if (!currentMasterId) return
    
    const confirmed = window.confirm(
      `現在の編集内容をマスターに反映しますか？\n\n` +
      `この操作により、他の組織がこのシナリオを引用した際に、更新された情報が適用されます。`
    )
    if (!confirmed) return
    
    try {
      await scenarioMasterApi.update(currentMasterId, {
        title: formData.title,
        author: formData.author,
        description: formData.description,
        key_visual_url: formData.key_visual_url,
        official_duration: formData.duration,
        player_count_min: formData.player_count_min,
        player_count_max: formData.player_count_max,
        genre: formData.genre,
      })
      
      // マスターデータを再取得
      const updatedMaster = await scenarioMasterApi.getById(currentMasterId)
      setMasterData(updatedMaster)
      
      showToast.success('マスターに反映しました')
    } catch (error) {
      logger.error('マスター更新エラー:', error)
      showToast.error('マスターへの反映に失敗しました')
    }
  }

  // ソートされたシナリオIDリスト（sortedScenarioIdsがあればそれを使用、なければscenariosから生成）
  const scenarioIdList = sortedScenarioIds ?? scenarios.map(s => s.id)

  // 物理矢印キーでシナリオを切り替え（captureフェーズで登録）
  useEffect(() => {
    if (!isOpen || !onScenarioChange || !scenarioId || scenarioIdList.length <= 1) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力フィールドにフォーカスがある場合は無視
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return
      }
      
      // contenteditable要素も無視
      if (target.isContentEditable) {
        return
      }

      const currentIndex = scenarioIdList.indexOf(scenarioId)

      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault()
        e.stopPropagation()
        onScenarioChange(scenarioIdList[currentIndex - 1])
      } else if (e.key === 'ArrowRight' && currentIndex < scenarioIdList.length - 1) {
        e.preventDefault()
        e.stopPropagation()
        onScenarioChange(scenarioIdList[currentIndex + 1])
      }
    }

    // captureフェーズで登録して、他のコンポーネントより先にキャッチ
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onScenarioChange, scenarioId, scenarioIdList])

  // スタッフデータ用のstate
  const [staff, setStaff] = useState<Staff[]>([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  
  // 担当関係データ用のstate
  const [currentAssignments, setCurrentAssignments] = useState<any[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  // ローディング状態
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
  
  // 保存成功メッセージ
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  
  // マスタ選択ダイアログ
  const [masterSelectOpen, setMasterSelectOpen] = useState(false)
  
  // マスタから引用
  const handleMasterSelect = (master: any) => {
    setFormData(prev => ({
      ...prev,
      scenario_master_id: master.id,  // マスタIDを記録
      title: master.title || prev.title,
      author: master.author || prev.author,
      description: master.description || prev.description,
      duration: master.official_duration || prev.duration,
      player_count_min: master.player_count_min || prev.player_count_min,
      player_count_max: master.player_count_max || prev.player_count_max,
      difficulty: master.difficulty ? parseInt(master.difficulty) : prev.difficulty,
      genre: master.genre || prev.genre,
      key_visual_url: master.key_visual_url || prev.key_visual_url
    }))
    showToast.success('マスタから情報を引用しました')
  }
  
  // 削除確認ダイアログ
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // シナリオ統計情報
  const [scenarioStats, setScenarioStats] = useState({
    performanceCount: 0,
    cancelledCount: 0,
    totalRevenue: 0,
    totalParticipants: 0,
    totalStaffParticipants: 0,
    totalGmCost: 0,
    totalLicenseCost: 0,
    firstPerformanceDate: null as string | null,
    performanceDates: [] as Array<{ date: string; category: string; participants: number; demoParticipants: number; staffParticipants: number; revenue: number; startTime: string; storeId: string | null; isCancelled: boolean }>
  })

  // 担当GMのメイン/サブ設定を更新するハンドラ
  const handleAssignmentUpdate = (staffId: string, field: 'can_main_gm' | 'can_sub_gm', value: boolean) => {
    setCurrentAssignments(prev => {
      const existing = prev.find(a => a.staff_id === staffId)
      if (existing) {
        return prev.map(a => 
          a.staff_id === staffId ? { ...a, [field]: value } : a
        )
      } else {
        // 新規追加の場合
        return [...prev, {
          staff_id: staffId,
          can_main_gm: field === 'can_main_gm' ? value : true,
          can_sub_gm: field === 'can_sub_gm' ? value : true
        }]
      }
    })
  }


  // スタッフデータと担当関係データを取得
  useEffect(() => {
    const loadStaffData = async () => {
      try {
        setLoadingStaff(true)
        const staffData = await staffApi.getAll()
        setStaff(staffData)
      } catch (error) {
        logger.error('Error loading staff data:', error)
      } finally {
        setLoadingStaff(false)
      }
    }

    if (isOpen) {
      loadStaffData()
    }
  }, [isOpen])

  // シナリオIDが変わった時（またはモーダルが開いた時）に担当関係と累計公演回数を取得
  useEffect(() => {
    const loadAssignments = async () => {
      if (isOpen && scenarioId) {
        try {
          setIsLoadingAssignments(true)
          const assignments = await assignmentApi.getScenarioAssignments(scenarioId)
          setCurrentAssignments(assignments)
          setSelectedStaffIds(assignments.map(a => a.staff_id))
          
          // 統計情報を取得
          try {
            const stats = await scenarioApi.getScenarioStats(scenarioId)
            setScenarioStats(stats)
          } catch (statsError) {
            logger.error('Error loading scenario stats:', statsError)
            // フォールバック: 公演回数だけ取得
            const count = await scenarioApi.getPerformanceCount(scenarioId)
            setScenarioStats(prev => ({ ...prev, performanceCount: count }))
          }
        } catch (error) {
          logger.error('Error loading assignments:', error)
        } finally {
          setIsLoadingAssignments(false)
        }
      } else {
        // 新規作成時またはIDなし
        setCurrentAssignments([])
        setSelectedStaffIds([])
        setIsLoadingAssignments(false)
        setScenarioStats({
          performanceCount: 0,
          cancelledCount: 0,
          totalRevenue: 0,
          totalParticipants: 0,
          totalStaffParticipants: 0,
          totalGmCost: 0,
          totalLicenseCost: 0,
          firstPerformanceDate: null,
          performanceDates: []
        })
      }
    }

    if (isOpen) {
      loadAssignments()
    }
  }, [isOpen, scenarioId])

  // シナリオデータをロード
  useEffect(() => {
    // ダイアログが閉じている時は何もしない
    if (!isOpen) return

    // scenariosがまだ読み込まれていない場合は待つ
    if (scenarios.length === 0) return

    if (scenarioId) {
      // scenario_master_id または id で検索（新UI/旧UI両対応）
      const scenario = scenarios.find(s => s.id === scenarioId || s.scenario_master_id === scenarioId)
      if (scenario) {
        // データをフォームにマッピング
        // participation_costs：DBに存在する場合は使用、なければ生成
        const normalFee = scenario.participation_fee || 3000
        const existingCosts = scenario.participation_costs || []
        const hasGmTest = existingCosts.some((c: any) => c.time_slot === 'gmtest')
        const participationCosts = existingCosts.length > 0
          ? hasGmTest 
            ? existingCosts 
            : [...existingCosts, { time_slot: 'gmtest', amount: Math.max(0, normalFee - 1000), type: 'fixed' as const }]
          : [
              { time_slot: 'normal', amount: normalFee, type: 'fixed' as const },
              { time_slot: 'gmtest', amount: Math.max(0, normalFee - 1000), type: 'fixed' as const }
            ]

        // license_rewards は DB に存在しないため、常に license_amount から生成
        const licenseRewards = [
          { item: 'normal', amount: (scenario.license_amount ?? 0), type: 'fixed' as const },
          { item: 'gmtest', amount: (scenario.gm_test_license_amount ?? 0), type: 'fixed' as const }
        ]
        
        // デフォルトのflexible_pricingを定義
        const defaultFlexiblePricing = {
          base_pricing: { participation_fee: 3000 },
          pricing_modifiers: [],
          gm_configuration: {
            required_count: 1,
            optional_count: 0,
            total_max: 2,
            special_requirements: ''
          }
        }
        
        setFormData({
          title: scenario.title || '',
          slug: scenario.slug || '',
          author: scenario.author || '',
          author_email: scenario.author_email || '',
          scenario_master_id: scenario.scenario_master_id ?? undefined, // organization_scenarios連携用
          description: scenario.description || '',
          duration: scenario.duration || 120,
          player_count_min: scenario.player_count_min || 4,
          player_count_max: scenario.player_count_max || 8,
          difficulty: scenario.difficulty || 3,
          rating: scenario.rating,
          status: scenario.status || 'available',
          participation_fee: scenario.participation_fee || 3000,
          production_costs: (scenario.production_costs && scenario.production_costs.length > 0) 
            ? scenario.production_costs 
            : [
                { item: 'キット', amount: 30000 },
                { item: 'マニュアル', amount: 10000 },
                { item: 'スライド', amount: 10000 },
              ],
          kit_count: scenario.kit_count || 1,
          depreciation_per_performance: scenario.depreciation_per_performance || 0,
          genre: scenario.genre || [],
          required_props: scenario.required_props || [],
          license_amount: (scenario.license_amount ?? 0),
          gm_test_license_amount: (scenario.gm_test_license_amount ?? 0),
          scenario_type: scenario.scenario_type || 'normal',
          franchise_license_amount: scenario.franchise_license_amount,
          franchise_gm_test_license_amount: scenario.franchise_gm_test_license_amount,
          external_license_amount: scenario.external_license_amount,
          external_gm_test_license_amount: scenario.external_gm_test_license_amount,
          // franchise_license_rewards は DB に存在しないため、常に franchise_license_amount から生成
          // 0円でも表示する（null/undefinedの場合は0円）
          franchise_license_rewards: [
            { 
              item: 'normal', 
              amount: (scenario.franchise_license_amount != null ? scenario.franchise_license_amount : 0), 
              type: 'fixed' as const 
            },
            { 
              item: 'gmtest', 
              amount: (scenario.franchise_gm_test_license_amount != null ? scenario.franchise_gm_test_license_amount : 0), 
              type: 'fixed' as const 
            }
          ],
          license_rewards: licenseRewards,
          has_pre_reading: scenario.has_pre_reading || false,
          gm_count: scenario.gm_count || 1, // フォーム専用フィールド
          gm_assignments: (scenario.gm_costs && scenario.gm_costs.length > 0) 
            ? scenario.gm_costs.map(cost => ({
                role: cost.role,
                reward: cost.reward,
                category: cost.category || 'normal' as 'normal' | 'gmtest'
              }))
            : [],  // 空配列 = デフォルト報酬を使用
          participation_costs: participationCosts,
          use_flexible_pricing: scenario.use_flexible_pricing || false, // フォーム専用フィールド
          flexible_pricing: scenario.flexible_pricing || defaultFlexiblePricing,
          key_visual_url: scenario.key_visual_url || '',
          available_stores: scenario.available_stores || []
        })
      }
    } else {
      // 新規作成時は初期値にリセット
      setFormData({
        title: '',
        slug: '',
        author: '',
        author_email: '',
        description: '',
        duration: 120,
        player_count_min: 8,
        player_count_max: 8,
        difficulty: 3,
        rating: undefined,
        status: 'available',
        participation_fee: 3000,
        production_costs: [
          { item: 'キット', amount: 30000 },
          { item: 'マニュアル', amount: 10000 },
          { item: 'スライド', amount: 10000 },
        ],
        kit_count: 1,
        genre: [],
        required_props: [],
        license_amount: 0,
        gm_test_license_amount: 0,
        scenario_type: 'normal',
        franchise_license_amount: undefined,
        franchise_gm_test_license_amount: undefined,
        // デフォルトで0円のエントリを2つ作成（通常公演とGMテスト）
        franchise_license_rewards: [
          { item: 'normal', amount: 0, type: 'fixed' as const },
          { item: 'gmtest', amount: 0, type: 'fixed' as const }
        ],
        license_rewards: [
          { item: 'normal', amount: 0, type: 'fixed' },
          { item: 'gmtest', amount: 0, type: 'fixed' }
        ],
        has_pre_reading: false,
        gm_count: 1,
        gm_assignments: [],  // 空配列 = デフォルト報酬を使用
        participation_costs: [
      { time_slot: 'normal', amount: 4000, type: 'fixed' },
      { time_slot: 'gmtest', amount: 3000, type: 'fixed' },
    ],
        use_flexible_pricing: false,
        flexible_pricing: {
          base_pricing: { participation_fee: 3000 },
          pricing_modifiers: [],
          gm_configuration: {
            required_count: 1,
            optional_count: 0,
            total_max: 2,
            special_requirements: ''
          }
        },
        key_visual_url: '',
        available_stores: []
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scenarioId, scenarios.length])

  const handleSave = async (statusOverride?: 'available' | 'unavailable' | 'draft') => {
    if (!formData.title.trim()) {
      showToast.warning('タイトルを入力してください')
      setActiveTab('basic')
      return
    }

    // ステータスを上書き（下書き保存の場合）
    const saveStatus = statusOverride || formData.status

    try {
      // データベースに存在しないUI専用フィールドを除外
      const { 
        gm_assignments,
        use_flexible_pricing, 
        flexible_pricing,
        participation_costs,
        license_rewards,
        franchise_license_rewards,
        ...dbFields 
      } = formData
      
      // UI専用配列からDB用の単一値に変換
      const normalParticipationCost = formData.participation_costs?.find(c => c.time_slot === 'normal')
      const normalLicenseReward = formData.license_rewards?.find(r => r.item === 'normal')
      const gmtestLicenseReward = formData.license_rewards?.find(r => r.item === 'gmtest')
      const normalFranchiseLicenseReward = formData.franchise_license_rewards?.find(r => r.item === 'normal')
      const gmtestFranchiseLicenseReward = formData.franchise_license_rewards?.find(r => r.item === 'gmtest')
      
      const scenarioData: any = {
        ...dbFields,
        // ステータスを上書き
        status: saveStatus,
        // slugが空文字列の場合はnullとして保存
        slug: dbFields.slug?.trim() || null,
        participation_fee: normalParticipationCost?.amount || formData.participation_fee || 3000,
        // 参加費設定（時間帯別料金）を保存
        participation_costs: formData.participation_costs || [],
        license_amount: (normalLicenseReward?.amount ?? formData.license_amount ?? 0),
        gm_test_license_amount: (gmtestLicenseReward?.amount ?? formData.gm_test_license_amount ?? 0),
        scenario_type: formData.scenario_type || 'normal',
        // フランチャイズ用ライセンス金額: 配列から取得、なければ従来のフィールドから
        // 0円も保存するため、?? を使用（|| だと0が falsy で null になってしまう）
        franchise_license_amount: normalFranchiseLicenseReward?.amount ?? formData.franchise_license_amount ?? null,
        franchise_gm_test_license_amount: gmtestFranchiseLicenseReward?.amount ?? formData.franchise_gm_test_license_amount ?? null,
        gm_costs: formData.gm_assignments.map(assignment => ({
          role: assignment.role,
          reward: assignment.reward,
          ...(assignment.category && { category: assignment.category })
        })),
        // 公演可能店舗
        available_stores: formData.available_stores || [],
        updated_at: new Date().toISOString()
      }

      if (scenarioId) {
        scenarioData.id = scenarioId
      }
      
      const result = await scenarioMutation.mutateAsync({
        scenario: scenarioData,
        isEdit: !!scenarioId
      })

      // 担当GMの更新処理
      // 編集モードの場合、または新規作成でIDが取得できた場合
      // result は mutation の戻り値だが、Supabase の戻り値が含まれているか確認が必要
      // useScenarioMutation の実装によっては result が void の可能性もあるが、
      // とりあえず編集モード (scenarioIdがある) 場合は確実に実行
      const targetScenarioId = scenarioId || (result && typeof result === 'object' && 'id' in result ? result.id : undefined)

      if (targetScenarioId) {
        try {
          // 担当GMの更新（メイン/サブ設定含む）
          // 1. まず削除対象を特定
          const originalStaffIds = currentAssignments.map(a => a.staff_id)
          const toDelete = originalStaffIds.filter(id => !selectedStaffIds.includes(id))
          const toAdd = selectedStaffIds.filter(id => !originalStaffIds.includes(id))
          
          // 削除
          for (const staffId of toDelete) {
            await assignmentApi.removeAssignment(staffId, targetScenarioId)
          }
          
          // 追加（新しいスタッフ）
          for (const staffId of toAdd) {
            const assignment = currentAssignments.find(a => a.staff_id === staffId)
            const can_main_gm = assignment?.can_main_gm ?? true
            const can_sub_gm = assignment?.can_sub_gm ?? true
            await assignmentApi.addAssignment(staffId, targetScenarioId)
            // 追加後にフラグを更新
            await supabase
              .from('staff_scenario_assignments')
              .update({ can_main_gm, can_sub_gm })
              .eq('staff_id', staffId)
              .eq('scenario_id', targetScenarioId)
          }
          
          // 既存スタッフのメイン/サブ設定を更新
          for (const staffId of selectedStaffIds.filter(id => originalStaffIds.includes(id))) {
            const assignment = currentAssignments.find(a => a.staff_id === staffId)
            if (assignment) {
              await supabase
                .from('staff_scenario_assignments')
                .update({ 
                  can_main_gm: assignment.can_main_gm ?? true, 
                  can_sub_gm: assignment.can_sub_gm ?? true 
                })
                .eq('staff_id', staffId)
                .eq('scenario_id', targetScenarioId)
            }
          }
        } catch (syncError) {
          logger.error('Error updating GM assignments:', syncError)
          showToast.warning('シナリオは保存されました', '担当GMの更新に失敗しました。手動で確認してください')
        }
      }

      // マスタから引用した場合、organization_scenariosにも登録
      if (formData.scenario_master_id && targetScenarioId) {
        try {
          const organizationId = await getCurrentOrganizationId()
          if (!organizationId) {
            logger.warn('organization_id取得失敗: organization_scenariosへの登録をスキップ')
          } else {
            // 既存のレコードがあるか確認
            const { data: existingOrgScenario } = await supabase
              .from('organization_scenarios')
              .select('id')
              .eq('scenario_master_id', formData.scenario_master_id)
              .eq('organization_id', organizationId)
              .maybeSingle()
            
            if (!existingOrgScenario) {
              // organization_scenariosに登録
              const { error: orgScenarioError } = await supabase
                .from('organization_scenarios')
                .insert({
                  organization_id: organizationId,
                  scenario_master_id: formData.scenario_master_id,
                  slug: scenarioData.slug,
                  duration: scenarioData.duration,
                  participation_fee: scenarioData.participation_fee,
                  extra_preparation_time: scenarioData.extra_preparation_time || 30,
                  org_status: saveStatus === 'draft' ? 'coming_soon' : (saveStatus === 'available' ? 'available' : 'unavailable'),
                  available_stores: scenarioData.available_stores || [],
                  participation_costs: scenarioData.participation_costs || [],
                  gm_costs: scenarioData.gm_costs || []
                })
              
              if (orgScenarioError) {
                logger.error('organization_scenarios登録エラー:', orgScenarioError)
              } else {
                logger.log('organization_scenariosに登録しました')
              }
            } else {
              // 既存レコードがある場合は更新
              const { error: updateError } = await supabase
                .from('organization_scenarios')
                .update({
                  slug: scenarioData.slug,
                  duration: scenarioData.duration,
                  participation_fee: scenarioData.participation_fee,
                  extra_preparation_time: scenarioData.extra_preparation_time || 30,
                  org_status: saveStatus === 'draft' ? 'coming_soon' : (saveStatus === 'available' ? 'available' : 'unavailable'),
                  available_stores: scenarioData.available_stores || [],
                  participation_costs: scenarioData.participation_costs || [],
                  gm_costs: scenarioData.gm_costs || [],
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingOrgScenario.id)
              
              if (updateError) {
                logger.error('organization_scenarios更新エラー:', updateError)
              } else {
                logger.log('organization_scenariosを更新しました', { gm_costs: scenarioData.gm_costs })
              }
            }
          }
        } catch (orgErr) {
          logger.error('organization_scenarios処理エラー:', orgErr)
        }
      }

      // 新規作成の場合、シナリオIDを親に通知して編集モードに切り替え
      // これにより、scenarios.length が変わってもフォームがリセットされない
      if (!scenarioId && targetScenarioId && onScenarioChange) {
        logger.log('🔄 新規作成完了: 編集モードに切り替え', targetScenarioId)
        onScenarioChange(targetScenarioId)
      }

      // 保存完了通知
      if (onSaved) {
        try { 
          await onSaved() 
        } catch (err) {
          logger.error('onSavedコールバックエラー:', err)
        }
      }
      // ステータスをformDataにも反映
      setFormData(prev => ({ ...prev, status: saveStatus }))
      
      // 保存成功メッセージを表示（3秒後に消える）
      const msg = saveStatus === 'draft' ? '下書き保存しました' : '保存しました'
      setSaveMessage(msg)
      setTimeout(() => setSaveMessage(null), 3000)
      // ダイアログは閉じない（保存後も編集を続けられるように）
    } catch (err: unknown) {
      logger.error('詳細エラー:', err)
      logger.error('シナリオ保存エラー:', err)
      
      // エラーメッセージを日本語に変換
      let errorMessage = err instanceof Error ? err.message : ''
      if (typeof err === 'object' && err !== null && 'code' in err) {
        const errorObj = err as { code: string; message?: string }
        if (errorObj.code === '23505') {
          // 一意制約違反
          if (errorObj.message?.includes('scenarios_title_unique')) {
            errorMessage = '同じタイトルのシナリオが既に存在します。別のタイトルを入力してください。'
          } else if (errorObj.message?.includes('scenarios_slug')) {
            errorMessage = '同じslugのシナリオが既に存在します。別のslugを入力してください。'
          } else {
            errorMessage = '重複するデータが存在します。'
          }
        } else if (errorObj.code === '23514') {
          // CHECK制約違反
          errorMessage = '入力値が無効です。ステータスなどの設定を確認してください。'
        } else {
          errorMessage = errorObj.message || 'データベースエラーが発生しました'
        }
      }
      
      showToast.error('保存に失敗しました', errorMessage || '不明なエラー')
    }
  }

  // シナリオ削除ハンドラ
  const handleDelete = async () => {
    if (!scenarioId) return
    
    if (!window.confirm(`「${formData.title}」を削除しますか？\nこの操作は取り消せません。`)) {
      return
    }
    
    try {
      await deleteMutation.mutateAsync(scenarioId)
      showToast.success('シナリオを削除しました')
      onClose()
    } catch (err) {
      logger.error('シナリオ削除エラー:', err)
      showToast.error('削除に失敗しました')
    }
  }

  // タブコンテンツをレンダリング（V2セクション使用）
  const renderTabContent = (tabId: TabId) => {
    switch (tabId) {
      case 'basic':
        return <BasicInfoSectionV2 formData={formData} setFormData={setFormData} scenarioId={scenarioId} onDelete={handleDelete} />
      case 'game':
        return <GameInfoSectionV2 formData={formData} setFormData={setFormData} />
      case 'pricing':
        return <PricingSectionV2 formData={formData} setFormData={setFormData} />
      case 'gm':
        return (
          <GmSettingsSectionV2 
            formData={formData} 
            setFormData={setFormData} 
            staff={staff}
            loadingStaff={loadingStaff}
            selectedStaffIds={selectedStaffIds}
            onStaffSelectionChange={setSelectedStaffIds}
            currentAssignments={currentAssignments}
            onAssignmentUpdate={handleAssignmentUpdate}
          />
        )
      case 'costs':
        return <CostsPropsSectionV2 formData={formData} setFormData={setFormData} scenarioStats={scenarioStats} />
      case 'performances':
        return (
          <PerformancesSectionV2 
            performanceDates={scenarioStats.performanceDates}
            participationCosts={formData.participation_costs || []}
            scenarioParticipationFee={formData.participation_fee || 0}
            totalParticipants={scenarioStats.totalParticipants}
            totalStaffParticipants={scenarioStats.totalStaffParticipants}
            totalRevenue={scenarioStats.totalRevenue}
          />
        )
      default:
        return null
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent size="lg" className="max-w-[95vw] sm:max-w-3xl h-[85vh] sm:h-[min(80vh,600px)] p-0 flex flex-col overflow-hidden [&>button]:z-10">
        <DialogHeader className="px-2 sm:px-3 pt-2 pb-0 shrink-0">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <DialogTitle className="text-sm shrink-0 flex items-center gap-1.5">
              <span>{scenarioId ? 'シナリオ編集' : '新規シナリオ'}</span>
              {organizationName && (
                <span className="text-[11px] font-normal text-muted-foreground bg-muted px-1 py-0 rounded">
                  {organizationName}
                </span>
              )}
              {/* MMQ運営者用：マスター編集ボタン */}
              {isLicenseAdmin && currentMasterId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[11px] gap-0.5 text-purple-600 border-purple-300 hover:bg-purple-50 px-1.5"
                  onClick={() => setMasterEditDialogOpen(true)}
                >
                  <Shield className="w-2.5 h-2.5" />
                  マスタ編集
                </Button>
              )}
              {/* マスターから同期ボタン（相違がある場合のみ表示） */}
              {currentMasterId && masterDiffs.count > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[11px] gap-0.5 text-blue-600 border-blue-300 hover:bg-blue-50 px-1.5"
                  onClick={handleSyncFromMaster}
                  disabled={loadingMaster}
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  同期
                  <span className="bg-blue-100 text-blue-700 px-1 py-0 rounded-full text-[11px] font-medium">
                    {masterDiffs.count}
                  </span>
                </Button>
              )}
            </DialogTitle>
            {/* マスタから引用ボタン */}
            {!scenarioId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMasterSelectOpen(true)}
                className="shrink-0 h-5 text-[11px] px-1.5"
              >
                <BookOpen className="h-3 w-3 mr-0.5" />
                マスタから引用
              </Button>
            )}
            {/* シナリオ切り替え */}
            {onScenarioChange && scenarioId && scenarioIdList.length > 1 && (
              <div className="flex items-center gap-0.5 flex-1 max-w-xs">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    const currentIndex = scenarioIdList.indexOf(scenarioId)
                    if (currentIndex > 0) {
                      onScenarioChange(scenarioIdList[currentIndex - 1])
                    }
                  }}
                  disabled={scenarioIdList.indexOf(scenarioId) === 0}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Select
                  value={scenarioId}
                  onValueChange={(value) => onScenarioChange(value)}
                >
                  <SelectTrigger className="h-6 text-[11px] flex-1">
                    <SelectValue placeholder="シナリオ" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {scenarios.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    const currentIndex = scenarioIdList.indexOf(scenarioId)
                    if (currentIndex < scenarioIdList.length - 1) {
                      onScenarioChange(scenarioIdList[currentIndex + 1])
                    }
                  }}
                  disabled={scenarioIdList.indexOf(scenarioId) === scenarioIdList.length - 1}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <DialogDescription className="flex items-center gap-1.5 text-[11px]">
            <span className="truncate">{formData.title ? `${formData.title}を編集` : '情報を入力'}</span>
            {scenarioStats.firstPerformanceDate && (
              <span className="text-[11px] bg-muted px-1 py-0 rounded shrink-0">
                {new Date(scenarioStats.firstPerformanceDate).getFullYear()}.
                {String(new Date(scenarioStats.firstPerformanceDate).getMonth() + 1).padStart(2, '0')}.
                {String(new Date(scenarioStats.firstPerformanceDate).getDate()).padStart(2, '0')}〜
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* タブナビゲーション */}
        <Tabs 
          value={activeTab} 
          onValueChange={(v) => {
            setActiveTab(v as TabId)
            localStorage.setItem('scenarioEditDialogTab', v)
          }} 
          className="flex-1 flex flex-col overflow-hidden"
          onKeyDown={(e) => {
            // 矢印キーでのタブ切り替えを無効化（シナリオ切り替えに使用するため）
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
        >
          <div className="px-2 sm:px-3 pt-2 shrink-0 border-b">
            <TabsList 
              className="w-full h-auto flex flex-wrap gap-0.5 bg-transparent p-0 justify-start"
              onKeyDown={(e) => {
                // 矢印キーでのタブ切り替えを無効化（シナリオ切り替えに使用するため）
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  e.stopPropagation()
                }
              }}
            >
              {TABS.map((tab) => {
                const Icon = tab.icon
                const diffCount = masterDiffs.byTab[tab.id] || 0
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-0.5 px-1.5 py-1 text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-t rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary transition-colors relative"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault()
                        e.stopPropagation()
                      }
                    }}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {/* マスターとの相違件数バッジ */}
                    {diffCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-yellow-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                        {diffCount}
                      </span>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          {/* タブコンテンツ */}
          <div className="flex-1 overflow-y-auto">
            {TABS.map((tab) => (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="m-0 p-2 sm:p-3 focus-visible:outline-none focus-visible:ring-0"
              >
                {renderTabContent(tab.id)}
              </TabsContent>
            ))}
          </div>
        </Tabs>

        {/* フッター（固定） */}
        <div className="flex justify-between items-center gap-1.5 px-2 sm:px-3 py-1.5 border-t bg-muted/30 shrink-0">
          {/* 現在の設定サマリー（小さい画面では非表示） */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground truncate max-w-[100px]">
              {formData.title || '(未設定)'}
            </span>
            <span className="text-muted-foreground/50">|</span>
            <span>{formData.duration}分</span>
            <span className="text-muted-foreground/50">|</span>
            <span>
              {formData.player_count_min === formData.player_count_max 
                ? `${formData.player_count_min}人`
                : `${formData.player_count_min}〜${formData.player_count_max}人`
              }
            </span>
            <span className="text-muted-foreground/50">|</span>
            <span>
              ¥{(formData.participation_costs?.find(c => c.time_slot === 'normal')?.amount || formData.participation_fee || 0).toLocaleString()}
            </span>
          </div>

          {/* アクションボタン */}
          <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto justify-end">
            {/* ステータスバッジ */}
            {formData.status === 'draft' && (
              <span className="text-[11px] bg-gray-100 text-gray-600 px-1 py-0 rounded">下書き</span>
            )}
            {formData.status === 'available' && (
              <span className="text-[11px] bg-green-100 text-green-700 px-1 py-0 rounded">公開中</span>
            )}
            {formData.status === 'unavailable' && (
              <span className="text-[11px] bg-yellow-100 text-yellow-700 px-1 py-0 rounded">非公開</span>
            )}
            {saveMessage && (
              <span className="text-green-600 font-medium text-[11px] animate-pulse">
                ✓ {saveMessage}
              </span>
            )}
            <Button type="button" variant="outline" onClick={onClose} size="sm">
              閉じる
            </Button>
            <Button 
              variant="outline"
              onClick={() => handleSave('draft')} 
              disabled={scenarioMutation.isPending || isLoadingAssignments}
              size="sm"
              className="text-gray-600 hidden sm:inline-flex"
            >
              下書き
            </Button>
            {/* マスターに反映ボタン（license_admin のみ） */}
            {isLicenseAdmin && currentMasterId && masterDiffs.count > 0 && (
              <Button 
                variant="outline"
                onClick={handleApplyToMaster}
                size="sm"
                className="text-purple-600 border-purple-300 hover:bg-purple-50 hidden sm:inline-flex gap-0.5"
              >
                <ArrowUp className="h-2.5 w-2.5" />
                マスタ反映
              </Button>
            )}
            <Button onClick={() => handleSave()} disabled={scenarioMutation.isPending || isLoadingAssignments} size="sm">
              <Save className="h-3 w-3 mr-0.5" />
              保存
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* マスタ選択ダイアログ */}
      <MasterSelectDialog
        open={masterSelectOpen}
        onOpenChange={setMasterSelectOpen}
        onSelect={handleMasterSelect}
      />
      
      {/* MMQ運営者用：マスター編集ダイアログ */}
      {isLicenseAdmin && currentMasterId && (
        <ScenarioMasterEditDialog
          open={masterEditDialogOpen}
          onOpenChange={setMasterEditDialogOpen}
          masterId={currentMasterId}
          onSaved={() => {
            // マスター保存後にシナリオ一覧を更新
            setMasterEditDialogOpen(false)
          }}
        />
      )}
    </Dialog>
  )
}

