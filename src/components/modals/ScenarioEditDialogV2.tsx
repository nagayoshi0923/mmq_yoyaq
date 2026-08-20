import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Save, FileText, Gamepad2, Coins, Users, TrendingUp, CalendarDays, ChevronLeft, ChevronRight, BookOpen, Shield, RefreshCw, ArrowUp, ExternalLink, ClipboardList, UserCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'
import { ScenarioMasterEditDialog } from './ScenarioMasterEditDialog'
import { MasterSelectDialog } from './MasterSelectDialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useQueryClient } from '@tanstack/react-query'
import { useScenariosQuery, useScenarioMutation, useDeleteScenarioMutation } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { scenarioMasterApi, type ScenarioMaster } from '@/lib/api/scenarioMasterApi'
import { invalidateAssignmentQueries } from '@/lib/queryInvalidation'

// V2セクションコンポーネント（カード形式でレイアウト改善）
import { BasicInfoSectionV2 } from './ScenarioEditDialogV2/sections/BasicInfoSectionV2'
import { GameInfoSectionV2 } from './ScenarioEditDialogV2/sections/GameInfoSectionV2'
import { PricingSectionV2 } from './ScenarioEditDialogV2/sections/PricingSectionV2'
import { GmSettingsSectionV2 } from './ScenarioEditDialogV2/sections/GmSettingsSectionV2'
import { CostsPropsSectionV2 } from './ScenarioEditDialogV2/sections/CostsPropsSectionV2'
import { PerformancesSectionV2 } from './ScenarioEditDialogV2/sections/PerformancesSectionV2'
import { SurveySectionV2 } from './ScenarioEditDialogV2/sections/SurveySectionV2'
import { CharactersSectionV2 } from './ScenarioEditDialogV2/sections/CharactersSectionV2'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditDialogV2/types'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'

// API関連
import { staffApi, scenarioApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { formatJstYmd } from '@/utils/jstDate'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId, getCurrentOrganization, getOrganizationById } from '@/lib/organization'
import { getOrganizationSlugFromPath } from '@/lib/publicBookingPath'
import type { Scenario, Staff } from '@/types'
import { ConfirmDialog } from '@/components/patterns/modal'

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
  { id: 'characters', label: 'キャラクター', icon: UserCircle },
  { id: 'pricing', label: '料金', icon: Coins },
  { id: 'gm', label: 'GM', icon: Users },
  { id: 'costs', label: '売上', icon: TrendingUp },
  { id: 'performances', label: '公演実績', icon: CalendarDays },
  { id: 'survey', label: '事前配役アンケート', icon: ClipboardList },
] as const

type TabId = typeof TABS[number]['id']

// localStorageからタブを取得する関数
const getSavedTab = (): TabId => {
  const saved = localStorage.getItem('scenarioEditDialogTab')
  if (saved && ['basic', 'game', 'characters', 'pricing', 'gm', 'costs', 'performances', 'survey'].includes(saved)) {
    return saved as TabId
  }
  return 'basic'
}

