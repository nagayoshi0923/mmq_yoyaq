import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

export function ProfilePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [staffInfo, setStaffInfo] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    lineId: '',
    xAccount: '',
  })

  useEffect(() => {
    if (user?.email) {
      fetchStaffInfo()
    }
  }, [user])

  // デバッグ用ログ（フックのルールに従い、早期リターンの前に配置）
  useEffect(() => {
    logger.log('🔍 ProfilePage レンダリング状態:', {
      loading,
      hasUser: !!user,
      hasStaffInfo: !!staffInfo,
      userEmail: user?.email,
      staffInfoEmail: staffInfo?.email
    })
  }, [loading, user, staffInfo])

  const fetchStaffInfo = async () => {
    if (!user?.email) {
      logger.log('⚠️ ユーザー情報なし、スタッフ情報取得をスキップ')
      return
    }

    setLoading(true)
    try {
      logger.log('🔍 スタッフ情報取得開始:', user.email)
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('email', user.email)
        .maybeSingle()

      if (error) {
        logger.error('❌ スタッフ情報取得エラー:', error)
        throw error
      }

      if (data) {
        logger.log('✅ スタッフ情報取得成功:', { id: data.id, name: data.name, email: data.email })
        setStaffInfo(data)
        setFormData({
          name: data.name || '',
          phone: data.phone || '',
          lineId: data.line_name || '',
          xAccount: data.x_account || '',
        })
      } else {
        logger.log('⚠️ スタッフ情報が見つかりませんでした:', user.email)
        setStaffInfo(null)
      }
    } catch (error) {
      logger.error('スタッフ情報取得エラー:', error)
      setStaffInfo(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!staffInfo) {
      alert('スタッフ情報が見つかりません')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('staff')
        .update({
          name: formData.name,
          phone: formData.phone || null,
          line_name: formData.lineId || null,
          x_account: formData.xAccount || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', staffInfo.id)

      if (error) throw error

      alert('プロフィールを更新しました')
      fetchStaffInfo()
    } catch (error) {
      logger.error('プロフィール更新エラー:', error)
      alert('更新に失敗しました')
    } finally {
      setSaving(false)
    }
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
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
            <User className="h-4 w-4 sm:h-5 sm:w-5" />
            ユーザー情報
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-muted-foreground text-sm">メールアドレス</Label>
            <div className="mt-1 font-medium text-sm">{user?.email || '未設定'}</div>
          </div>
          {user?.name && (
            <div>
              <Label className="text-muted-foreground text-sm">名前</Label>
              <div className="mt-1 font-medium text-sm">{user.name}</div>
            </div>
          )}
          {user?.role && (
            <div>
              <Label className="text-muted-foreground text-sm">ロール</Label>
              <div className="mt-1 font-medium text-sm">
                {user.role === 'admin' ? '管理者' : 
                 user.role === 'staff' ? 'スタッフ' : '顧客'}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* スタッフ情報がない場合のメッセージ */}
      {!loading && !staffInfo && user?.role !== 'customer' && (
        <Card>
          <CardContent className="py-6">
            <div className="text-center text-muted-foreground text-sm">
              スタッフ情報が見つかりませんでした。<br />
              管理者に連絡してスタッフとして登録してください。
            </div>
          </CardContent>
        </Card>
      )}

      {/* プロフィール編集（スタッフのみ） */}
      {staffInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
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
              <Label htmlFor="phone" className="text-sm">電話番号</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="090-1234-5678"
                className="text-sm"
              />
            </div>

            <div>
              <Label htmlFor="lineId" className="text-sm">LINE ID</Label>
              <Input
                id="lineId"
                value={formData.lineId}
                onChange={(e) => setFormData({ ...formData, lineId: e.target.value })}
                placeholder="@your_line_id"
                className="text-sm"
              />
            </div>

            <div>
              <Label htmlFor="xAccount" className="text-sm">X (Twitter) アカウント</Label>
              <Input
                id="xAccount"
                value={formData.xAccount}
                onChange={(e) => setFormData({ ...formData, xAccount: e.target.value })}
                placeholder="@your_twitter"
                className="text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={fetchStaffInfo}
                disabled={saving}
              >
                リセット
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formData.name.trim()}
              >
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}

