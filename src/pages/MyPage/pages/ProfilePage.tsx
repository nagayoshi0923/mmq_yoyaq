import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { User, Mail, Calendar as CalendarIcon, Phone, MapPin, MessageSquare, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

export function ProfilePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [changingEmail, setChangingEmail] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [customerInfo, setCustomerInfo] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    lineId: '',
    notes: '',
  })
  const [emailFormData, setEmailFormData] = useState({
    newEmail: '',
  })
  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  useEffect(() => {
    if (user?.id || user?.email) {
      fetchCustomerInfo()
    }
  }, [user])

  const fetchCustomerInfo = async () => {
    if (!user?.id && !user?.email) {
      logger.log('⚠️ ユーザー情報なし、顧客情報取得をスキップ')
      return
    }

    setLoading(true)
    try {
      logger.log('🔍 顧客情報取得開始:', { userId: user?.id, email: user?.email })
      
      let query = supabase
        .from('customers')
        .select('*')
      
      if (user?.id) {
        query = query.eq('user_id', user.id)
      } else if (user?.email) {
        query = query.eq('email', user.email)
      }
      
      const { data, error } = await query.maybeSingle()

      if (error) {
        logger.error('❌ 顧客情報取得エラー:', error)
        throw error
      }

      if (data) {
        logger.log('✅ 顧客情報取得成功:', { id: data.id, name: data.name })
        setCustomerInfo(data)
        setFormData({
          name: data.name || '',
          phone: data.phone || '',
          address: data.address || '',
          lineId: data.line_id || '',
          notes: data.notes || '',
        })
      } else {
        logger.log('⚠️ 顧客情報が見つかりませんでした')
        setCustomerInfo(null)
        // ユーザー情報から初期値を設定
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

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('名前を入力してください')
      return
    }

    setSaving(true)
    try {
      if (customerInfo) {
        // 更新
        const { error } = await supabase
          .from('customers')
          .update({
            name: formData.name,
            phone: formData.phone || null,
            address: formData.address || null,
            line_id: formData.lineId || null,
            notes: formData.notes || null,
            email: user?.email || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', customerInfo.id)

        if (error) throw error
        alert('プロフィールを更新しました')
      } else if (user?.id) {
        // 新規作成
        const { error } = await supabase
          .from('customers')
          .insert({
            user_id: user.id,
            name: formData.name,
            phone: formData.phone || null,
            address: formData.address || null,
            line_id: formData.lineId || null,
            notes: formData.notes || null,
            email: user.email || null,
            visit_count: 0,
            total_spent: 0,
          })

        if (error) throw error
        alert('プロフィールを作成しました')
      } else {
        alert('ユーザー情報が見つかりません')
        return
      }

      fetchCustomerInfo()
    } catch (error: any) {
      logger.error('プロフィール更新エラー:', error)
      alert(error.message || '更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleChangeEmail = async () => {
    if (!emailFormData.newEmail || !user?.email) {
      alert('新しいメールアドレスを入力してください')
      return
    }

    if (emailFormData.newEmail === user.email) {
      alert('現在のメールアドレスと同じです')
      return
    }

    if (!confirm(`メールアドレスを ${emailFormData.newEmail} に変更しますか？\n確認メールが送信されます。`)) {
      return
    }

    setChangingEmail(true)
    try {
      const { error } = await supabase.auth.updateUser({
        email: emailFormData.newEmail
      })

      if (error) throw error

      alert('確認メールを送信しました。新しいメールアドレスで確認してください。')
      setEmailFormData({ newEmail: '' })
    } catch (error: any) {
      logger.error('メールアドレス変更エラー:', error)
      alert(error.message || 'メールアドレスの変更に失敗しました')
    } finally {
      setChangingEmail(false)
    }
  }

  const handleChangePassword = async () => {
    if (!passwordFormData.newPassword || !passwordFormData.confirmPassword) {
      alert('新しいパスワードを入力してください')
      return
    }

    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      alert('新しいパスワードが一致しません')
      return
    }

    if (passwordFormData.newPassword.length < 6) {
      alert('パスワードは6文字以上にしてください')
      return
    }

    if (!confirm('パスワードを変更しますか？')) {
      return
    }

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordFormData.newPassword
      })

      if (error) throw error

      alert('パスワードを変更しました')
      setPasswordFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (error: any) {
      logger.error('パスワード変更エラー:', error)
      alert(error.message || 'パスワードの変更に失敗しました')
    } finally {
      setChangingPassword(false)
    }
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground text-sm">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ユーザー基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm md:text-base">
            <User className="h-4 w-4 sm:h-5 sm:w-5" />
            ユーザー情報
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="current-email" className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4" />
              メールアドレス
            </Label>
            <div className="mt-1 text-sm">{user?.email || ''}</div>
          </div>

          {/* メールアドレス変更 */}
          <div>
            <Label htmlFor="new-email" className="text-sm">メールアドレス変更</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="new-email"
                type="email"
                value={emailFormData.newEmail}
                onChange={(e) => setEmailFormData({ newEmail: e.target.value })}
                placeholder="新しいメールアドレス"
                className="text-sm flex-1"
                disabled={changingEmail}
              />
              <Button
                onClick={handleChangeEmail}
                disabled={changingEmail || !emailFormData.newEmail}
                size="sm"
                className="text-sm"
              >
                {changingEmail ? '送信中...' : '変更'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              確認メールが新しいメールアドレスに送信されます
            </p>
          </div>

          {/* パスワード変更 */}
          <div>
            <Label htmlFor="new-password" className="text-sm flex items-center gap-2">
              <Lock className="h-4 w-4" />
              パスワード変更
            </Label>
            <form 
              onSubmit={(e) => {
                e.preventDefault()
                handleChangePassword()
              }}
              className="mt-2 space-y-2"
            >
              <Input
                id="new-password"
                type="password"
                value={passwordFormData.newPassword}
                onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                placeholder="新しいパスワード（6文字以上）"
                className="text-sm"
                disabled={changingPassword}
                autoComplete="new-password"
              />
              <Input
                id="confirm-password"
                type="password"
                value={passwordFormData.confirmPassword}
                onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                placeholder="新しいパスワード（確認）"
                className="text-sm"
                disabled={changingPassword}
                autoComplete="new-password"
              />
              <Button
                type="submit"
                disabled={changingPassword || !passwordFormData.newPassword || !passwordFormData.confirmPassword}
                size="sm"
                className="text-sm w-full sm:w-auto"
              >
                {changingPassword ? '変更中...' : 'パスワードを変更'}
              </Button>
            </form>
          </div>

          {user?.role && (
            <div>
              <Label className="text-muted-foreground text-sm">ロール</Label>
              <div className="mt-1">
                <Badge
                  className={`text-xs sm:text-sm ${
                    user.role === 'admin'
                      ? 'bg-blue-100 text-blue-800'
                      : user.role === 'staff'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-purple-100 text-purple-800'
                  }`}
                >
                  {user.role === 'admin'
                    ? '管理者'
                    : user.role === 'staff'
                    ? 'スタッフ'
                    : '顧客'}
                </Badge>
              </div>
            </div>
          )}
          {user?.created_at && (
            <div>
              <Label className="text-muted-foreground text-sm flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                登録日
              </Label>
              <div className="mt-1 text-sm">{formatDate(user.created_at)}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* プロフィール編集 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm md:text-base">
            <User className="h-4 w-4 sm:h-5 sm:w-5" />
            プロフィール編集
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-sm">名前 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="山田 太郎"
              className="text-sm"
            />
          </div>

          <div>
            <Label htmlFor="phone" className="text-sm flex items-center gap-2">
              <Phone className="h-4 w-4" />
              電話番号
            </Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="090-1234-5678"
              className="text-sm"
            />
          </div>

          <div>
            <Label htmlFor="address" className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              住所
            </Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="〒123-4567 東京都..."
              className="text-sm"
            />
          </div>

          <div>
            <Label htmlFor="lineId" className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              LINE ID
            </Label>
            <Input
              id="lineId"
              value={formData.lineId}
              onChange={(e) => setFormData({ ...formData, lineId: e.target.value })}
              placeholder="@your_line_id"
              className="text-sm"
            />
          </div>

          <div>
            <Label htmlFor="notes" className="text-sm">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="特記事項があればご記入ください"
              rows={3}
              className="text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={fetchCustomerInfo}
              disabled={saving}
              className="text-sm"
            >
              リセット
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.name.trim()}
              className="text-sm"
            >
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
