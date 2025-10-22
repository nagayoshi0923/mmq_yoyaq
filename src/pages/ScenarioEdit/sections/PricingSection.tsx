import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

interface PricingSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function PricingSection({ formData, setFormData }: PricingSectionProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>参加費設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="participation_fee">基本参加費（円）</Label>
            <Input
              id="participation_fee"
              type="number"
              min="0"
              step="100"
              value={formData.participation_fee}
              onChange={(e) => setFormData(prev => ({ ...prev, participation_fee: parseInt(e.target.value) || 3000 }))}
            />
            <p className="text-sm text-muted-foreground mt-1">
              通常の参加費用を設定してください
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ライセンス料設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="license_amount">通常ライセンス料（円）</Label>
              <Input
                id="license_amount"
                type="number"
                min="0"
                step="100"
                value={formData.license_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, license_amount: parseInt(e.target.value) || 1500 }))}
              />
              <p className="text-sm text-muted-foreground mt-1">
                GMが支払うライセンス料
              </p>
            </div>
            <div>
              <Label htmlFor="gm_test_license_amount">GMテストライセンス料（円）</Label>
              <Input
                id="gm_test_license_amount"
                type="number"
                min="0"
                step="100"
                value={formData.gm_test_license_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, gm_test_license_amount: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-sm text-muted-foreground mt-1">
                GMテストセッション時の料金（0円も可）
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

