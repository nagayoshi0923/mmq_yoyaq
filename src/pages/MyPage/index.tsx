import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { User, Mail, Phone, Building2, Calendar, Shield, Clock, CheckCircle, BookOpen } from 'lucide-react'
import { logger } from '@/utils/logger'
import type { Reservation } from '@/types'

export default function MyPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [staffInfo, setStaffInfo] = useState<any>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [playedScenarios, setPlayedScenarios] = useState<any[]>([])
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    lineId: '',
    xAccount: '',
  })

  useEffect(() => {
    if (user?.email) {
      fetchStaffInfo()
      fetchReservations()
    }
  }, [user])

  useEffect(() => {
    if (staffInfo?.id) {
      fetchPlayedScenarios()
    }
  }, [staffInfo])

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

  const fetchReservations = async () => {
    if (!user?.email) return

    try {
      // 顧客情報を取得
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()

      if (customerError) throw customerError
      if (!customer) return

      // 予約を取得
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('customer_id', customer.id)
        .order('requested_datetime', { ascending: false })

      if (error) throw error
      setReservations(data || [])
    } catch (error) {
      logger.error('予約履歴取得エラー:', error)
    }
  }

  const fetchPlayedScenarios = async () => {
    if (!staffInfo?.id) return

    try {
      // スタッフが担当した公演を取得
      const { data, error } = await supabase
        .from('schedule_events')
        .select('scenario, date, venue')
        .contains('gms', [staffInfo.name])
        .eq('is_cancelled', false)
        .lte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: false })

      if (error) throw error

      // シナリオごとにグループ化してカウント
      const scenarioMap = new Map()
      data?.forEach((event) => {
        const count = scenarioMap.get(event.scenario) || 0
        scenarioMap.set(event.scenario, count + 1)
      })

      const scenarios = Array.from(scenarioMap.entries()).map(([scenario, count]) => ({
        scenario,
        count,
      }))

      setPlayedScenarios(scenarios)
    } catch (error) {
      logger.error('プレイ済みシナリオ取得エラー:', error)
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

  const handlePageChange = (pageId: string) => {
    window.location.hash = pageId === 'dashboard' ? '' : pageId
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  const formatDateTime = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`
  }

  return (
    <div className="min-h-screen bg-background">
      <Header onPageChange={handlePageChange} />
      <NavigationBar currentPage="my-page" onPageChange={handlePageChange} />
      
      <main className="container mx-auto px-8 py-6 max-w-4xl">
        <div className="space-y-6">
          {/* ページヘッダー */}
          <div>
            <h1 className="text-3xl font-bold">マイページ</h1>
            <p className="text-muted-foreground mt-2">アカウント情報とプロフィールの管理</p>
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">読み込み中...</div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* アカウント情報 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    アカウント情報
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">メールアドレス</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{user?.email}</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">ロール</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {user?.role === 'admin' ? '管理者' : 
                           user?.role === 'staff' ? 'スタッフ' : '顧客'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {staffInfo && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">登録日</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{formatDate(staffInfo.created_at)}</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">ステータス</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            staffInfo.status === 'active' ? 'bg-green-100 text-green-800' :
                            staffInfo.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {staffInfo.status === 'active' ? '稼働中' :
                             staffInfo.status === 'inactive' ? '非稼働' : '休暇中'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* プロフィール編集 */}
              {staffInfo && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      プロフィール
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

              {/* 予約履歴 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    予約履歴
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {reservations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      予約履歴がありません
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reservations.slice(0, 10).map((reservation) => {
                        const isPast = new Date(reservation.requested_datetime) < new Date()
                        const isUpcoming = !isPast && reservation.status === 'confirmed'
                        
                        return (
                          <div
                            key={reservation.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{reservation.title}</span>
                                {isUpcoming && (
                                  <Badge variant="default" className="bg-blue-100 text-blue-800">
                                    <Clock className="h-3 w-3 mr-1" />
                                    参加予定
                                  </Badge>
                                )}
                                {isPast && reservation.status === 'confirmed' && (
                                  <Badge variant="secondary">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    参加済み
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {formatDateTime(reservation.requested_datetime)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-muted-foreground">参加人数</div>
                              <div className="font-medium">{reservation.participant_count}名</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-sm text-muted-foreground">金額</div>
                              <div className="font-medium">{formatCurrency(reservation.final_price)}</div>
                            </div>
                            <div className="ml-4">
                              <Badge
                                variant={
                                  reservation.status === 'confirmed' ? 'default' :
                                  reservation.status === 'cancelled' ? 'destructive' :
                                  'secondary'
                                }
                              >
                                {reservation.status === 'confirmed' ? '確定' :
                                 reservation.status === 'cancelled' ? 'キャンセル' :
                                 reservation.status === 'pending' ? '保留' : reservation.status}
                              </Badge>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* プレイ済みシナリオ (スタッフのみ) */}
              {staffInfo && playedScenarios.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      GMとして担当したシナリオ
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {playedScenarios.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <span className="font-medium">{item.scenario}</span>
                          <Badge variant="secondary">{item.count}回</Badge>
                        </div>
                      ))}
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
            </>
          )}
        </div>
      </main>
    </div>
  )
}

