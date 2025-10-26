import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { useSessionState } from '@/hooks/useSessionState'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Save, BookOpen, FileText, DollarSign, Users, Package, Calendar } from 'lucide-react'
import type { Scenario, Staff } from '@/types'
import { useScenariosQuery, useScenarioMutation } from '../ScenarioManagement/hooks/useScenarioQuery'
import { staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { getCurrentJST } from '@/utils/dateUtils'
import { logger } from '@/utils/logger'

// 各セクションのコンポーネント
import { BasicInfoSection } from './sections/BasicInfoSection'
import { GameInfoSection } from './sections/GameInfoSection'
import { PricingSection } from './sections/PricingSection'
import { GmSettingsSection } from './sections/GmSettingsSection'
import { CostsPropsSection } from './sections/CostsPropsSection'
import { PerformanceScheduleSection } from './sections/PerformanceScheduleSection'

// 型定義
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

// サイドバーのメニュー項目定義（定数として外に出す）
const SCENARIO_EDIT_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'basic', label: '基本情報', icon: BookOpen, description: 'タイトル、作者、説明文' },
  { id: 'game-info', label: 'ゲーム情報', icon: FileText, description: '所要時間、人数、難易度' },
  { id: 'pricing', label: '料金設定', icon: DollarSign, description: '参加費、ライセンス料' },
  { id: 'gm-settings', label: 'GM・スタッフ設定', icon: Users, description: 'GM数、報酬、担当GM設定' },
  { id: 'costs-props', label: '制作費・小道具', icon: Package, description: '制作費、必要小道具' },
  { id: 'performance-schedule', label: '公演・スケジュール', icon: Calendar, description: '実施店舗、予約枠' }
]

