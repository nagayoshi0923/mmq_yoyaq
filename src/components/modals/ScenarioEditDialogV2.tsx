import { readSurveyQuestionSettings, saveSurveyQuestionSettings, type SurveyQuestionSnapshot } from '@/lib/surveyQuestionSettings'
import { ScenarioSettingSources } from '@/components/settings/ScenarioSettingSources'
import { scenarioEffectiveFields, scenarioSourcePayload, type ScenarioSourceState, type SourceValues } from '@/lib/scenarioSettingSources'
import { settingsPath } from '@/components/settings/settingsCatalog'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import './ScenarioEditDialogV2.css'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'
import { ScenarioMasterEditDialog } from './ScenarioMasterEditDialog'
import { MasterSelectDialog } from './MasterSelectDialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useQueryClient } from '@tanstack/react-query'
import { useScenariosQuery, useScenarioMutation, useDeleteScenarioMutation } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { useOrganizationScenariosQuery } from '@/pages/ScenarioManagement/hooks/useOrganizationScenariosQuery'
import { scenarioMasterApi, type ScenarioMaster } from '@/lib/api/scenarioMasterApi'
import { invalidateAssignmentQueries } from '@/lib/queryInvalidation'

// V2セクションコンポーネント（カード形式でレイアウト改善）
import { SaveOptionsDialog } from './ScenarioEditDialogV2/sections/SaveOptionsDialog'
import { ScenarioTabContent } from './ScenarioEditDialogV2/sections/ScenarioTabContent'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditDialogV2/types'
import { initialScenarioFormData, newScenarioFormData, scenarioToFormData } from './ScenarioEditDialogV2/utils/formData'
import { buildOrgScenarioPayload, buildScenarioSaveData, importedMasterIdForNewSave } from './ScenarioEditDialogV2/utils/savePayload'
import { buildHeaderScenarioOptions, computeMasterDiffs, emptyScenarioStats, scenarioSaveErrorMessage } from './ScenarioEditDialogV2/utils/headerAndDiffs'
import { useScenarioOrganizationNames } from './ScenarioEditDialogV2/useScenarioOrganizationNames'
import { upsertOrganizationScenario } from './ScenarioEditDialogV2/utils/saveOrganizationScenario'
import { loadOrgScenarioSettings } from './ScenarioEditDialogV2/utils/loadOrgScenarioSettings'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'

// API関連
import { staffApi, scenarioApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { useScenarioGmAssignments } from '@/hooks/useScenarioGmAssignments'
import { organizationScenarioReadApi } from '@/lib/api/scenarioReadApi'
import { getCurrentOrganizationId } from '@/lib/organization'
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
  { id: 'basic', label: '基本情報' },
  { id: 'game', label: 'ゲーム設定' },
  { id: 'characters', label: 'キャラクター' },
  { id: 'pricing', label: '料金' },
  { id: 'booking-policy', label: '予約条件' },
  { id: 'gm', label: 'GM' },
  { id: 'costs', label: '売上' },
  { id: 'performances', label: '公演実績' },
  { id: 'email', label: 'メール' },
  { id: 'survey', label: '事前配役アンケート' },
] as const

type TabId = typeof TABS[number]['id']
const TAB_IDS: readonly TabId[] = TABS.map((tab) => tab.id)

// localStorageからタブを取得する関数
const getSavedTab = (): TabId => {
  const saved = localStorage.getItem('scenarioEditDialogTab')
  if (saved && (TAB_IDS as readonly string[]).includes(saved)) {
    return saved as TabId
  }
  return 'basic'
}

// Each scenario/open gets a fresh editor. Late requests from a deleted/previous
// scenario cannot populate the next scenario's form or GM selection.
export function ScenarioEditDialogV2(props: ScenarioEditDialogV2Props) {
  if (!props.isOpen) return null
  return <ScenarioEditDialogSession key={props.scenarioId || 'new'} {...props} />
}

