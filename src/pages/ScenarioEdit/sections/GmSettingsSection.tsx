import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

interface GmSettingsSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function GmSettingsSection({ formData, setFormData }: GmSettingsSectionProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>GM基本設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gm_count">必要GM数</Label>
              <Input
                id="gm_count"
                type="number"
                min="1"
                max="5"
                value={formData.gm_count}
                onChange={(e) => setFormData(prev => ({ ...prev, gm_count: parseInt(e.target.value) || 1 }))}
              />
              <p className="text-sm text-muted-foreground mt-1">
                このシナリオに必要なGMの人数
              </p>
            </div>
            <div className="flex items-center gap-2 pt-8">
              <input
                type="checkbox"
                id="has_pre_reading"
                checked={formData.has_pre_reading}
                onChange={(e) => setFormData(prev => ({ ...prev, has_pre_reading: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="has_pre_reading" className="cursor-pointer">
                事前読み込みあり
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GM報酬設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.gm_assignments.map((assignment, index) => (
            <div key={index} className="border rounded p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>役割</Label>
                  <Input
                    value={assignment.role === 'main' ? 'メインGM' : assignment.role === 'sub' ? 'サブGM' : assignment.role}
                    disabled
                  />
                </div>
                <div>
                  <Label>報酬（円）</Label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={assignment.reward}
                    onChange={(e) => {
                      const newAssignments = [...formData.gm_assignments]
                      newAssignments[index] = { ...assignment, reward: parseInt(e.target.value) || 0 }
                      setFormData(prev => ({ ...prev, gm_assignments: newAssignments }))
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
          {formData.gm_assignments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              GM報酬設定がありません
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