export function ScenarioEdit() {
  const [activeTab, setActiveTab] = useSessionState('scenarioEditActiveTab', 'basic')
  const [scenarioId, setScenarioId] = useState<string | null>(null)
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
    license_amount: 1500,
    gm_test_license_amount: 0,
    license_rewards: [],
    has_pre_reading: false,
    gm_count: 1,
    gm_assignments: [{ role: 'main', category: 'normal', reward: 2000 }],
    participation_costs: [{ time_slot: '通常', amount: 3000, type: 'fixed' }],
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

  // スタッフデータ
  const [staff, setStaff] = useState<Staff[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)

  // React Query
  const { data: scenarios = [] } = useScenariosQuery()
  const scenarioMutation = useScenarioMutation()

  // URLからシナリオIDを取得
  useEffect(() => {
    const hash = window.location.hash
    const match = hash.match(/scenarios\/edit\/(.+)/)
    if (match) {
      const id = match[1]
      setScenarioId(id === 'new' ? null : id)
    }
  }, [])

  // シナリオデータをロード
  useEffect(() => {
    if (scenarioId && scenarios.length > 0) {
      const scenario = scenarios.find(s => s.id === scenarioId)
      if (scenario) {
        // 参加費の配列を構築（既存データがない場合は participation_fee から生成）
        let participationCosts = scenario.participation_costs || []
        if (participationCosts.length === 0) {
          const costs = []
          // 通常参加費
          if (scenario.participation_fee) {
            costs.push({
              time_slot: 'normal',
              amount: scenario.participation_fee,
              type: 'fixed' as const,
              status: 'active' as const,
              usageCount: 0
            })
          }
          // GMテスト参加費
          if (scenario.gm_test_participation_fee !== undefined && scenario.gm_test_participation_fee !== null) {
            costs.push({
              time_slot: 'gmtest',
              amount: scenario.gm_test_participation_fee,
              type: 'fixed' as const,
              status: 'active' as const,
              usageCount: 0
            })
          }
          participationCosts = costs
        }

        // ライセンス料の配列を構築（既存データがない場合は license_amount から生成）
        let licenseRewards = scenario.license_rewards || []
        if (licenseRewards.length === 0) {
          const rewards = []
          // 通常ライセンス料
          if (scenario.license_amount) {
            rewards.push({
              item: 'normal',
              amount: scenario.license_amount,
              type: 'fixed' as const,
              status: 'active' as const,
              usageCount: 0
            })
          }
          // GMテストライセンス料
          if (scenario.gm_test_license_amount !== undefined && scenario.gm_test_license_amount !== null) {
            rewards.push({
              item: 'gmtest',
              amount: scenario.gm_test_license_amount,
              type: 'fixed' as const,
              status: 'active' as const,
              usageCount: 0
            })
          }
          licenseRewards = rewards
        }

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
          production_costs: scenario.production_costs || [],
          genre: scenario.genre || [],
          required_props: scenario.required_props || [],
          license_amount: scenario.license_amount || 1500,
          gm_test_license_amount: scenario.gm_test_license_amount || 0,
          license_rewards: licenseRewards,
          has_pre_reading: scenario.has_pre_reading || false,
          gm_count: scenario.gm_count || 1,
          gm_assignments: (scenario.gm_costs && scenario.gm_costs.length > 0) 
            ? scenario.gm_costs.map(cost => ({
                ...cost,
                category: cost.category || 'normal' // デフォルトは通常公演
              }))
            : [{ role: 'main', category: 'normal', reward: 2000 }],
          participation_costs: participationCosts,
          use_flexible_pricing: scenario.use_flexible_pricing || false,
          flexible_pricing: scenario.flexible_pricing || {
            base_pricing: { participation_fee: 3000 },
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
        loadCurrentAssignments(scenarioId)
      }
    }
  }, [scenarioId, scenarios])

  // スタッフデータをロード
  useEffect(() => {
    loadStaffData()
  }, [])

  const loadStaffData = async () => {
    try {
      const staffData = await staffApi.getAll()
      setStaff(staffData)
    } catch (error) {
      logger.error('スタッフデータの取得に失敗:', error)
    }
  }

  const loadCurrentAssignments = async (id: string) => {
    try {
      const assignments = await assignmentApi.getScenarioAssignments(id)
      setSelectedStaffIds(assignments.map((a: any) => a.staff_id))
    } catch (error) {
      logger.error('担当データの取得に失敗:', error)
    }
  }

  const handleBack = () => {
    window.location.hash = 'scenarios'
  }

  const handleSave = async () => {
    // バリデーション
    if (!formData.title.trim()) {
      alert('タイトルを入力してください')
      return
    }
    if (!formData.author.trim()) {
      alert('作者を入力してください')
      return
    }

    try {
      // formDataからScenarioデータに変換（gm_assignments → gm_costs）
      // データベースに存在しないフィールドを除外
      const { gm_assignments, use_flexible_pricing, flexible_pricing, gm_count, ...restFormData } = formData
      
      const scenarioData: Scenario = {
        id: scenarioId || crypto.randomUUID(),
        ...restFormData,
        gm_costs: gm_assignments, // gm_assignmentsをgm_costsに変換
        available_gms: [], // 必須フィールド
        play_count: scenarioId ? scenarios.find(s => s.id === scenarioId)?.play_count || 0 : 0,
        created_at: scenarioId ? scenarios.find(s => s.id === scenarioId)?.created_at || getCurrentJST().toISOString() : getCurrentJST().toISOString(),
        updated_at: getCurrentJST().toISOString()
      }

      logger.log('保存するデータ:', scenarioData)

      const result = await scenarioMutation.mutateAsync({ 
        scenario: scenarioData, 
        isEdit: !!scenarioId 
      })

      logger.log('保存結果:', result)

      // スタッフ割り当ての更新
      if (scenarioData.id) {
        await assignmentApi.updateScenarioAssignments(scenarioData.id, selectedStaffIds)
      }

      // 新規作成の場合はシナリオIDを設定して、URLも更新
      if (!scenarioId && result) {
        setScenarioId(result.id || scenarioData.id)
        window.history.replaceState(null, '', `#scenarios/edit/${result.id || scenarioData.id}`)
      }

      // formDataを保存したデータで更新（楽観的更新による上書きを防ぐ）
      // gm_costsをgm_assignmentsに戻す
      setFormData(prev => ({
        ...prev,
        gm_assignments: scenarioData.gm_costs,
        participation_costs: scenarioData.participation_costs,
        license_rewards: scenarioData.license_rewards
      }))

      // 成功メッセージを表示
      setShowSaveSuccess(true)
      setTimeout(() => setShowSaveSuccess(false), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '不明なエラー'
      alert(`保存に失敗しました: ${message}`)
      logger.error('シナリオ保存エラー:', err)
    }
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'basic':
        return <BasicInfoSection formData={formData} setFormData={setFormData} />
      case 'game-info':
        return <GameInfoSection formData={formData} setFormData={setFormData} />
      case 'pricing':
        return <PricingSection formData={formData} setFormData={setFormData} />
      case 'gm-settings':
        return (
          <GmSettingsSection 
            formData={formData} 
            setFormData={setFormData}
            staff={staff}
            selectedStaffIds={selectedStaffIds}
            setSelectedStaffIds={setSelectedStaffIds}
            isNewScenario={!scenarioId}
          />
        )
      case 'costs-props':
        return <CostsPropsSection formData={formData} setFormData={setFormData} />
      case 'performance-schedule':
        return (
          <PerformanceScheduleSection 
            formData={formData}
            scenarioId={scenarioId}
          />
        )
      default:
        return <BasicInfoSection formData={formData} setFormData={setFormData} />
    }
  }

  return (
    <AppLayout
      currentPage="scenarios"
      sidebar={
        <UnifiedSidebar
          title="シナリオ管理"
          mode="edit"
          menuItems={SCENARIO_EDIT_MENU_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onBackToList={handleBack}
          editModeSubtitle={formData.title || '新規シナリオ'}
        />
      }
      maxWidth="max-w-7xl"
      containerPadding="px-8 py-6"
      stickyLayout={true}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">
            {scenarioId ? 'シナリオ編集' : '新規シナリオ作成'}
          </h2>
          {formData.title && (
            <p className="text-sm text-muted-foreground mt-1">
              {formData.title}
            </p>
          )}
          {scenarioId && !formData.title && (
            <p className="text-sm text-muted-foreground mt-1">
              ID: {scenarioId}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {showSaveSuccess && (
            <div className="text-sm text-green-600 font-medium animate-in fade-in slide-in-from-right-1">
              ✓ 保存しました
            </div>
          )}
          <Button onClick={handleSave} disabled={scenarioMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {scenarioMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* コンテンツ */}
      {renderContent()}
    </AppLayout>
  )
}

export default ScenarioEdit

