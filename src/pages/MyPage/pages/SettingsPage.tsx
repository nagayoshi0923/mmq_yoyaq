import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Settings as SettingsIcon } from 'lucide-react'

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            通知設定
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-notifications">メール通知</Label>
              <div className="text-sm text-muted-foreground">
                予約確認やお知らせをメールで受け取る
              </div>
            </div>
            <Switch id="email-notifications" disabled />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reservation-reminders">予約リマインダー</Label>
              <div className="text-sm text-muted-foreground">
                予約日の前日にリマインダーを受け取る
              </div>
            </div>
            <Switch id="reservation-reminders" disabled />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="marketing-emails">マーケティングメール</Label>
              <div className="text-sm text-muted-foreground">
                新作シナリオやキャンペーンのお知らせを受け取る
              </div>
            </div>
            <Switch id="marketing-emails" disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>表示設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="dark-mode">ダークモード</Label>
              <div className="text-sm text-muted-foreground">
                ダークテーマで表示する
              </div>
            </div>
            <Switch id="dark-mode" disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>言語</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">
              現在のバージョンでは日本語のみサポートしています。
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

