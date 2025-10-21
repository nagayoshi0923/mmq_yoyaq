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
          <div className="text-center text-muted-foreground">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* プロフィール編集 */}
      {staffInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              プロフィール編集
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">名前 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="山田 太郎"
              />
            </div>

            <div>
              <Label htmlFor="phone">電話番号</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="090-1234-5678"
              />
            </div>

            <div>
              <Label htmlFor="lineId">LINE ID</Label>
              <Input
                id="lineId"
                value={formData.lineId}
                onChange={(e) => setFormData({ ...formData, lineId: e.target.value })}
                placeholder="@your_line_id"
              />
            </div>

            <div>
              <Label htmlFor="xAccount">X (Twitter) アカウント</Label>
              <Input
                id="xAccount"
                value={formData.xAccount}
                onChange={(e) => setFormData({ ...formData, xAccount: e.target.value })}
                placeholder="@your_twitter"
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
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              スタッフ情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">担当店舗</Label>
              <div className="mt-1">
                {staffInfo.stores && staffInfo.stores.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {staffInfo.stores.map((store: string, idx: number) => (
                      <span key={idx} className="px-2 py-1 bg-muted rounded text-sm">
                        {store}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">未設定</span>
                )}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">担当可能シナリオ数</Label>
              <div className="mt-1 font-medium">
                {staffInfo.available_scenarios?.length || 0} シナリオ
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">経験値</Label>
              <div className="mt-1 font-medium">
                {staffInfo.experience || 0} 回
              </div>
            </div>

            {staffInfo.notes && (
              <div>
                <Label className="text-muted-foreground">メモ</Label>
                <div className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
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

