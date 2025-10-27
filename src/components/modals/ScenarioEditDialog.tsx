import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'
import type { Scenario } from '@/types'
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
    gm_assignments: [{ role: 'main', category: 'normal', reward: 2000 }],
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
        const participationCosts = scenario.participation_costs || [
          { time_slot: 'normal', amount: scenario.participation_fee || 3000, type: 'fixed' as const }
        ]

        // license_rewardsが空の場合、license_amountとgm_test_license_amountから生成
        const licenseRewards = scenario.license_rewards && scenario.license_rewards.length > 0
          ? scenario.license_rewards
          : [
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
          gm_count: scenario.gm_count || 1,
          gm_assignments: (scenario.gm_costs && scenario.gm_costs.length > 0) 
            ? scenario.gm_costs.map(cost => ({
                ...cost,
                category: cost.category || 'normal'
              }))
            : [{ role: 'main', category: 'normal', reward: 2000 }],
          participation_costs: participationCosts,
          use_flexible_pricing: scenario.use_flexible_pricing || false,
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
        gm_assignments: [{ role: 'main', category: 'normal', reward: 2000 }],
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
      // データベースに存在しないフィールドを除外
      const { 
        gm_assignments, 
        use_flexible_pricing, 
        flexible_pricing,
        ...dbFields 
      } = formData
      
      const scenarioData: any = {
        ...dbFields,
        gm_costs: formData.gm_assignments,
        updated_at: new Date().toISOString()
      }

      if (scenarioId) {
        scenarioData.id = scenarioId
      }

      console.log('保存するデータ:', JSON.stringify(scenarioData, null, 2))
      
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
      <DialogContent className="max-w-7xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{scenarioId ? 'シナリオ編集' : '新規シナリオ作成'}</DialogTitle>
          <DialogDescription>
            {formData.title ? `${formData.title}の情報を編集します` : 'シナリオの情報を入力してください'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/30 shrink-0">
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