function ScenarioEditDialogSession({ isOpen, onClose, scenarioId, onSaved, onScenarioChange, sortedScenarioIds }: ScenarioEditDialogV2Props) {
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

  const [formData, setFormData] = useState<ScenarioFormData>(initialScenarioFormData)
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
  const [sourceState, setSourceState] = useState<ScenarioSourceState | null>(null)
  const [surveySnapshot, setSurveySnapshot] = useState<(SurveyQuestionSnapshot & { scenarioId: string }) | null>(null)
  const settingsLoadGeneration = useRef(0)
  useEffect(() => {
    settingsLoadGeneration.current += 1
    setSurveySnapshot(null)
    setSourceState(null)
  }, [isOpen, scenarioId])
  const [sourceResets, setSourceResets] = useState<SourceValues>({})
  const [masterData, setMasterData] = useState<ScenarioMaster | null>(null)
  const [loadingMaster, setLoadingMaster] = useState(false)
  
  // 現在編集中のシナリオ（マスター編集用） - useEffectより前に定義する必要あり
  const { data: orgScenariosData } = useOrganizationScenariosQuery(currentOrgId)
  const currentScenario = useMemo(() => {
    if (!scenarioId) return null
    const fromList = scenarios.find((s) => s.id === scenarioId || s.scenario_master_id === scenarioId)
    if (fromList) return fromList
    const fromOrg = orgScenariosData?.scenarios.find(
      (s) => s.scenario_master_id === scenarioId || s.id === scenarioId || s.org_scenario_id === scenarioId
    )
    return (fromOrg as typeof fromList) ?? null
  }, [scenarioId, scenarios, orgScenariosData?.scenarios])
  const currentMasterId = currentScenario?.scenario_master_id || formData.scenario_master_id
  const currentOrgScenarioId = orgScenariosData?.scenarios.find(row => row.scenario_master_id === currentMasterId)?.org_scenario_id

  const headerScenarioOptions = useMemo(() => buildHeaderScenarioOptions(orgScenariosData?.scenarios ?? [], scenarios, sortedScenarioIds, scenarioId, formData.title), [orgScenariosData?.scenarios, scenarios, sortedScenarioIds, scenarioId, formData.title])

  const headerSelectValue = scenarioId && headerScenarioOptions.some((s) => s.id === scenarioId)
    ? scenarioId
    : undefined
  
  // scenario_master_id を直接使用（旧ID解決は不要）
  // staff_scenario_assignments.scenario_id は scenario_master_id と統一済み
  
  // 組織名・予約サイト上のシナリオ詳細URL用 slug（所属組織を優先）
  const { organizationName, publicBookingOrgSlug } = useScenarioOrganizationNames(isOpen, scenarioId, currentScenario?.organization_id ?? formData.organization_id ?? null)

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
  const masterDiffs = useMemo(() => computeMasterDiffs(masterData, formData), [masterData, formData])

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

  const scenarioIdList = headerScenarioOptions.map((s) => s.id)

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
  const {
    currentAssignments, setCurrentAssignments, selectedStaffIds, setSelectedStaffIds,
    isLoadingAssignments, assignmentsReady, assignmentsError, getChanges, getBaseline, acceptAssignments,
  } = useScenarioGmAssignments(scenarioId)
  const [isSaving, setIsSaving] = useState(false)
  const saveInFlight = useRef(false)

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
    const baseline = scenarioEffectiveFields({}, master)
    setSourceState({ stored: {}, baseline })
    setSourceResets({})
    setMasterData(master)
    setFormData(prev => ({
      ...prev,
      scenario_master_id: master.id,  // マスタIDを記録
      ...baseline,
    }))
    showToast.success('マスタから情報を引用しました')
  }
  
  // 削除確認ダイアログ
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // シナリオ統計情報
  const [scenarioStats, setScenarioStats] = useState(emptyScenarioStats)

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

  // Statistics are independent of assignment readiness.
  useEffect(() => {
    if (!isOpen || !scenarioId) return
    let cancelled = false
    void scenarioApi.getScenarioStats(scenarioId).then(stats => {
      if (!cancelled) setScenarioStats(stats)
    }).catch(async () => {
      try {
        const count = await scenarioApi.getPerformanceCount(scenarioId)
        if (!cancelled) setScenarioStats(prev => ({ ...prev, performanceCount: count }))
      } catch { /* Statistics failure must not overwrite the editor. */ }
    })
    return () => { cancelled = true }
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
      setFormData(newScenarioFormData())
      return
    }

    if (scenariosQueryPending && scenarios.length === 0) return

    const hydrateFromScenario = (scenario: Scenario) => {
      setIsScenarioLoaded(true)
      formLoadedKeyRef.current = loadKey
        setFormData(scenarioToFormData(scenario))
        
        // organization_scenarios から override/custom 値を取得して formData を上書き
        // ビュー (organization_scenarios_with_master) の COALESCE と同じ優先順位で読み込む
        if (scenario.scenario_master_id) {
          void loadOrgScenarioSettings({
            scenario, masterId: scenario.scenario_master_id, loadGeneration: settingsLoadGeneration.current,
            isCurrent: (generation) => generation === settingsLoadGeneration.current,
            setFormData, setSurveySnapshot, setSourceState,
          })
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
    if (saveInFlight.current) return
    // 新規作成後のIDがあれば編集モードとして扱う
    const effectiveScenarioId = scenarioId || createdScenarioId

    if (effectiveScenarioId && currentMasterId && !sourceState) {
      showToast.error('設定元を読み込めていません。画面を開き直してください。')
      return
    }
    if (!assignmentsReady) {
      showToast.error('保存できません', '担当GMを読み込めていません。画面を開き直してください。')
      return
    }
    if (effectiveScenarioId && (!isScenarioLoaded || formLoadedKeyRef.current !== (scenarioId || 'new'))) {
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
    const assignmentChanges = getChanges()
    saveInFlight.current = true
    setIsSaving(true)

    try {
      const scenarioData: any = buildScenarioSaveData(formData, resolvedTitle, saveStatus, new Date().toISOString())

      if (effectiveScenarioId) {
        scenarioData.id = effectiveScenarioId
      }
      
      // マスタから引用した新規作成は、引用元のマスタを自組織へ登録するだけにする
      const importedMasterId = importedMasterIdForNewSave(effectiveScenarioId, formData.scenario_master_id)

      // scenarios テーブルへの保存（旧テーブル）
      // 失敗してもorganization_scenariosへの保存は続行する
      let scenarioSaveResult: any = null
      if (!importedMasterId) {
        try {
          scenarioSaveResult = await scenarioMutation.mutateAsync({
            scenario: scenarioData,
            isEdit: !!effectiveScenarioId
          })
        } catch (scenarioErr) {
          logger.warn('scenarios テーブル保存エラー（organization_scenariosへの保存は続行）:', scenarioErr)
          logger.warn('⚠️ scenarios保存エラー（続行）:', scenarioErr)
        }
      }

      // 担当GMの更新処理
      // scenario_master_id を直接使用
      const targetScenarioId = effectiveScenarioId || importedMasterId || (scenarioSaveResult && typeof scenarioSaveResult === 'object' && 'scenario_master_id' in scenarioSaveResult ? scenarioSaveResult.scenario_master_id : undefined)

      // マスタから引用した場合、organization_scenariosにも登録
      // scenariosテーブルの保存に失敗してもここは必ず実行する
      const masterIdForOrgSave = formData.scenario_master_id || targetScenarioId
      if (masterIdForOrgSave) {
        try {
          const organizationId = await getCurrentOrganizationId()
          if (!organizationId) {
            throw new Error('組織を確認できないため作品設定を保存できません')
          } else {
            // 既存のレコードがあるか確認
            const { data: existingOrgScenario, error: existingOrgError } = await organizationScenarioReadApi.findIdByMaster(masterIdForOrgSave, organizationId)
            
            if (existingOrgError) throw existingOrgError
            // organization_scenarios に保存するデータ（override/custom フィールド含む）
            const orgScenarioPayload = buildOrgScenarioPayload({
              organizationId, masterId: masterIdForOrgSave, scenarioData, formData, saveStatus,
              sourcePayload: sourceState ? scenarioSourcePayload({ ...formData, title: resolvedTitle }, sourceState, sourceResets) : {},
            })

            const orgScenarioId = await upsertOrganizationScenario({ organizationId, existingId: existingOrgScenario?.id ?? null, payload: orgScenarioPayload, formData })

            if (orgScenarioId && (formData.survey_enabled || formData.survey_questions !== undefined)) {
              let baseline = surveySnapshot?.scenarioId === orgScenarioId ? surveySnapshot : null
              if (!baseline) {
                // Newly created organization scenario has no previously loaded set.
                // Never overwrite existing questions using an invented empty baseline.
                const loaded = await readSurveyQuestionSettings(orgScenarioId)
                if (loaded.questions.length > 0) throw new Error('設問を読み直す必要があります。画面を開き直してください。')
                baseline = { ...loaded, scenarioId: orgScenarioId }
              }
              const saved = await saveSurveyQuestionSettings(orgScenarioId, formData.survey_questions || [], baseline.revision)
              setSurveySnapshot({ ...saved, scenarioId: orgScenarioId })
            }
          }
        } catch (orgErr) {
          logger.error('organization_scenarios処理エラー:', orgErr)
          throw orgErr
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

      if (sourceState) {
        setSourceState({ stored: { ...sourceState.stored, ...scenarioSourcePayload({ ...formData, title: resolvedTitle }, sourceState, sourceResets) }, baseline: { ...formData, title: resolvedTitle } })
        setSourceResets({})
      }

      if (targetScenarioId) {
        try {
          const changes = assignmentChanges
          if (changes.removed.length || changes.upserts.length) {
            const refreshed = await assignmentApi.saveScenarioGmChanges(targetScenarioId, changes, getBaseline())
            acceptAssignments(refreshed)
          }
        } catch (syncError) {
          logger.error('Error updating GM assignments:', syncError)
          // 基本情報は確定済み。GM失敗時も古い一覧・編集キャッシュを残さない。
          try {
            await Promise.all([
              invalidateAssignmentQueries(queryClient),
              queryClient.invalidateQueries({ queryKey: ['org-scenarios', 'list'], refetchType: 'all' }),
              queryClient.invalidateQueries({ queryKey: ['scenarios'], refetchType: 'all' }),
            ])
            await onSaved?.()
          } catch (refreshError) {
            logger.error('保存済みシナリオの再取得エラー:', refreshError)
          }
          showToast.warning('担当GMの保存を確認できませんでした', 'シナリオ基本情報は保存済みです。画面を開き直して担当の状態を確認してください')
          return
        }

        await invalidateAssignmentQueries(queryClient)
      }

      // Direct organization overrides are saved after the general mutation.
      // Refresh after both writes, including lists that are currently unmounted.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['org-scenarios', 'list'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['scenarios'], refetchType: 'all' }),
      ])
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
      const errorMessage = scenarioSaveErrorMessage(err)
      
      showToast.error('保存に失敗しました', errorMessage || getSafeErrorMessage(err, '不明なエラー'))
    } finally {
      saveInFlight.current = false
      setIsSaving(false)
    }
  }

  // シナリオ削除ハンドラ
  const handleDelete = () => {
    if (!scenarioId) return
    setIsDeleteScenarioConfirmOpen(true)
  }

  const runDelete = async () => {
    if (!scenarioId || saveInFlight.current) return
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
  const renderTabContent = (tabId: TabId) => (
    <ScenarioTabContent
      tabId={tabId}
      formData={formData}
      setFormData={setFormData}
      scenarioId={scenarioId}
      canDeleteScenario={canDeleteScenario}
      handleDelete={handleDelete}
      currentOrgScenarioId={currentOrgScenarioId}
      currentMasterId={currentMasterId}
      assignmentsError={assignmentsError}
      staff={staff}
      loadingStaff={loadingStaff}
      isLoadingAssignments={isLoadingAssignments}
      selectedStaffIds={selectedStaffIds}
      setSelectedStaffIds={setSelectedStaffIds}
      currentAssignments={currentAssignments}
      handleAssignmentUpdate={handleAssignmentUpdate}
      scenarioStats={scenarioStats}
    />
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        size="xl"
        overlayClassName="scenario-edit-dialog-overlay"
        className="scenario-edit-dialog-host [&>button]:hidden"
      >
        <DialogTitle className="sr-only">
          {scenarioId ? 'シナリオ編集' : '新規シナリオ'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {formData.title ? `${formData.title}を編集` : 'シナリオ情報を入力'}
        </DialogDescription>

        <header className="scenario-edit-dialog__header">
          <div className="scenario-edit-dialog__header-left">
            <span className="scenario-edit-dialog__title">
              {scenarioId ? 'シナリオ編集' : '新規シナリオ'}
            </span>
            {organizationName && (
              <span className="scenario-edit-dialog__org">{organizationName}</span>
            )}
            {onScenarioChange && headerScenarioOptions.length > 1 ? (
              <Select
                value={headerSelectValue}
                onValueChange={(value) => onScenarioChange(value)}
              >
                <SelectTrigger className="scenario-edit-dialog__scenario">
                  <SelectValue placeholder={formData.title || 'シナリオ'} />
                </SelectTrigger>
                <SelectContent className="scenario-edit-dialog__scenario-menu">
                  {headerScenarioOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : formData.title ? (
              <span className="scenario-edit-dialog__scenario">{formData.title}</span>
            ) : null}
          </div>
          <button type="button" className="scenario-edit-dialog__close" onClick={onClose}>
            閉じる
          </button>
        </header>

        <div className="scenario-edit-dialog__body">
          <nav className="scenario-edit-dialog__nav" aria-label="シナリオ編集セクション">
            {TABS.map((tab) => {
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  aria-current={selected ? 'page' : undefined}
                  className={selected ? 'scenario-edit-dialog__nav-item is-selected' : 'scenario-edit-dialog__nav-item'}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>

          <div key={activeTab} className="scenario-edit-dialog__content">
            <h2 className="scenario-edit-dialog__page-title">
              {TABS.find((tab) => tab.id === activeTab)?.label}
            </h2>
            {currentMasterId && <ScenarioSettingSources state={sourceState} current={{ ...formData }} master={masterData ? { ...masterData } : null} resets={sourceResets} onReset={(field, value) => {
              setSourceResets(prev => ({ ...prev, [field]: value }))
              setFormData(prev => ({ ...prev, [field]: value }))
            }} />}
            {publicBookingOrgSlug && <nav aria-label="関連する共通設定" className="flex flex-wrap gap-3 mb-4">
              <a className="underline" href={settingsPath(publicBookingOrgSlug, 'recruitment')} target="_blank" rel="noopener noreferrer">共通の募集基準 ↗</a>
              <a className="underline" href={settingsPath(publicBookingOrgSlug, 'salary')} target="_blank" rel="noopener noreferrer">報酬の共通基準 ↗</a>
              <a className="underline" href={settingsPath(publicBookingOrgSlug, 'email', formData.available_stores?.[0])} target="_blank" rel="noopener noreferrer">店舗のメール設定 ↗</a>
            </nav>}
            {scenarioId && currentMasterId && !sourceState ? <p role="status">作品の設定元を確認しています。読み込めない場合は画面を開き直してください。</p> : renderTabContent(activeTab)}
          </div>
        </div>

        <footer className="scenario-edit-dialog__footer">
          <div className="scenario-edit-dialog__meta">
            <span>{formData.title || '(未設定)'}</span>
            <span className="scenario-edit-dialog__meta-sep">|</span>
            <span>{formData.duration}分</span>
            <span className="scenario-edit-dialog__meta-sep">|</span>
            <span>
              {formData.player_count_min === formData.player_count_max
                ? `${formData.player_count_min}人`
                : `${formData.player_count_min}〜${formData.player_count_max}人`}
            </span>
            <span className="scenario-edit-dialog__meta-sep">|</span>
            <span>
              ¥{(formData.participation_costs?.find(c => c.time_slot === 'normal')?.amount || formData.participation_fee || 0).toLocaleString()}
            </span>
          </div>
          <div className="scenario-edit-dialog__actions">
            {formData.status === 'draft' && (
              <span className="scenario-edit-dialog__status is-draft">下書き</span>
            )}
            {formData.status === 'available' && (
              <span className="scenario-edit-dialog__status is-public">公開中</span>
            )}
            {formData.status === 'unavailable' && (
              <span className="scenario-edit-dialog__status is-private">非公開</span>
            )}
            {saveMessage && <span className="scenario-edit-dialog__status is-public">{saveMessage}</span>}
            {scenarioId && publicBookingOrgSlug && (
              <button
                type="button"
                className="scenario-edit-dialog__btn"
                onClick={() =>
                  window.open(`/${publicBookingOrgSlug}/scenario/${formData.slug || scenarioId}`, '_blank')
                }
              >
                シナリオ詳細
              </button>
            )}
            <button
              type="button"
              className="scenario-edit-dialog__btn"
              onClick={() => handleSave('draft')}
              disabled={isSaving || scenarioMutation.isPending || !assignmentsReady || (!!scenarioId && !!currentMasterId && !sourceState)}
            >
              下書き
            </button>
            {canEditMaster && currentMasterId && (
              <button
                type="button"
                className="scenario-edit-dialog__btn"
                onClick={() => setMasterEditDialogOpen(true)}
              >
                マスタ編集
              </button>
            )}
            {currentMasterId && (
              <button
                type="button"
                className="scenario-edit-dialog__btn"
                onClick={handleSyncFromMaster}
                disabled={loadingMaster || masterDiffs.count === 0}
              >
                共通情報の値をコピー
              </button>
            )}
            {!scenarioId && (
              <button
                type="button"
                className="scenario-edit-dialog__btn"
                onClick={() => setMasterSelectOpen(true)}
              >
                マスタから引用
              </button>
            )}
            {canEditMaster && currentMasterId && (
              <button
                type="button"
                className="scenario-edit-dialog__btn"
                onClick={handleApplyToMaster}
                disabled={masterDiffs.count === 0}
              >
                マスタ反映
              </button>
            )}
            {currentMasterId && currentScenario?.master_status === 'draft' && (
              <button
                type="button"
                className="scenario-edit-dialog__btn"
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
                {isSubmittingToMMQ ? '申請中…' : 'MMQへ申請'}
              </button>
            )}
            <button
              type="button"
              className="scenario-edit-dialog__btn-primary"
              onClick={() => {
                const currentStatus = formData.status === 'draft' ? 'available' : (formData.status as 'available' | 'unavailable')
                setSavePublishChoice(currentStatus === 'available' ? 'available' : 'unavailable')
                setSubmitToMMQ(false)
                setSaveOptionsOpen(true)
              }}
              disabled={isSaving || scenarioMutation.isPending || !assignmentsReady || (!!scenarioId && !!currentMasterId && !sourceState)}
            >
              保存
            </button>
          </div>
        </footer>
      </DialogContent>

      {/* 保存オプションダイアログ */}
      <SaveOptionsDialog
        open={saveOptionsOpen}
        onOpenChange={setSaveOptionsOpen}
        savePublishChoice={savePublishChoice}
        setSavePublishChoice={setSavePublishChoice}
        isDraftMaster={currentScenario?.master_status === 'draft'}
        submitToMMQ={submitToMMQ}
        setSubmitToMMQ={setSubmitToMMQ}
        isSaving={scenarioMutation.isPending}
        onConfirmSave={async () => {
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
      />

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
