import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Trash2, AlertTriangle, User, Mail, Bell, Lock, ChevronRight, Phone, MapPin, MessageSquare } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { deleteMyAccount } from '@/lib/userApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/hooks/useOrganization'
import { QUEENS_WALTZ_ORG_ID } from '@/lib/organization'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

type DialogType = 'profile' | 'notification' | 'email' | 'password' | 'delete' | null

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { organizationId } = useOrganization()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [customerInfo, setCustomerInfo] = useState<any>(null)
  const [activeDialog, setActiveDialog] = useState<DialogType>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    phone: '',
    address: '',
    lineId: '',
    notes: '',
  })
  const [emailFormData, setEmailFormData] = useState({
    newEmail: '',
  })
  const [passwordFormData, setPasswordFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  })
  const [confirmEmail, setConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [changingEmail, setChangingEmail] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    if (user?.id || user?.email) {
      fetchCustomerInfo()
    }
  }, [user])

  const fetchCustomerInfo = async () => {
    if (!user?.id && !user?.email) return

    setLoading(true)
    try {
      let query = supabase.from('customers').select('*')
      
      if (user?.id) {
        query = query.eq('user_id', user.id)
      } else if (user?.email) {
        query = query.eq('email', user.email)
      }
      
      const { data, error } = await query.maybeSingle()

      if (error) throw error

      if (data) {
        setCustomerInfo(data)
        setFormData({
          name: data.name || '',
          nickname: data.nickname || '',
          phone: data.phone || '',
          address: data.address || '',
          lineId: data.line_id || '',
          notes: data.notes || '',
        })
      } else {
        setCustomerInfo(null)
        if (user?.name) {
          setFormData(prev => ({ ...prev, name: user.name || '' }))
        }
      }
    } catch (error) {
      logger.error('顧客情報取得エラー:', error)
      setCustomerInfo(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!formData.name.trim()) {
      showToast.warning('名前を入力してください')
      return
    }

    setSaving(true)
    try {
      if (customerInfo) {
        const { error } = await supabase
          .from('customers')
          .update({
            name: formData.name,
            nickname: formData.nickname || null,
            phone: formData.phone || null,
            address: formData.address || null,
            line_id: formData.lineId || null,
            notes: formData.notes || null,
            email: user?.email || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', customerInfo.id)

        if (error) throw error
        showToast.success('プロフィールを更新しました')
      } else if (user?.id) {
        const orgId = organizationId || QUEENS_WALTZ_ORG_ID
        
        const { error } = await supabase
          .from('customers')
          .insert({
            user_id: user.id,
            name: formData.name,
            nickname: formData.nickname || null,
            phone: formData.phone || null,
            address: formData.address || null,
            line_id: formData.lineId || null,
            notes: formData.notes || null,
            email: user.email || null,
            visit_count: 0,
            total_spent: 0,
            organization_id: orgId,
          })

        if (error) throw error
        showToast.success('プロフィールを作成しました')
      }

      fetchCustomerInfo()
      setActiveDialog(null)
    } catch (error: any) {
      logger.error('プロフィール更新エラー:', error)
      showToast.error(error.message || '更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleChangeEmail = async () => {
    if (!emailFormData.newEmail || !user?.email) {
      showToast.warning('新しいメールアドレスを入力してください')
      return
    }

    if (emailFormData.newEmail === user.email) {
      showToast.warning('現在のメールアドレスと同じです')
      return
    }

    setChangingEmail(true)
    try {
      const { error } = await supabase.auth.updateUser({
        email: emailFormData.newEmail
      })

      if (error) throw error

      showToast.success('確認メールを送信しました', '新しいメールアドレスで確認してください')
      setEmailFormData({ newEmail: '' })
      setActiveDialog(null)
    } catch (error: any) {
      logger.error('メールアドレス変更エラー:', error)
      showToast.error(error.message || 'メールアドレスの変更に失敗しました')
    } finally {
      setChangingEmail(false)
    }
  }

  const handleChangePassword = async () => {
    if (!passwordFormData.newPassword || !passwordFormData.confirmPassword) {
      showToast.warning('新しいパスワードを入力してください')
      return
    }

    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      showToast.warning('新しいパスワードが一致しません')
      return
    }

    if (passwordFormData.newPassword.length < 6) {
      showToast.warning('パスワードは6文字以上にしてください')
      return
    }

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordFormData.newPassword
      })

      if (error) throw error

      showToast.success('パスワードを変更しました')
      setPasswordFormData({ newPassword: '', confirmPassword: '' })
      setActiveDialog(null)
    } catch (error: any) {
      logger.error('パスワード変更エラー:', error)
      showToast.error(error.message || 'パスワードの変更に失敗しました')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (confirmEmail !== user?.email) {
      showToast.warning('メールアドレスが一致しません')
      return
    }

    if (!confirm('本当にアカウントを削除しますか？この操作は取り消せません。')) {
      return
    }

    setDeleting(true)
    try {
      if (customerInfo?.id) {
        await supabase.from('customers').delete().eq('id', customerInfo.id)
      }

      await deleteMyAccount()
      
      showToast.success('アカウントを削除しました')
      await signOut()
      window.location.href = '/login'
    } catch (error: any) {
      logger.error('アカウント削除エラー:', error)
      showToast.error('アカウントの削除に失敗しました', error.message)
    } finally {
      setDeleting(false)
      setActiveDialog(null)
      setConfirmEmail('')
    }
  }

  const handleLogout = async () => {
    try {
      await signOut()
      window.location.href = '/login'
    } catch (error) {
      logger.error('ログアウトエラー:', error)
    }
  }

  const menuItems = [
    { 
      id: 'profile' as DialogType, 
      label: 'プロフィール編集', 
      desc: formData.nickname || formData.name || '名前・連絡先を設定',
      icon: User 
    },
    { 
      id: 'notification' as DialogType, 
      label: '通知設定', 
      desc: 'メール・プッシュ通知',
      icon: Bell 
    },
    { 
      id: 'email' as DialogType, 
      label: 'メールアドレス変更', 
      desc: user?.email || '',
      icon: Mail 
    },
    { 
      id: 'password' as DialogType, 
      label: 'パスワード変更', 
      desc: 'セキュリティ設定',
      icon: Lock 
    },
  ]

  if (loading) {
    return <div className="text-center py-8 text-gray-500">読み込み中...</div>
  }

  return (
    <div className="space-y-4">
      {/* メニューリスト - シャープデザイン */}
      {menuItems.map((item) => {
        const Icon = item.icon
        return (
          <div
            key={item.id}
            onClick={() => setActiveDialog(item.id)}
            className="bg-white shadow-sm p-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-all border border-gray-200 hover:border-gray-300"
            style={{ borderRadius: 0 }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 flex items-center justify-center"
                style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
              >
                <Icon className="w-5 h-5" style={{ color: THEME.primary }} />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{item.label}</h3>
                <p className="text-sm text-gray-500 truncate max-w-[200px]">{item.desc}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        )
      })}

      {/* アカウント削除 - シャープデザイン */}
      <div
        onClick={() => setActiveDialog('delete')}
        className="bg-white shadow-sm p-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-all border border-red-200 hover:border-red-300"
        style={{ borderRadius: 0 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-red-50" style={{ borderRadius: 0 }}>
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-medium text-red-600">アカウント削除</h3>
            <p className="text-sm text-gray-500">すべてのデータが削除されます</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </div>

      {/* ログアウト - シャープデザイン */}
      <div className="pt-4">
        <Button 
          variant="outline" 
          className="w-full text-gray-500 border-gray-300"
          style={{ borderRadius: 0 }}
          onClick={handleLogout}
        >
          ログアウト
        </Button>
      </div>

      {/* プロフィール編集ダイアログ */}
      <Dialog open={activeDialog === 'profile'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>プロフィール編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">本名 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="山田 太郎"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">予約確認や店舗での呼び出しに使用します</p>
            </div>
            <div>
              <Label htmlFor="nickname">ニックネーム</Label>
              <Input
                id="nickname"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                placeholder="タロウ"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">マイページでの表示名として使用します</p>
            </div>
            <div>
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" /> 電話番号
              </Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="090-1234-5678"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="address" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> 住所
              </Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="東京都..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="lineId" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> LINE ID
              </Label>
              <Input
                id="lineId"
                value={formData.lineId}
                onChange={(e) => setFormData({ ...formData, lineId: e.target.value })}
                placeholder="@your_line_id"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="特記事項"
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>キャンセル</Button>
            <Button 
              onClick={handleSaveProfile} 
              disabled={saving || !formData.name.trim()}
              style={{ backgroundColor: THEME.primary }}
              className="text-white"
            >
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 通知設定ダイアログ */}
      <Dialog open={activeDialog === 'notification'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>通知設定</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>メール通知</Label>
                <p className="text-xs text-gray-500">予約確認やお知らせを受け取る</p>
              </div>
              <Switch disabled />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>予約リマインダー</Label>
                <p className="text-xs text-gray-500">予約日の前日にリマインダー</p>
              </div>
              <Switch disabled />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>キャンペーン通知</Label>
                <p className="text-xs text-gray-500">新作やイベントのお知らせ</p>
              </div>
              <Switch disabled />
            </div>
            <p className="text-xs text-gray-400 text-center">※ 通知設定は準備中です</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* メールアドレス変更ダイアログ */}
      <Dialog open={activeDialog === 'email'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>メールアドレス変更</DialogTitle>
            <DialogDescription>
              現在: {user?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="new-email">新しいメールアドレス</Label>
              <Input
                id="new-email"
                type="email"
                value={emailFormData.newEmail}
                onChange={(e) => setEmailFormData({ newEmail: e.target.value })}
                placeholder="new@example.com"
                className="mt-1"
              />
            </div>
            <p className="text-xs text-gray-500">
              確認メールが新しいアドレスに送信されます
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>キャンセル</Button>
            <Button 
              onClick={handleChangeEmail} 
              disabled={changingEmail || !emailFormData.newEmail}
              style={{ backgroundColor: THEME.primary }}
              className="text-white"
            >
              {changingEmail ? '送信中...' : '変更'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* パスワード変更ダイアログ */}
      <Dialog open={activeDialog === 'password'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>パスワード変更</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="new-password">新しいパスワード</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordFormData.newPassword}
                onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                placeholder="6文字以上"
                className="mt-1"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">新しいパスワード（確認）</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordFormData.confirmPassword}
                onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                placeholder="もう一度入力"
                className="mt-1"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>キャンセル</Button>
            <Button 
              onClick={handleChangePassword} 
              disabled={changingPassword || !passwordFormData.newPassword || !passwordFormData.confirmPassword}
              style={{ backgroundColor: THEME.primary }}
              className="text-white"
            >
              {changingPassword ? '変更中...' : '変更'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* アカウント削除ダイアログ */}
      <Dialog open={activeDialog === 'delete'} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              アカウント削除
            </DialogTitle>
            <DialogDescription>
              この操作は取り消せません。すべてのデータが完全に削除されます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                <AlertTriangle className="h-4 w-4" />
                削除されるデータ
              </div>
              <ul className="text-red-600 text-sm space-y-1 list-disc list-inside">
                <li>アカウント情報</li>
                <li>プロフィール情報</li>
                <li>予約履歴</li>
              </ul>
            </div>
            <div>
              <Label htmlFor="confirm-email">
                確認のため、メールアドレスを入力:
              </Label>
              <p className="text-xs text-gray-500 mb-2">{user?.email}</p>
              <Input
                id="confirm-email"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="メールアドレスを入力"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActiveDialog(null); setConfirmEmail('') }}>
              キャンセル
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteAccount} 
              disabled={deleting || confirmEmail !== user?.email}
            >
              {deleting ? '削除中...' : '削除する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