export function ScenarioEditDialogV2({ isOpen, onClose, scenarioId, onSaved, onScenarioChange, sortedScenarioIds }: ScenarioEditDialogV2Props) {
  const queryClient = useQueryClient()
  
  // 初期値をlocalStorageから取得（コンポーネントマウント時に正しいタブを表示）
  const [activeTab, setActiveTab] = useState<TabId>(getSavedTab)
  
  // ダイアログを開く度、またはシナリオが変わった時にタブを復元
  useEffect(() => {
    if (isOpen) {
      setActiveTab(getSavedTab())
    }
  }, [isOpen, scenarioId])

  const selectTab = (id: TabId) => {
    setActiveTab(id)
    localStorage.setItem('scenarioEditDialogTab', id)
  }

  const [formData, setFormData] = useState<ScenarioFormData>({
    title: '',
    slug: '',
    author: '',
    author_email: '',
    description: '',
    duration: 120,
    player_count_min: 8,
    player_count_max: 8,
    male_count: null,
    female_count: null,
    other_count: null,
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
    caution: '',
    sensitive_tags: [],
    has_pre_reading: false,
    gm_count: 1,
    gm_assignments: [],  // 空配列 = デフォルト報酬を使用
    participation_costs: [
      { time_slot: 'normal', amount: 4000, type: 'fixed' },
      { time_slot: 'gmtest', amount: 3000, type: 'fixed' },
    ],
    characters: [],  // キャラクター情報
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
    scenario_kind: 'regular',
    accepts_private_booking: true,
    available_from: null,
    available_until: null,
  })
  const [isScenarioLoaded, setIsScenarioLoaded] = useState<boolean>(!scenarioId) // 新規はloaded扱い

  const { data: scenarios = [], isPending: scenariosQueryPending } = useScenariosQuery()

  const scenariosFingerprint = useMemo(
    () => scenarios.map(s => `${s.id}:${s.scenario_master_id ?? ''}`).join('|'),
    [scenarios]
  )
  const scenarioMutation = useScenarioMutation()
  const deleteMutation = useDeleteScenarioMutation()
  const { user } = useAuth()
  const { organizationId: currentOrgId } = useOrganization()
  const isLicenseAdmin = checkIsLicenseAdmin(user?.role, currentOrgId)
  const isOrgAdmin = user?.role === 'admin'
  const canDeleteScenario = isLicenseAdmin || isOrgAdmin
  const canEditMaster = isLicenseAdmin
  
  // マスター編集ダイアログ（MMQ運営者用）
  const [masterEditDialogOpen, setMasterEditDialogOpen] = useState(false)

  // マスターへの反映・シナリオ削除の確認ダイアログ
  const [isApplyToMasterConfirmOpen, setIsApplyToMasterConfirmOpen] = useState(false)
  const [isDeleteScenarioConfirmOpen, setIsDeleteScenarioConfirmOpen] = useState(false)
  
  // マスターデータ（相違検出用）
  const [masterData, setMasterData] = useState<ScenarioMaster | null>(null)
  const [loadingMaster, setLoadingMaster] = useState(false)
  
  // 現在編集中のシナリオ（マスター編集用） - useEffectより前に定義する必要あり
  const currentScenario = scenarioId 
    ? scenarios.find(s => s.id === scenarioId || s.scenario_master_id === scenarioId) 
    : null
  const currentMasterId = currentScenario?.scenario_master_id || formData.scenario_master_id
  
  // scenario_master_id を直接使用（旧ID解決は不要）
  // staff_scenario_assignments.scenario_id は scenario_master_id と統一済み
  
  // 組織名・予約サイト上のシナリオ詳細URL用 slug（所属組織を優先）
  const [organizationName, setOrganizationName] = useState<string>('')
  const [publicBookingOrgSlug, setPublicBookingOrgSlug] = useState<string>('')
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const sync = async () => {
      const currentOrg = await getCurrentOrganization()
      if (cancelled) return
      setOrganizationName(currentOrg?.name || '')

      let slugForPublic = currentOrg?.slug?.trim() || ''
      const scenarioOrgId =
        currentScenario?.organization_id ?? formData.organization_id ?? null
      if (scenarioOrgId) {
        const scenarioOrg = await getOrganizationById(scenarioOrgId)
        if (cancelled) return
        if (scenarioOrg?.slug?.trim()) {
          slugForPublic = scenarioOrg.slug.trim()
        }
      }
      // ローカル等: users.organization が取れない・一覧の organization_id が遅延する場合のフォールバック
      if (!slugForPublic.trim()) {
        slugForPublic = getOrganizationSlugFromPath() ?? ''
      }
      if (!cancelled) {
        setPublicBookingOrgSlug(slugForPublic.trim())
      }
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [isOpen, scenarioId, currentScenario?.organization_id, formData.organization_id])

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
  const handleApplyToMaster = () => {
    if (!currentMasterId) return
    setIsApplyToMasterConfirmOpen(true)
  }

  const runApplyToMaster = async () => {
    if (!currentMasterId) return
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
  
  // 新規作成後のシナリオIDを追跡（2回目以降の保存で update にするため）
  const [createdScenarioId, setCreatedScenarioId] = useState<string | null>(null)
  
  // 保存オプションダイアログ
  const [saveOptionsOpen, setSaveOptionsOpen] = useState(false)
  const [savePublishChoice, setSavePublishChoice] = useState<'available' | 'unavailable'>('available')
  const [submitToMMQ, setSubmitToMMQ] = useState(false)
  const [isSubmittingToMMQ, setIsSubmittingToMMQ] = useState(false)

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
    totalVenueCost: 0,
    venueCostPerPerformance: 0,
    firstPerformanceDate: null as string | null,
    performanceDates: [] as Array<{ date: string; category: string; participants: number; demoParticipants: number; staffParticipants: number; revenue: number; licenseCost: number; startTime: string; storeId: string | null; isCancelled: boolean }>,
    futurePerformanceCount: 0,
    futureReservationCount: 0
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
      if (!isOpen || !scenarioId) {
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
          totalVenueCost: 0,
          venueCostPerPerformance: 0,
          firstPerformanceDate: null,
          performanceDates: [],
          futurePerformanceCount: 0,
          futureReservationCount: 0
        })
        return
      }

      try {
        setIsLoadingAssignments(true)
        const assignmentsData = await assignmentApi.getAllScenarioAssignments(scenarioId)
        
        // GM可能なスタッフのみ（体験済みのみは担当GMに出さない）
        const gmAssignments = (assignmentsData || []).filter((a: { can_main_gm?: boolean; can_sub_gm?: boolean }) =>
          a.can_main_gm === true || a.can_sub_gm === true
        )
        
        setCurrentAssignments(gmAssignments)
        setSelectedStaffIds(gmAssignments.map((a: { staff_id: string }) => a.staff_id))
        
        // 統計情報を取得
        const statsId = scenarioId
        try {
          const stats = await scenarioApi.getScenarioStats(statsId)
          setScenarioStats(stats)
        } catch {
          try {
            const count = await scenarioApi.getPerformanceCount(statsId)
            setScenarioStats(prev => ({ ...prev, performanceCount: count }))
          } catch {
            // 統計取得失敗は無視
          }
        }
      } catch (error) {
        logger.error('Error loading assignments:', error)
      } finally {
        setIsLoadingAssignments(false)
      }
    }

    loadAssignments()
  }, [isOpen, scenarioId])

  // NOTE: フォールバック（organization_scenarios.available_gms / gm_assignments）は廃止
  // staff_scenario_assignments に統合済み

  // フォームの初回ロード済みキーを追跡（保存後の不要なフォームリセットを防止）
  const formLoadedKeyRef = useRef<string>('')

  // ダイアログが閉じた時やscenarioIdが変わった時にcreatedScenarioIdをリセット
  useEffect(() => {
    if (!isOpen) {
      setCreatedScenarioId(null)
    }
  }, [isOpen, scenarioId])

  // シナリオデータをロード
  useEffect(() => {
    // ダイアログが閉じている時はロード済みキーをリセット
    if (!isOpen) {
      formLoadedKeyRef.current = ''
      return
    }

    const loadKey = `${scenarioId || 'new'}`
    // ロード成功後のみ付与する（未ヒットのとき先にキーを付けると一覧リフェッチ後も再試行されない）
    if (formLoadedKeyRef.current === loadKey) return

    if (!scenarioId) {
      formLoadedKeyRef.current = loadKey
      setIsScenarioLoaded(true)
      setFormData({
        title: '',
        slug: '',
        author: '',
        author_email: '',
        description: '',
        duration: 120,
        player_count_min: 8,
        player_count_max: 8,
        male_count: null,
        female_count: null,
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
        gm_assignments: [],
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
        caution: '',
        sensitive_tags: [],
        key_visual_url: '',
        available_stores: [],
        characters: [],
        scenario_kind: 'regular',
        accepts_private_booking: true,
        available_from: null,
        available_until: null,
      })
      return
    }

    if (scenariosQueryPending && scenarios.length === 0) return

    const hydrateFromScenario = (scenario: Scenario) => {
      setIsScenarioLoaded(true)
      formLoadedKeyRef.current = loadKey
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
          organization_id: scenario.organization_id ?? null,
          description: scenario.description || '',
          duration: scenario.duration || 120,
          player_count_min: scenario.player_count_min || 4,
          player_count_max: scenario.player_count_max || 8,
          male_count: scenario.male_count ?? null,
          female_count: scenario.female_count ?? null,
          other_count: scenario.other_count ?? null,
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
          // フランチャイズ公演時
          fc_receive_license_amount: scenario.fc_receive_license_amount,
          fc_receive_gm_test_license_amount: scenario.fc_receive_gm_test_license_amount,
          fc_author_license_amount: scenario.fc_author_license_amount,
          fc_author_gm_test_license_amount: scenario.fc_author_gm_test_license_amount,
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
          available_stores: scenario.available_stores || [],
          extra_preparation_time: scenario.extra_preparation_time || undefined,
          private_booking_time_slots: scenario.private_booking_time_slots || [],
          private_booking_time_slots_weekend: scenario.private_booking_time_slots_weekend ?? null,
          caution: '',
          sensitive_tags: [],
          characters: [],  // organization_scenariosから後で取得
        })
        
        // organization_scenarios から override/custom 値を取得して formData を上書き
        // ビュー (organization_scenarios_with_master) の COALESCE と同じ優先順位で読み込む
        if (scenario.scenario_master_id) {
          const masterId = scenario.scenario_master_id
          ;(async () => {
            try {
              const loadOrgId = await getCurrentOrganizationId()
              if (loadOrgId) {
                const { data: osData } = await supabase
                  .from('organization_scenarios')
                  .select('id, override_title, override_author, override_genre, override_difficulty, override_player_count_min, override_player_count_max, custom_key_visual_url, custom_description, custom_synopsis, custom_caution, custom_sensitive_tags, available_stores, survey_url, survey_enabled, survey_deadline_days, characters, private_booking_blocked_slots, booking_start_date, booking_end_date, scenario_kind, accepts_private_booking, available_from, available_until')
                  .eq('scenario_master_id', masterId)
                  .eq('organization_id', loadOrgId)
                  .maybeSingle()
                
                if (osData) {
                  // アンケート質問を取得
                  let surveyQuestions: any[] = []
                  if (osData.id) {
                    const { data: questionsData } = await supabase
                      .from('org_scenario_survey_questions')
                      .select(
                        'id, org_scenario_id, question_text, question_type, options, is_required, order_num, created_at, updated_at'
                      )
                      .eq('org_scenario_id', osData.id)
                      .order('order_num', { ascending: true })
                    surveyQuestions = questionsData || []
                  }
                  
                  setFormData(prev => ({
                    ...prev,
                    // override 値があればそちらを優先（なければ scenarios テーブルから読んだ値をそのまま使用）
                    title: osData.override_title || prev.title,
                    author: osData.override_author || prev.author,
                    genre: osData.override_genre || prev.genre,
                    difficulty: osData.override_difficulty ? parseInt(osData.override_difficulty) : prev.difficulty,
                    player_count_min: osData.override_player_count_min || prev.player_count_min,
                    player_count_max: osData.override_player_count_max || prev.player_count_max,
                    key_visual_url: osData.custom_key_visual_url || prev.key_visual_url,
                    description: osData.custom_description || prev.description,
                    caution: osData.custom_caution || prev.caution || '',
                    sensitive_tags: osData.custom_sensitive_tags || prev.sensitive_tags || [],
                    // 対応店舗: organization_scenarios側のデータを優先
                    available_stores: (osData.available_stores && osData.available_stores.length > 0) 
                      ? osData.available_stores 
                      : prev.available_stores,
                    // アンケート設定
                    survey_url: osData.survey_url || null,
                    survey_enabled: osData.survey_enabled || false,
                    survey_deadline_days: osData.survey_deadline_days ?? 1,
                    survey_questions: surveyQuestions.map(q => ({
                      id: q.id,
                      question_text: q.question_text,
                      question_type: q.question_type,
                      options: q.options || [],
                      is_required: q.is_required,
                      order_num: q.order_num,
                    })),
                    // キャラクター情報
                    characters: osData.characters || [],
                    // 貸切受付不可時間帯
                    private_booking_blocked_slots: osData.private_booking_blocked_slots || [],
                    // 貸切募集期間
                    booking_start_date: osData.booking_start_date || null,
                    booking_end_date: osData.booking_end_date || null,
                    // シナリオ種別・貸切受付フラグ・公演期間
                    scenario_kind: (osData as any).scenario_kind || 'regular',
                    accepts_private_booking: (osData as any).accepts_private_booking ?? true,
                    available_from: (osData as any).available_from || null,
                    available_until: (osData as any).available_until || null,
                  }))

                  // 定型文を別クエリで安全に取得（カラム未追加の環境でもエラーにならない）
                  try {
                    const { data: tplData } = await supabase
                      .from('organization_scenarios')
                      .select('individual_notice_template, reservation_confirmation_template')
                      .eq('id', osData.id)
                      .maybeSingle()
                    const notice = (tplData as { individual_notice_template?: string | null } | null)?.individual_notice_template
                    const confirmTpl = (tplData as { reservation_confirmation_template?: string | null } | null)?.reservation_confirmation_template
                    if (notice || confirmTpl) {
                      setFormData(prev => ({
                        ...prev,
                        ...(notice ? { individual_notice_template: notice } : {}),
                        ...(confirmTpl ? { reservation_confirmation_template: confirmTpl } : {}),
                      }))
                    }
                  } catch {
                    // カラムが存在しない場合は無視
                  }
                } else {
                  // organization_scenarios がなければ scenario_masters.caution / sensitive_tags を取得
                  const { data: masterCaution } = await supabase
                    .from('scenario_masters')
                    .select('caution, sensitive_tags')
                    .eq('id', masterId)
                    .maybeSingle()
                  if (masterCaution?.caution) {
                    setFormData(prev => ({ ...prev, caution: masterCaution.caution || '' }))
                  }
                  if (masterCaution?.sensitive_tags) {
                    setFormData(prev => ({ ...prev, sensitive_tags: masterCaution.sensitive_tags || [] }))
                  }
                }
              }
            } catch (e) {
              logger.error('override値取得エラー:', e)
            }
          })()
        }
    }

    const fromList = scenarios.find(
      s => s.id === scenarioId || s.scenario_master_id === scenarioId
    )

    if (fromList) {
      hydrateFromScenario(fromList)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const fetched = await scenarioApi.resolveOrganizationScenarioView(scenarioId)
        if (cancelled) return
        if (fetched) {
          hydrateFromScenario(fetched)
        } else {
          setIsScenarioLoaded(false)
          showToast.error(
            'シナリオの読み込みに失敗しました',
            '一覧にまだ反映されていない場合は数秒待ってから開き直してください。解消しないときは再ログインをお試しください'
          )
        }
      } catch (e) {
        logger.error('シナリオ単体取得エラー:', e)
        if (!cancelled) {
          setIsScenarioLoaded(false)
          showToast.error(
            'シナリオの読み込みに失敗しました',
            '権限/組織情報の可能性があります。再ログイン後に再度お試しください'
          )
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scenarioId, scenariosFingerprint, scenariosQueryPending, scenarios.length])

  const handleSave = async (statusOverride?: 'available' | 'unavailable' | 'draft') => {
    // 新規作成後のIDがあれば編集モードとして扱う
    const effectiveScenarioId = scenarioId || createdScenarioId

    if (effectiveScenarioId && !isScenarioLoaded) {
      showToast.error('保存できません', 'シナリオが読み込めていません（権限/組織情報の可能性）')
      return
    }
    const resolvedTitle = (
      formData.title.trim()
      || currentScenario?.title?.trim()
      || masterData?.title?.trim()
      || ''
    )
    if (!resolvedTitle) {
      showToast.warning('タイトルを入力してください')
      setActiveTab('basic')
      return
    }
    if (resolvedTitle !== formData.title) {
      setFormData(prev => ({ ...prev, title: resolvedTitle }))
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
        title: resolvedTitle,
        // ステータスを上書き
        status: saveStatus,
        // slugが空文字列の場合はnullとして保存
        slug: dbFields.slug?.trim() || null,
        // 追加準備時間: undefinedやfalsyはnullとして保存（意図しないデフォルト値を防ぐ）
        extra_preparation_time: formData.extra_preparation_time || null,
        // 男女比: nullは「男女問わず」を意味する
        male_count: formData.male_count ?? null,
        female_count: formData.female_count ?? null,
        other_count: formData.other_count ?? null,
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
        // 貸切受付時間枠（平日/土日祝）
        private_booking_time_slots: formData.private_booking_time_slots || null,
        private_booking_time_slots_weekend: formData.private_booking_time_slots_weekend ?? null,
        updated_at: new Date().toISOString()
      }

      if (effectiveScenarioId) {
        scenarioData.id = effectiveScenarioId
      }
      
      // scenarios テーブルへの保存（旧テーブル）
      // 失敗してもorganization_scenariosへの保存は続行する
      let scenarioSaveResult: any = null
      try {
        scenarioSaveResult = await scenarioMutation.mutateAsync({
          scenario: scenarioData,
          isEdit: !!effectiveScenarioId
        })
      } catch (scenarioErr) {
        logger.warn('scenarios テーブル保存エラー（organization_scenariosへの保存は続行）:', scenarioErr)
        logger.warn('⚠️ scenarios保存エラー（続行）:', scenarioErr)
      }

      // 担当GMの更新処理
      // scenario_master_id を直接使用
      const targetScenarioId = effectiveScenarioId || (scenarioSaveResult && typeof scenarioSaveResult === 'object' && 'scenario_master_id' in scenarioSaveResult ? (scenarioSaveResult as any).scenario_master_id : undefined)

      if (targetScenarioId) {
        try {
          const originalStaffIds = currentAssignments.map(a => a.staff_id)
          const toDelete = originalStaffIds.filter(id => !selectedStaffIds.includes(id))
          const toAdd = selectedStaffIds.filter(id => !originalStaffIds.includes(id))

          for (const staffId of toDelete) {
            await assignmentApi.removeAssignment(staffId, targetScenarioId)
          }

          const upsertFlags = (staffId: string) => {
            const assignment = currentAssignments.find(a => a.staff_id === staffId)
            const can_main_gm = assignment?.can_main_gm ?? true
            const can_sub_gm = assignment?.can_sub_gm ?? true
            const hasGm = can_main_gm || can_sub_gm
            return {
              can_main_gm,
              can_sub_gm,
              is_experienced: !hasGm,
            }
          }

          for (const staffId of toAdd) {
            await assignmentApi.upsertAssignment(staffId, targetScenarioId, upsertFlags(staffId))
          }

          for (const staffId of selectedStaffIds.filter(id => originalStaffIds.includes(id))) {
            await assignmentApi.upsertAssignment(staffId, targetScenarioId, upsertFlags(staffId))
          }

          const refreshed = await assignmentApi.getAllScenarioAssignments(targetScenarioId)
          const gmAssignments = (refreshed || []).filter((a: { can_main_gm?: boolean; can_sub_gm?: boolean }) =>
            a.can_main_gm === true || a.can_sub_gm === true
          )
          setCurrentAssignments(gmAssignments)
          setSelectedStaffIds(gmAssignments.map((a: { staff_id: string }) => a.staff_id))
        } catch (syncError) {
          logger.error('Error updating GM assignments:', syncError)
          showToast.warning('シナリオは保存されました', '担当GMの更新に失敗しました。手動で確認してください')
        }
        
        await invalidateAssignmentQueries(queryClient)
      }

      // マスタから引用した場合、organization_scenariosにも登録
      // scenariosテーブルの保存に失敗してもここは必ず実行する
      const masterIdForOrgSave = formData.scenario_master_id || targetScenarioId
      if (masterIdForOrgSave) {
        try {
          const organizationId = await getCurrentOrganizationId()
          if (!organizationId) {
            logger.warn('organization_id取得失敗: organization_scenariosへの登録をスキップ')
          } else {
            // 既存のレコードがあるか確認
            const { data: existingOrgScenario } = await supabase
              .from('organization_scenarios')
              .select('id')
              .eq('scenario_master_id', masterIdForOrgSave)
              .eq('organization_id', organizationId)
              .maybeSingle()
            
            // organization_scenarios に保存するデータ（override/custom フィールド含む）
            const orgScenarioPayload = {
              organization_id: organizationId,
              scenario_master_id: masterIdForOrgSave,
              slug: scenarioData.slug,
              duration: scenarioData.duration,
              participation_fee: scenarioData.participation_fee,
              extra_preparation_time: scenarioData.extra_preparation_time ?? null,
              org_status: saveStatus === 'draft' ? 'coming_soon' : (saveStatus === 'available' ? 'available' : 'unavailable'),
              // override フィールド（マスター情報の組織固有上書き）
              override_title: scenarioData.title || null,
              override_author: scenarioData.author || null,
              override_genre: scenarioData.genre || null,
              override_difficulty: scenarioData.difficulty ? String(scenarioData.difficulty) : null,
              override_player_count_min: scenarioData.player_count_min || null,
              override_player_count_max: scenarioData.player_count_max || null,
              // custom フィールド
              custom_key_visual_url: scenarioData.key_visual_url || null,
              custom_description: scenarioData.description || null,
              custom_caution: formData.caution || null,
              // 空配列 = マスタ (scenario_masters.sensitive_tags) 準拠にフォールバック
              custom_sensitive_tags: formData.sensitive_tags && formData.sensitive_tags.length > 0 ? formData.sensitive_tags : null,
              // 運用フィールド
              available_stores: scenarioData.available_stores || [],
              participation_costs: scenarioData.participation_costs || [],
              gm_costs: scenarioData.gm_costs || [],
              // 必要GM数（担当作品ページのメイン／サブ表示やシフト計算用。organization_scenarios に必ず同期する）
              gm_count: formData.gm_count ?? 1,
              // ライセンス関連フィールド
              license_amount: scenarioData.license_amount,
              gm_test_license_amount: scenarioData.gm_test_license_amount,
              franchise_license_amount: scenarioData.franchise_license_amount,
              franchise_gm_test_license_amount: scenarioData.franchise_gm_test_license_amount,
              external_license_amount: formData.external_license_amount,
              external_gm_test_license_amount: formData.external_gm_test_license_amount,
              // フランチャイズ公演時
              fc_receive_license_amount: formData.fc_receive_license_amount,
              fc_receive_gm_test_license_amount: formData.fc_receive_gm_test_license_amount,
              fc_author_license_amount: formData.fc_author_license_amount,
              fc_author_gm_test_license_amount: formData.fc_author_gm_test_license_amount,
              // アンケート設定
              survey_url: formData.survey_url || null,
              survey_enabled: formData.survey_enabled || false,
              survey_deadline_days: formData.survey_deadline_days ?? 1,
              // キャラクター情報
              characters: formData.characters || [],
              // 男女比
              male_count: formData.male_count ?? null,
              female_count: formData.female_count ?? null,
              other_count: formData.other_count ?? null,
              // シナリオタイプ
              scenario_type: formData.scenario_type || 'normal',
              // 貸切受付不可時間帯
              private_booking_blocked_slots: formData.private_booking_blocked_slots || null,
              // 貸切募集期間
              booking_start_date: formData.booking_start_date || null,
              booking_end_date: formData.booking_end_date || null,
              // シナリオ種別・貸切受付フラグ・公演期間
              scenario_kind: formData.scenario_kind || 'regular',
              accepts_private_booking: formData.accepts_private_booking ?? true,
              available_from: formData.available_from || null,
              available_until: formData.available_until || null,
            }

            let orgScenarioId: string | null = existingOrgScenario?.id || null

            if (!existingOrgScenario) {
              // organization_scenariosに登録
              const { data: insertedData, error: orgScenarioError } = await supabase
                .from('organization_scenarios')
                .insert(orgScenarioPayload)
                .select('id')
                .single()
              
              if (orgScenarioError) {
                logger.error('organization_scenarios登録エラー:', orgScenarioError)
              } else {
                logger.log('organization_scenariosに登録しました')
                orgScenarioId = insertedData?.id || null
              }
            } else {
              // 既存レコードがある場合は更新（organization_id, scenario_master_id は除く）
              const { organization_id: _oid, scenario_master_id: _mid, ...updatePayload } = orgScenarioPayload
              const { error: updateError } = await supabase
                .from('organization_scenarios')
                .update({
                  ...updatePayload,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingOrgScenario.id)
              
              if (updateError) {
                logger.error('organization_scenarios更新エラー:', updateError)
                logger.error('🚨 organization_scenarios UPDATE失敗:', updateError.message, updateError.code)
              } else {
                logger.log('organization_scenariosを更新しました（override含む）')
                logger.log('✅ organization_scenarios保存成功 available_stores:', updatePayload.available_stores)
              }
            }

            // 定型文を別途安全に保存（カラム未追加の環境でもエラーにならない）
            if (orgScenarioId && (
              formData.individual_notice_template !== undefined
              || formData.reservation_confirmation_template !== undefined
            )) {
              try {
                await supabase
                  .from('organization_scenarios')
                  .update({
                    individual_notice_template: formData.individual_notice_template || null,
                    reservation_confirmation_template: formData.reservation_confirmation_template?.trim() || null,
                  })
                  .eq('id', orgScenarioId)
                  .eq('organization_id', organizationId)
              } catch {
                // カラムが存在しない場合は無視
              }
            }

            logger.log('🔍 orgScenarioId 確認:', orgScenarioId)
            
            // アンケート質問を保存
            logger.log('📝 アンケート質問保存チェック:', {
              orgScenarioId,
              survey_enabled: formData.survey_enabled,
              questionsCount: formData.survey_questions?.length || 0,
            })
            
            if (orgScenarioId && formData.survey_enabled) {
              try {
                // 既存の質問を取得
                const { data: existingQuestions, error: fetchError } = await supabase
                  .from('org_scenario_survey_questions')
                  .select('id')
                  .eq('org_scenario_id', orgScenarioId)

                if (fetchError) {
                  logger.error('🚨 既存質問取得エラー:', fetchError)
                }

                const existingIds = new Set((existingQuestions || []).map(q => q.id))
                const newQuestionIds = new Set((formData.survey_questions || []).map(q => q.id))

                // 削除された質問を削除
                const toDelete = [...existingIds].filter(id => !newQuestionIds.has(id))
                if (toDelete.length > 0) {
                  const { error: deleteError } = await supabase
                    .from('org_scenario_survey_questions')
                    .delete()
                    .in('id', toDelete)
                  
                  if (deleteError) {
                    logger.error('🚨 質問削除エラー:', deleteError)
                  }
                }

                // 新規・更新の質問をupsert
                const questionsToUpsert = (formData.survey_questions || []).map(q => ({
                  id: q.id,
                  org_scenario_id: orgScenarioId,
                  question_text: q.question_text,
                  question_type: q.question_type,
                  options: q.options,
                  is_required: q.is_required,
                  order_num: q.order_num,
                }))

                logger.log('📝 保存する質問データ:', questionsToUpsert)

                if (questionsToUpsert.length > 0) {
                  const { error: upsertError } = await supabase
                    .from('org_scenario_survey_questions')
                    .upsert(questionsToUpsert, { onConflict: 'id' })

                  if (upsertError) {
                    logger.error('🚨 アンケート質問upsertエラー:', upsertError)
                    logger.error('アンケート質問保存エラー:', upsertError)
                  } else {
                    logger.log('✅ アンケート質問保存成功:', questionsToUpsert.length, '件')
                    logger.log('アンケート質問を保存しました:', questionsToUpsert.length, '件')
                  }
                }
              } catch (surveyErr) {
                logger.error('🚨 アンケート質問処理例外:', surveyErr)
                logger.error('アンケート質問処理エラー:', surveyErr)
              }
            } else {
              logger.log('⚠️ アンケート質問保存スキップ:', {
                orgScenarioId: !!orgScenarioId,
                survey_enabled: formData.survey_enabled,
              })
            }
          }
        } catch (orgErr) {
          logger.error('organization_scenarios処理エラー:', orgErr)
        }
        
        // NOTE: scenario_masters への書き込みは行わない。
        // マスター情報の更新はマスター編集画面（権利者用）の責務。
        // 組織固有の上書きは override_* / custom_* カラムで organization_scenarios に保存済み。
      }

      // 新規作成の場合、作成されたIDを内部で追跡して2回目以降は更新モードにする
      if (!effectiveScenarioId && targetScenarioId) {
        setCreatedScenarioId(targetScenarioId)
        logger.log('🔄 新規作成完了: 内部IDを追跡', targetScenarioId)
        // 親コンポーネントにも通知（対応している場合）
        if (onScenarioChange) {
          onScenarioChange(targetScenarioId)
        }
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
          errorMessage = getSafeErrorMessage(err, 'データベースエラーが発生しました')
        }
      }
      
      showToast.error('保存に失敗しました', errorMessage || getSafeErrorMessage(err, '不明なエラー'))
    }
  }

  // シナリオ削除ハンドラ
  const handleDelete = () => {
    if (!scenarioId) return
    setIsDeleteScenarioConfirmOpen(true)
  }

  const runDelete = async () => {
    if (!scenarioId) return
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
        return <BasicInfoSectionV2 formData={formData} setFormData={setFormData} scenarioId={scenarioId} onDelete={canDeleteScenario ? handleDelete : undefined} />
      case 'game':
        return <GameInfoSectionV2 formData={formData} setFormData={setFormData} />
      case 'characters':
        return <CharactersSectionV2 formData={formData} setFormData={setFormData} />
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
            totalLicenseCost={scenarioStats.totalLicenseCost}
            licenseAmount={formData.license_rewards?.find(r => r.item === 'normal')?.amount ?? formData.license_amount ?? 0}
            gmTestLicenseAmount={formData.license_rewards?.find(r => r.item === 'gmtest')?.amount ?? formData.gm_test_license_amount ?? 0}
            scenarioTitle={formData.title || 'シナリオ'}
            futurePerformanceCount={scenarioStats.futurePerformanceCount}
            futureReservationCount={scenarioStats.futureReservationCount}
          />
        )
      case 'survey':
        return <SurveySectionV2 formData={formData} setFormData={setFormData} />
      default:
        return null
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        size="xl"
        className="max-w-[min(1280px,96vw)] w-full h-[min(92vh,900px)] max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden"
      >
        <DialogHeader className="px-4 sm:px-5 pt-4 pb-3 shrink-0 border-b">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex flex-wrap items-center gap-2 min-w-0">
              <span>{scenarioId ? 'シナリオ編集' : '新規シナリオ'}</span>
              {organizationName && (
                <span className="text-xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                  {organizationName}
                </span>
              )}
              {/* MMQ運営者・クインズワルツ管理者用：マスター編集ボタン */}
              {canEditMaster && currentMasterId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-purple-600 border-purple-300 hover:bg-purple-50 px-2"
                  onClick={() => setMasterEditDialogOpen(true)}
                >
                  <Shield className="w-3 h-3" />
                  マスタ編集
                </Button>
              )}
              {/* マスターから同期ボタン（相違がある場合のみ表示） */}
              {currentMasterId && masterDiffs.count > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-blue-600 border-blue-300 hover:bg-blue-50 px-2"
                  onClick={handleSyncFromMaster}
                  disabled={loadingMaster}
                >
                  <RefreshCw className="w-3 h-3" />
                  同期
                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0 rounded-full text-xs font-medium">
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
                className="shrink-0 h-8 text-xs px-2"
              >
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                マスタから引用
              </Button>
            )}
            {/* シナリオ切り替え */}
            {onScenarioChange && scenarioId && scenarioIdList.length > 1 && (
              <div className="flex items-center gap-1 flex-1 max-w-xs">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
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
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select
                  value={scenarioId}
                  onValueChange={(value) => onScenarioChange(value)}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
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
                  className="h-8 w-8 shrink-0"
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
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onClose}>
              閉じる
            </Button>
          </div>
          <DialogDescription className="sr-only">
            {formData.title ? `${formData.title}を編集` : 'シナリオ情報を入力'}
            {scenarioStats.firstPerformanceDate
              ? `（初演 ${formatJstYmd(scenarioStats.firstPerformanceDate, '.')}〜）`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          <nav
            className="w-44 sm:w-52 shrink-0 border-r bg-muted/40 overflow-y-auto px-2.5 py-3 flex flex-col gap-1"
            aria-label="シナリオ編集セクション"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon
              const selected = activeTab === tab.id
              const diffCount = masterDiffs.byTab[tab.id] || 0
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-xs flex items-center gap-2',
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{tab.label}</span>
                  {diffCount > 0 && (
                    <span
                      className={cn(
                        'shrink-0 px-1.5 py-0 rounded-full text-xs',
                        selected
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-yellow-100 text-yellow-700'
                      )}
                    >
                      {diffCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          <div key={activeTab} className="flex-1 overflow-y-auto p-4 sm:p-6">
            {renderTabContent(activeTab)}
          </div>
        </div>

        {/* フッター（固定） */}
        <div className="flex justify-between items-center gap-2 px-4 sm:px-5 py-3 border-t bg-background shrink-0">
          {/* フッター左：サマリー＋マスター差分 */}
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground truncate max-w-[160px]">
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
            {/* マスターとの差分タブ表示 */}
            {currentMasterId && masterDiffs.count > 0 && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span className="text-yellow-600 font-medium flex items-center gap-1">
                  マスターと差分:
                  {TABS.filter(t => (masterDiffs.byTab[t.id] || 0) > 0).map(t => (
                    <span key={t.id} className="inline-flex items-center gap-0.5 bg-yellow-100 text-yellow-700 px-1.5 py-0 rounded-full">
                      {t.label}
                      <span className="font-bold">{masterDiffs.byTab[t.id]}</span>
                    </span>
                  ))}
                </span>
              </>
            )}
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
            {scenarioId && publicBookingOrgSlug && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1 px-2 shrink-0"
                onClick={() =>
                  window.open(
                    `/${publicBookingOrgSlug}/scenario/${formData.slug || scenarioId}`,
                    '_blank',
                  )
                }
                title="予約サイトのシナリオ詳細を別タブで開く"
              >
                <ExternalLink className="h-3 w-3" />
                シナリオ詳細
              </Button>
            )}
            {formData.status === 'unavailable' && (
              <span className="text-[11px] bg-yellow-100 text-yellow-700 px-1 py-0 rounded">非公開</span>
            )}
            {saveMessage && (
              <span className="text-green-600 font-medium text-xs animate-pulse">
                ✓ {saveMessage}
              </span>
            )}
            <Button 
              variant="outline"
              onClick={() => handleSave('draft')} 
              disabled={scenarioMutation.isPending || isLoadingAssignments}
              size="sm"
              className="text-gray-600 hidden sm:inline-flex"
            >
              下書き
            </Button>
            {/* マスターに反映ボタン（license_admin or クインズワルツ管理者） */}
            {canEditMaster && currentMasterId && masterDiffs.count > 0 && (
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
            {/* MMQへ申請ボタン（保存不要・draft マスタのみ表示） */}
            {currentMasterId && currentScenario?.master_status === 'draft' && (
              <Button
                variant="outline"
                size="sm"
                className="text-blue-600 border-blue-300 hover:bg-blue-50 hidden sm:inline-flex gap-0.5"
                disabled={isSubmittingToMMQ}
                onClick={async () => {
                  setIsSubmittingToMMQ(true)
                  try {
                    await scenarioMasterApi.publish(currentMasterId)
                    showToast.success('MMQへの掲載を申請しました', '審査後に掲載されます')
                    queryClient.invalidateQueries({ queryKey: ['org-scenarios', 'list'] })
                    queryClient.invalidateQueries({ queryKey: ['scenarios'] })
                  } catch {
                    showToast.error('申請に失敗しました', '時間をおいて再試行してください')
                  } finally {
                    setIsSubmittingToMMQ(false)
                  }
                }}
              >
                {isSubmittingToMMQ
                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : <Shield className="h-3 w-3" />
                }
                MMQへ申請
              </Button>
            )}
            <Button
              onClick={() => {
                const currentStatus = formData.status === 'draft' ? 'available' : (formData.status as 'available' | 'unavailable')
                setSavePublishChoice(currentStatus === 'available' ? 'available' : 'unavailable')
                setSubmitToMMQ(false)
                setSaveOptionsOpen(true)
              }}
              disabled={scenarioMutation.isPending || isLoadingAssignments}
              size="sm"
            >
              <Save className="h-3 w-3 mr-0.5" />
              保存
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* 保存オプションダイアログ */}
      <Dialog open={saveOptionsOpen} onOpenChange={setSaveOptionsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">保存オプション</DialogTitle>
            <DialogDescription className="text-xs">
              自組織の予約サイトへの表示設定を選択してください
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 公開 / 非公開 */}
            <RadioGroup
              value={savePublishChoice}
              onValueChange={(v) => setSavePublishChoice(v as 'available' | 'unavailable')}
              className="space-y-2"
            >
              <div className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30"
                onClick={() => setSavePublishChoice('available')}>
                <RadioGroupItem value="available" id="opt-available" className="mt-0.5" />
                <div>
                  <Label htmlFor="opt-available" className="font-medium text-sm cursor-pointer">公開して保存</Label>
                  <p className="text-xs text-muted-foreground">予約サイトのシナリオ一覧に表示されます</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30"
                onClick={() => setSavePublishChoice('unavailable')}>
                <RadioGroupItem value="unavailable" id="opt-unavailable" className="mt-0.5" />
                <div>
                  <Label htmlFor="opt-unavailable" className="font-medium text-sm cursor-pointer">非公開で保存</Label>
                  <p className="text-xs text-muted-foreground">管理者のみ確認できます（予約サイトには表示されません）</p>
                </div>
              </div>
            </RadioGroup>

            {/* MMQ申請（公開選択 + draft マスタのときのみ） */}
            {savePublishChoice === 'available' && currentScenario?.master_status === 'draft' && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="submit-to-mmq"
                    checked={submitToMMQ}
                    onCheckedChange={(checked) => setSubmitToMMQ(!!checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="submit-to-mmq" className="font-medium text-sm cursor-pointer text-blue-800">
                      MMQプラットフォームへの掲載を申請する
                    </Label>
                    <p className="text-xs text-blue-600 mt-0.5">
                      MMQ運営が審査します。承認後、MMQ全体の検索に表示されます。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setSaveOptionsOpen(false)}>
              キャンセル
            </Button>
            <Button
              size="sm"
              disabled={scenarioMutation.isPending}
              onClick={async () => {
                setSaveOptionsOpen(false)
                await handleSave(savePublishChoice)
                if (submitToMMQ && currentMasterId) {
                  try {
                    await scenarioMasterApi.publish(currentMasterId)
                    showToast.success('MMQへの掲載を申請しました', '審査後に掲載されます')
                  } catch {
                    showToast.error('MMQへの申請に失敗しました', '後ほどシナリオ一覧から申請してください')
                  }
                }
              }}
            >
              <Save className="h-3 w-3 mr-1" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* マスタ選択ダイアログ */}
      <MasterSelectDialog
        open={masterSelectOpen}
        onOpenChange={setMasterSelectOpen}
        onSelect={handleMasterSelect}
      />
      
      {/* MMQ運営者・クインズワルツ管理者用：マスター編集ダイアログ */}
      {canEditMaster && currentMasterId && (
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

      {/* マスターへの反映 確認ダイアログ */}
      <ConfirmDialog
        open={isApplyToMasterConfirmOpen}
        onOpenChange={setIsApplyToMasterConfirmOpen}
        title="現在の編集内容をマスターに反映しますか？"
        description="この操作により、他の組織がこのシナリオを引用した際に、更新された情報が適用されます。"
        confirmLabel="反映する"
        variant="default"
        onConfirm={runApplyToMaster}
      />

      {/* シナリオ削除 確認ダイアログ */}
      <ConfirmDialog
        open={isDeleteScenarioConfirmOpen}
        onOpenChange={setIsDeleteScenarioConfirmOpen}
        title={`「${formData.title}」を削除しますか？`}
        description="この組織のシナリオ一覧から削除されます（シナリオマスターは削除されません）。この操作は取り消せません。"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={runDelete}
      />
    </Dialog>
  )
}

