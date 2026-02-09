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
import { Trash2, AlertTriangle, User, Mail, Bell, Lock, ChevronRight, Phone, MapPin, MessageSquare, Link2 } from 'lucide-react'
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
  
  // 連携されているログイン方法
  const [linkedProviders, setLinkedProviders] = useState<string[]>([])

  // 通知設定
  const [notificationSettings, setNotificationSettings] = useState({
    email_notifications: true,
    reminder_notifications: true,
    campaign_notifications: true
  })
  const [savingNotifications, setSavingNotifications] = useState(false)

  useEffect(() => {
    if (user?.id || user?.email) {
      fetchCustomerInfo()
      fetchLinkedProviders()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user変更時のみ実行
  }, [user])

  // 連携されているログインプロバイダーを取得
  const fetchLinkedProviders = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser?.identities) {
        const providers = authUser.identities.map(identity => identity.provider)
        setLinkedProviders(providers)
        logger.log('連携プロバイダー:', providers)
      }
    } catch (error) {
      logger.error('連携プロバイダー取得エラー:', error)
    }
  }

  const fetchCustomerInfo = async () => {
    if (!user?.id && !user?.email) return

    setLoading(true)
    try {
      let query = supabase
        .from('customers')
        .select('id, organization_id, user_id, name, nickname, email, phone, address, line_id, notes, avatar_url, notification_settings, created_at, updated_at')

      // マルチテナント: 組織コンテキストがある場合は必ず絞る（複数組織所属時の混線防止）
      if (organizationId) {
        query = query.eq('organization_id', organizationId)
      }
      
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
        // 通知設定を読み込み
        if (data.notification_settings) {
          setNotificationSettings({
            email_notifications: data.notification_settings.email_notifications ?? true,
            reminder_notifications: data.notification_settings.reminder_notifications ?? true,
            campaign_notifications: data.notification_settings.campaign_notifications ?? true
          })
        }
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
        
        // email/user_id 重複対策: 既存行があれば UPDATE、なければ INSERT
        const { data: existingCust } = await supabase
          .from('customers')
          .select('id')
          .or(`user_id.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle()
        
        const { error } = existingCust
          ? await supabase
              .from('customers')
              .update({
                user_id: user.id,
                name: formData.name,
                nickname: formData.nickname || null,
                phone: formData.phone || null,
                address: formData.address || null,
                line_id: formData.lineId || null,
                notes: formData.notes || null,
                email: user.email || null,
                organization_id: orgId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingCust.id)
          : await supabase
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
      // 英語エラーメッセージを日本語化
      let errorMessage = 'メールアドレスの変更に失敗しました'
      if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
        errorMessage = 'このメールアドレスは既に登録されています'
      } else if (error.message?.includes('invalid email')) {
        errorMessage = '有効なメールアドレスを入力してください'
      } else if (error.message?.includes('rate limit')) {
        errorMessage = 'しばらく時間をおいてから再度お試しください'
      }
      showToast.error(errorMessage)
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
      // 英語エラーメッセージを日本語化
      let errorMessage = 'パスワードの変更に失敗しました'
      if (error.message?.includes('same as your old password') || error.message?.includes('different from the old password')) {
        errorMessage = '新しいパスワードは現在のパスワードと異なるものを設定してください'
      } else if (error.message?.includes('should be at least')) {
        errorMessage = 'パスワードは6文字以上で入力してください'
      } else if (error.message?.includes('rate limit')) {
        errorMessage = 'しばらく時間をおいてから再度お試しください'
      }
      showToast.error(errorMessage)
    } finally {
      setChangingPassword(false)
    }
  }

  // 通知設定を保存
  const handleNotificationChange = async (key: keyof typeof notificationSettings, value: boolean) => {
    const newSettings = { ...notificationSettings, [key]: value }
    setNotificationSettings(newSettings)
    
    if (!customerInfo?.id) return
    
    setSavingNotifications(true)
    try {
      const { error } = await supabase
        .from('customers')
        .update({ notification_settings: newSettings })
        .eq('id', customerInfo.id)
      
      if (error) throw error
      showToast.success('通知設定を更新しました')
    } catch (error: any) {
      logger.error('通知設定更新エラー:', error)
      showToast.error('通知設定の更新に失敗しました')
      // 失敗時は元に戻す
      setNotificationSettings(prev => ({ ...prev, [key]: !value }))
    } finally {
      setSavingNotifications(false)
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

  // プロバイダー名を日本語に変換
  const getProviderLabel = (provider: string) => {
    const labels: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
      google: { 
        name: 'Google', 
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        ),
        color: '#4285F4'
      },
      discord: { 
        name: 'Discord', 
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#5865F2">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
        ),
        color: '#5865F2'
      },
      twitter: { 
        name: 'X（Twitter）', 
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        ),
        color: '#000000'
      },
      email: { 
        name: 'メール/パスワード', 
        icon: <Mail className="w-4 h-4" />,
        color: '#6B7280'
      },
    }
    return labels[provider] || { name: provider, icon: <Link2 className="w-4 h-4" />, color: '#6B7280' }
  }

  return (
    <div className="space-y-4">
      {/* 連携されているログイン方法 */}
      {linkedProviders.length > 0 && (
        <div className="bg-white shadow-sm p-4 border border-gray-200" style={{ borderRadius: 0 }}>
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-5 h-5" style={{ color: THEME.primary }} />
            <h3 className="font-medium text-gray-900">連携されているログイン方法</h3>
          </div>
          <div className="space-y-2">
            {linkedProviders.map((provider, index) => {
              const { name, icon } = getProviderLabel(provider)
              return (
                <div 
                  key={`${provider}-${index}`}
                  className="flex items-center gap-3 p-2 bg-gray-50 border border-gray-100"
                  style={{ borderRadius: 0 }}
                >
                  <div 
                    className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200"
                    style={{ borderRadius: 0 }}
                  >
                    {icon}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{name}</span>
                  <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-1">連携済み</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
              <Switch 
                checked={notificationSettings.email_notifications}
                onCheckedChange={(checked) => handleNotificationChange('email_notifications', checked)}
                disabled={savingNotifications || !customerInfo?.id}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>予約リマインダー</Label>
                <p className="text-xs text-gray-500">予約日の前日にリマインダー</p>
              </div>
              <Switch 
                checked={notificationSettings.reminder_notifications}
                onCheckedChange={(checked) => handleNotificationChange('reminder_notifications', checked)}
                disabled={savingNotifications || !customerInfo?.id}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>キャンペーン通知</Label>
                <p className="text-xs text-gray-500">新作やイベントのお知らせ</p>
              </div>
              <Switch 
                checked={notificationSettings.campaign_notifications}
                onCheckedChange={(checked) => handleNotificationChange('campaign_notifications', checked)}
                disabled={savingNotifications || !customerInfo?.id}
              />
            </div>
            {!customerInfo?.id && (
              <p className="text-xs text-gray-400 text-center">※ 顧客情報を登録すると通知設定が可能になります</p>
            )}
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
