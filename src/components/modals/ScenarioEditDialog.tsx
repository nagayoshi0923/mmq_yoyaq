import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'
import { useScenariosQuery, useScenarioMutation } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'

// 各セクションのコンポーネント
import { BasicInfoSection } from '@/pages/ScenarioEdit/sections/BasicInfoSection'
import { GameInfoSection } from '@/pages/ScenarioEdit/sections/GameInfoSection'
import { PricingSection } from '@/pages/ScenarioEdit/sections/PricingSection'
import { GmSettingsSection } from '@/pages/ScenarioEdit/sections/GmSettingsSection'
import { CostsPropsSection } from '@/pages/ScenarioEdit/sections/CostsPropsSection'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

// API関連
import { staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import type { Staff } from '@/types'

interface ScenarioEditDialogProps {
  isOpen: boolean
  onClose: () => void
  scenarioId: string | null
  onSaved?: () => void
}

export function ScenarioEditDialog({ isOpen, onClose, scenarioId, onSaved }: ScenarioEditDialogProps) {
  const [formData, setFormData] = useState<ScenarioFormData>({
    title: '',
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
    production_costs: [],
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
    participation_costs: [{ time_slot: 'normal', amount: 3000, type: 'fixed' }],
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

  // スタッフデータ用のstate
  const [staff, setStaff] = useState<Staff[]>([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  
  // 担当関係データ用のstate
  const [currentAssignments, setCurrentAssignments] = useState<any[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  // ローディング状態
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)

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

  // シナリオIDが変わった時（またはモーダルが開いた時）に担当関係を取得
  useEffect(() => {
    const loadAssignments = async () => {
      if (isOpen && scenarioId) {
        try {
          setIsLoadingAssignments(true)
          const assignments = await assignmentApi.getScenarioAssignments(scenarioId)
          setCurrentAssignments(assignments)
          setSelectedStaffIds(assignments.map(a => a.staff_id))
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
      const scenario = scenarios.find(s => s.id === scenarioId)
      if (scenario) {
        // データをフォームにマッピング
        // participation_costs は DB に存在しないため、常に participation_fee から生成
        const participationCosts = [
          { time_slot: 'normal', amount: scenario.participation_fee || 3000, type: 'fixed' as const }
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
          author: scenario.author || '',
          author_email: scenario.author_email || '',
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
        production_costs: [],
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
        participation_costs: [{ time_slot: 'normal', amount: 3000, type: 'fixed' }],
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

  const handleSave = async (closeAfterSave: boolean = true) => {
    if (!formData.title.trim()) {
      showToast.warning('タイトルを入力してください')
      return
    }

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
        const originalStaffIds = currentAssignments.map(a => a.staff_id).sort()
        const newStaffIds = [...selectedStaffIds].sort()
        
        // 担当GMが変更された場合、リレーションテーブルを更新
        if (JSON.stringify(originalStaffIds) !== JSON.stringify(newStaffIds)) {
          try {
            // 差分更新ロジックを使用
            await assignmentApi.updateScenarioAssignments(targetScenarioId, selectedStaffIds)
          } catch (syncError) {
            logger.error('Error updating GM assignments:', syncError)
            showToast.warning('シナリオは保存されました', '担当GMの更新に失敗しました。手動で確認してください')
          }
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
      if (closeAfterSave) {
        onClose()
      }
    } catch (err: unknown) {
      logger.error('詳細エラー:', err)
      const message = err instanceof Error ? err.message : JSON.stringify(err)
      showToast.error('保存に失敗しました', message)
      logger.error('シナリオ保存エラー:', err)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent size="lg" className="max-w-[95vw] sm:max-w-3xl h-[85vh] sm:h-[min(80vh,600px)] p-0 flex flex-col overflow-hidden [&>button]:z-10">
        <DialogHeader className="px-2 sm:px-3 pt-2 pb-1.5 border-b shrink-0">
          <DialogTitle className="text-sm">{scenarioId ? 'シナリオ編集' : '新規シナリオ'}</DialogTitle>
          <DialogDescription className="text-[10px]">
            {formData.title ? `${formData.title}を編集` : '情報を入力'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-2 sm:px-3 py-2 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
            {/* 左カラム: 基本情報・ゲーム情報 */}
            <div className="space-y-2 sm:space-y-3">
              <BasicInfoSection formData={formData} setFormData={setFormData} />
              <GameInfoSection formData={formData} setFormData={setFormData} />
            </div>

            {/* 右カラム: 料金・GM設定・制作費 */}
            <div className="space-y-2 sm:space-y-3">
              <PricingSection formData={formData} setFormData={setFormData} />
              <GmSettingsSection 
                formData={formData} 
                setFormData={setFormData} 
                staff={staff}
                loadingStaff={loadingStaff}
                selectedStaffIds={selectedStaffIds}
                onStaffSelectionChange={setSelectedStaffIds}
                currentAssignments={currentAssignments}
              />
              <CostsPropsSection formData={formData} setFormData={setFormData} />
            </div>
          </div>
        </div>

        {/* フッターボタン（固定） */}
        <div className="flex justify-end gap-1.5 px-2 sm:px-3 py-1.5 border-t bg-muted/30 shrink-0">
          <Button type="button" variant="outline" onClick={onClose} size="sm">
            キャンセル
          </Button>
          <Button 
            variant="outline" 
            onClick={() => handleSave(false)} 
            disabled={scenarioMutation.isPending || isLoadingAssignments}
            size="sm"
          >
            {scenarioId ? '保存' : '作成'}
          </Button>
          <Button 
            onClick={() => handleSave(true)} 
            disabled={scenarioMutation.isPending || isLoadingAssignments}
            size="sm"
          >
            <Save className="h-3 w-3 mr-1" />
            {isLoadingAssignments ? '読込中...' : scenarioMutation.isPending ? '保存中...' : (scenarioId ? '保存して閉じる' : '作成して閉じる')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
