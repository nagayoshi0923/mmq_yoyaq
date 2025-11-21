import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, Building2 } from 'lucide-react'
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

  const fetchStaffInfo = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('email', user.email)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setStaffInfo(data)
        setFormData({
          name: data.name || '',
          phone: data.phone || '',
          lineId: data.line_name || '',
          xAccount: data.x_account || '',
        })
      }
    } catch (error) {
      logger.error('スタッフ情報取得エラー:', error)
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

  // デバッグ用ログ
  useEffect(() => {
    logger.log('🔍 ProfilePage レンダリング状態:', {
      loading,
      hasUser: !!user,
      hasStaffInfo: !!staffInfo,
      userEmail: user?.email,
      staffInfoEmail: staffInfo?.email
    })
  }, [loading, user, staffInfo])

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

      {/* スタッフ情報詳細 */}
      {staffInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
              スタッフ情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-sm">担当店舗</Label>
              <div className="mt-1">
                {staffInfo.stores && staffInfo.stores.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {staffInfo.stores.map((store: string, idx: number) => (
                      <span key={idx} className="px-2 py-1 bg-muted rounded text-xs sm:text-sm">
                        {store}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs sm:text-sm">未設定</span>
                )}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground text-sm">担当可能シナリオ数</Label>
              <div className="mt-1 font-medium text-sm">
                {staffInfo.available_scenarios?.length || 0} シナリオ
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground text-sm">経験値</Label>
              <div className="mt-1 font-medium text-sm">
                {staffInfo.experience || 0} 回
              </div>
            </div>

            {staffInfo.notes && (
              <div>
                <Label className="text-muted-foreground text-sm">メモ</Label>
                <div className="mt-1 text-xs sm:text-sm whitespace-pre-wrap text-muted-foreground">
                  {staffInfo.notes}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

