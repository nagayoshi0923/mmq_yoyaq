/**
 * 組織ユーザー招待ダイアログ
 */
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Mail, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Organization } from '@/types'

interface OrganizationInviteDialogProps {
  organization: Organization
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function OrganizationInviteDialog({
  organization,
  isOpen,
  onClose,
  onSuccess,
}: OrganizationInviteDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: ['スタッフ'] as string[],
  })

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('名前を入力してください')
      return
    }
    if (!formData.email.trim()) {
      toast.error('メールアドレスを入力してください')
      return
    }

    setIsLoading(true)
    try {
      // 1. staff テーブルにユーザーを作成（organization_id 付き）
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .insert({
          name: formData.name.trim(),
          email: formData.email.trim(),
          organization_id: organization.id,
          role: formData.role,
          status: 'active',
          stores: [],
          ng_days: [],
          want_to_learn: [],
          available_scenarios: [],
          availability: [],
          experience: 0,
          special_scenarios: [],
        })
        .select()
        .single()

      if (staffError) {
        // 重複エラーの場合
        if (staffError.code === '23505') {
          toast.error('このメールアドレスは既に登録されています')
          return
        }
        throw staffError
      }

      // 2. 招待メールを送信（Supabase Auth の招待機能を使用）
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        formData.email.trim(),
        {
          data: {
            staff_id: staffData.id,
            organization_id: organization.id,
            name: formData.name.trim(),
          },
          redirectTo: `${window.location.origin}/set-password`,
        }
      )

      // 招待機能がない場合（クライアント側からは使えない場合が多い）
      // Edge Function を使うか、手動でパスワードを設定する流れにする
      if (inviteError) {
        console.warn('Invite error (expected if not admin):', inviteError)
        // 招待メールは送れないが、スタッフは作成されている
        toast.success(
          `${formData.name} さんを追加しました。ログイン情報を別途お伝えください。`,
          { duration: 5000 }
        )
      } else {
        toast.success(`${formData.name} さんに招待メールを送信しました`)
      }

      onSuccess()
      // フォームをリセット
      setFormData({
        name: '',
        email: '',
        role: ['スタッフ'],
      })
    } catch (error) {
      console.error('Failed to invite user:', error)
      toast.error('招待に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ユーザーを招待</DialogTitle>
          <DialogDescription>
            {organization.name} にユーザーを招待します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="invite-name">名前 *</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="invite-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例: 山田太郎"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-email">メールアドレス *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="invite-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="例: yamada@example.com"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">役割</Label>
            <Select
              value={formData.role[0]}
              onValueChange={(value) => setFormData(prev => ({ ...prev, role: [value] }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="管理者">管理者</SelectItem>
                <SelectItem value="スタッフ">スタッフ</SelectItem>
                <SelectItem value="GM">GM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            招待を送信
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

