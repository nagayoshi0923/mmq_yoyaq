import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Settings as SettingsIcon, Trash2, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { deleteMyAccount } from '@/lib/userApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { customerApi } from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)

  const handleDeleteAccount = async () => {
    if (confirmEmail !== user?.email) {
      showToast.warning('メールアドレスが一致しません', '正確に入力してください')
      return
    }

    if (!confirm('本当にアカウントを削除しますか？この操作は取り消せません。')) {
      return
    }

    setDeleting(true)
    try {
      // customersテーブルのレコードを削除（存在する場合）
      if (user?.id) {
        try {
          const { data: customerData } = await supabase
            .from('customers')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()
          
          if (customerData?.id) {
            await customerApi.delete(customerData.id)
            logger.log('✅ 顧客情報を削除しました')
          }
        } catch (error: any) {
          logger.warn('顧客情報の削除エラー（続行）:', error)
          // エラーでも続行（customersレコードが存在しない可能性がある）
        }
      }

      // auth.usersとpublic.usersも削除
      await deleteMyAccount()
      
      showToast.success('アカウントを削除しました')
      await signOut()
      window.location.hash = '#login'
    } catch (error: any) {
      logger.error('アカウント削除エラー:', error)
      showToast.error('アカウントの削除に失敗しました', error.message || '不明なエラー')
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setConfirmEmail('')
    }
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-none border">
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
              <div className="text-xs text-muted-foreground">
                予約確認やお知らせをメールで受け取る
              </div>
            </div>
            <Switch id="email-notifications" disabled />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reservation-reminders">予約リマインダー</Label>
              <div className="text-xs text-muted-foreground">
                予約日の前日にリマインダーを受け取る
              </div>
            </div>
            <Switch id="reservation-reminders" disabled />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="marketing-emails">マーケティングメール</Label>
              <div className="text-xs text-muted-foreground">
                新作シナリオやキャンペーンのお知らせを受け取る
              </div>
            </div>
            <Switch id="marketing-emails" disabled />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none border">
        <CardHeader>
          <CardTitle>表示設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="dark-mode">ダークモード</Label>
              <div className="text-xs text-muted-foreground">
                ダークテーマで表示する
              </div>
            </div>
            <Switch id="dark-mode" disabled />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none border">
        <CardHeader>
          <CardTitle>言語</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-xs text-muted-foreground">
              現在のバージョンでは日本語のみサポートしています。
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            危険な操作
          </CardTitle>
          <CardDescription>
            アカウントを削除すると、すべてのデータが完全に削除され、復元できません。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            className="w-full sm:w-auto"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            アカウントを削除
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              アカウント削除の確認
            </DialogTitle>
            <DialogDescription>
              この操作は取り消せません。アカウントを削除すると、すべてのデータが完全に削除されます。
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                <AlertTriangle className="h-4 w-4" />
                削除されるデータ
              </div>
              <ul className="text-red-600 text-sm space-y-1 list-disc list-inside">
                <li>アカウント情報（メールアドレス、パスワード）</li>
                <li>プロフィール情報</li>
                <li>予約履歴</li>
                <li>その他のすべてのデータ</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-email">
                確認のため、メールアドレスを入力してください: <span className="font-mono text-sm">{user?.email}</span>
              </Label>
              <Input
                id="confirm-email"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="メールアドレスを入力"
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setConfirmEmail('')
              }}
              disabled={deleting}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting || confirmEmail !== user?.email}
            >
              {deleting ? '削除中...' : 'アカウントを削除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

