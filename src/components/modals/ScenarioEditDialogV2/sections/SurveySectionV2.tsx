import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { ClipboardList, ExternalLink } from 'lucide-react'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

const labelStyle = "text-xs font-medium mb-0.5 block"
const hintStyle = "text-[11px] text-muted-foreground mt-0.5"
const inputStyle = "h-8 text-sm"

interface SurveySectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function SurveySectionV2({ formData, setFormData }: SurveySectionV2Props) {
  return (
    <div className="space-y-4">
      {/* 公演前アンケート（シナリオ別） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            公演前アンケート
          </CardTitle>
          <CardDescription className="text-xs">
            このシナリオの公演前にお客様へ案内するアンケートを設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="survey_enabled"
              checked={formData.survey_enabled || false}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, survey_enabled: checked }))}
            />
            <Label htmlFor="survey_enabled" className="font-medium cursor-pointer">
              アンケートを有効にする
            </Label>
          </div>
          
          {formData.survey_enabled && (
            <div className="space-y-2">
              <Label className={labelStyle}>アンケートURL</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.survey_url || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, survey_url: e.target.value }))}
                  placeholder="https://forms.google.com/..."
                  className={`${inputStyle} flex-1`}
                />
                {formData.survey_url && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => window.open(formData.survey_url!, '_blank')}
                    title="アンケートを開く"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className={hintStyle}>
                Google Forms等のURLを設定すると、公演前にお客様へ案内されます。
                シナリオ固有の事前調査（キャラクター希望、アレルギー情報など）に利用できます。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 注意事項 */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-4">
          <p className="text-sm text-amber-800">
            <span className="font-medium">💡 公演後アンケートについて</span>
            <br />
            公演後のアンケート（満足度調査など）は、設定 &gt; 組織情報 で組織全体に共通のURLを設定できます。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
