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

interface ScenarioEditDialogProps {
  isOpen: boolean
  onClose: () => void
  scenarioId: string | null
}

export function ScenarioEditDialog({ isOpen, onClose, scenarioId }: ScenarioEditDialogProps) {
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
    license_rewards: [
      { item: 'normal', amount: 1500, type: 'fixed' },
      { item: 'gmtest', amount: 0, type: 'fixed' }
    ],
    has_pre_reading: false,
    gm_count: 1,
    gm_assignments: [{ role: 'main', category: 'normal' as const, reward: 2000 }],
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

  // シナリオデータをロード
  useEffect(() => {
    if (scenarioId && scenarios.length > 0) {
      const scenario = scenarios.find(s => s.id === scenarioId)
      if (scenario) {
        // データをフォームにマッピング
        // participation_costs は DB に存在しないため、常に participation_fee から生成
        const participationCosts = [
          { time_slot: 'normal', amount: scenario.participation_fee || 3000, type: 'fixed' as const }
        ]

        // license_rewards は DB に存在しないため、常に license_amount から生成
        const licenseRewards = [
          { item: 'normal', amount: scenario.license_amount || 1500, type: 'fixed' as const },
          { item: 'gmtest', amount: scenario.gm_test_license_amount || 0, type: 'fixed' as const }
        ]
        
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
          gm_count: (scenario as any).gm_count || 1, // フォーム専用フィールド
          gm_assignments: (scenario.gm_costs && scenario.gm_costs.length > 0) 
            ? scenario.gm_costs.map(cost => ({
                role: cost.role,
                reward: cost.reward,
                category: cost.category || 'normal' as 'normal' | 'gmtest'
              }))
            : [{ role: 'main', category: 'normal' as const, reward: 2000 }],
          participation_costs: participationCosts,
          use_flexible_pricing: (scenario as any).use_flexible_pricing || false, // フォーム専用フィールド
          flexible_pricing: scenario.flexible_pricing || formData.flexible_pricing,
          key_visual_url: scenario.key_visual_url || ''
        })
      }
    } else if (!scenarioId) {
      // 新規作成時は初期値にリセット
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
        license_amount: 1500,
        gm_test_license_amount: 0,
        license_rewards: [
          { item: 'normal', amount: 1500, type: 'fixed' },
          { item: 'gmtest', amount: 0, type: 'fixed' }
        ],
        has_pre_reading: false,
        gm_count: 1,
        gm_assignments: [{ role: 'main', category: 'normal' as const, reward: 2000 }],
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
    }
  }, [scenarioId, scenarios])

  const handleSave = async () => {
    if (!formData.title.trim()) {
      alert('タイトルを入力してください')
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
        ...dbFields 
      } = formData
      
      // UI専用配列からDB用の単一値に変換
      const normalParticipationCost = formData.participation_costs?.find(c => c.time_slot === 'normal')
      const normalLicenseReward = formData.license_rewards?.find(r => r.item === 'normal')
      const gmtestLicenseReward = formData.license_rewards?.find(r => r.item === 'gmtest')
      
      const scenarioData: any = {
        ...dbFields,
        participation_fee: normalParticipationCost?.amount || formData.participation_fee || 3000,
        license_amount: normalLicenseReward?.amount || formData.license_amount || 1500,
        gm_test_license_amount: gmtestLicenseReward?.amount || formData.gm_test_license_amount || 0,
        gm_costs: formData.gm_assignments.map(assignment => ({
          role: assignment.role,
          reward: assignment.reward,
          ...(assignment.category && { category: assignment.category })
        })),
        // gm_countはScenario型にないためコメントアウト（フォーム専用フィールド）
        // gm_count: formData.gm_count || 1,
        updated_at: new Date().toISOString()
      }

      if (scenarioId) {
        scenarioData.id = scenarioId
      }
      
      await scenarioMutation.mutateAsync({
        scenario: scenarioData,
        isEdit: !!scenarioId
      })

      onClose()
    } catch (err: unknown) {
      console.error('詳細エラー:', err)
      const message = err instanceof Error ? err.message : JSON.stringify(err)
      alert(`保存に失敗しました: ${message}`)
      logger.error('シナリオ保存エラー:', err)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-7xl max-h-[90vh] sm:max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6 pb-2 sm:pb-4 border-b shrink-0">
          <DialogTitle>{scenarioId ? 'シナリオ編集' : '新規シナリオ作成'}</DialogTitle>
          <DialogDescription>
            {formData.title ? `${formData.title}の情報を編集します` : 'シナリオの情報を入力してください'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
            {/* 左カラム: 基本情報・ゲーム情報 */}
            <div className="space-y-6">
              <BasicInfoSection formData={formData} setFormData={setFormData} />
              <GameInfoSection formData={formData} setFormData={setFormData} />
            </div>

            {/* 右カラム: 料金・GM設定・制作費 */}
            <div className="space-y-6">
              <PricingSection formData={formData} setFormData={setFormData} />
              <GmSettingsSection formData={formData} setFormData={setFormData} />
              <CostsPropsSection formData={formData} setFormData={setFormData} />
            </div>
          </div>
        </div>

        {/* フッターボタン（固定） */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 border-t bg-muted/30 shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={scenarioMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {scenarioMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

