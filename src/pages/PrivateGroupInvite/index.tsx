import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, CheckCircle2, AlertCircle, Circle, X, HelpCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePrivateGroup, usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroup'
import type { DateResponse, PrivateGroupCandidateDate } from '@/types'

type ResponseValue = DateResponse | null

export function PrivateGroupInvite() {
  const navigate = useNavigate()
  const location = useLocation()
  
  // URLから招待コードを抽出: /group/invite/{code}
  const code = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    if (segments[0] === 'group' && segments[1] === 'invite' && segments[2]) {
      return segments[2]
    }
    return null
  }, [location.pathname])
  
  const { user } = useAuth()
  const { group, loading: groupLoading, error: groupError, refetch } = usePrivateGroupByInviteCode(code || null)
  const { joinGroup, submitDateResponses, loading: actionLoading } = usePrivateGroup()

  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [responses, setResponses] = useState<Record<string, ResponseValue>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null)

  useEffect(() => {
    if (group && user) {
      const existingMember = group.members?.find(m => m.user_id === user.id)
      if (existingMember) {
        setExistingMemberId(existingMember.id)
        const existingResponses: Record<string, ResponseValue> = {}
        existingMember.date_responses?.forEach(r => {
          existingResponses[r.candidate_date_id] = r.response
        })
        setResponses(existingResponses)
      }
    }
  }, [group, user])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00+09:00')
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
  }

  const handleResponseChange = (candidateDateId: string, response: DateResponse) => {
    setResponses(prev => ({
      ...prev,
      [candidateDateId]: prev[candidateDateId] === response ? null : response,
    }))
  }

  const getResponseIcon = (response: ResponseValue, type: DateResponse) => {
    const isSelected = response === type
    const baseClass = 'w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer'

    switch (type) {
      case 'ok':
        return (
          <div className={`${baseClass} ${isSelected ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-100'}`}>
            <Circle className="w-4 h-4" />
          </div>
        )
      case 'maybe':
        return (
          <div className={`${baseClass} ${isSelected ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-amber-100'}`}>
            <HelpCircle className="w-4 h-4" />
          </div>
        )
      case 'ng':
        return (
          <div className={`${baseClass} ${isSelected ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-100'}`}>
            <X className="w-4 h-4" />
          </div>
        )
    }
  }

  const handleSubmit = async () => {
    setError(null)

    if (!group) {
      setError('グループ情報の取得に失敗しました')
      return
    }

    if (!user && !guestName) {
      setError('お名前を入力してください')
      return
    }

    const allResponded = group.candidate_dates?.every(cd => responses[cd.id] != null)
    if (!allResponded) {
      setError('すべての候補日時に回答してください')
      return
    }

    try {
      let memberId = existingMemberId

      if (!memberId) {
        const member = await joinGroup({
          groupId: group.id,
          userId: user?.id,
          guestName: user ? undefined : guestName,
          guestEmail: user ? undefined : guestEmail || undefined,
          guestPhone: user ? undefined : guestPhone || undefined,
        })
        memberId = member.id
      }

      const responseData = Object.entries(responses)
        .filter(([_, response]) => response != null)
        .map(([candidateDateId, response]) => ({
          candidateDateId,
          response: response as DateResponse,
        }))

      await submitDateResponses(group.id, memberId, responseData)

      setSuccess(true)

    } catch (err: any) {
      setError(err.message || '送信に失敗しました')
    }
  }

  if (groupLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-lg px-4 py-12">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            読み込み中...
          </div>
        </div>
      </div>
    )
  }

  if (groupError || !group) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-lg px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">招待が見つかりません</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {groupError || '招待コードが無効か、有効期限が切れています'}
              </p>
              <Button onClick={() => navigate('/')}>
                トップへ戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (group.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-lg px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">このグループはキャンセルされました</h2>
              <p className="text-sm text-muted-foreground mb-4">
                主催者によりグループがキャンセルされました
              </p>
              <Button onClick={() => navigate('/')}>
                トップへ戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-lg px-4 py-12">
          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
              <h2 className="text-lg text-green-800 font-medium">
                {existingMemberId ? '回答を更新しました！' : '参加登録が完了しました！'}
              </h2>
              <p className="text-sm text-green-700">
                主催者が全員の回答を確認後、貸切予約を申し込みます。
                <br />
                予約確定後にご連絡いたします。
              </p>
              <Button
                variant="outline"
                onClick={() => navigate('/')}
                className="border-green-600 text-green-700"
              >
                トップへ戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const scenario = group.scenario_masters
  const organizerMember = group.members?.find(m => m.is_organizer)
  const organizerName = organizerMember?.guest_name || 'メンバー'
  const memberCount = group.members?.filter(m => m.status === 'joined').length || 0

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="/" />

      <div className="container mx-auto max-w-lg px-4 py-6">
        <Card className="border-purple-200 bg-purple-50/50 mb-6">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-purple-800">
              <span className="font-medium">{organizerName}</span>さんからの貸切お誘い
            </p>
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-6 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        {/* シナリオ情報 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-4">
              {scenario?.key_visual_url && (
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.title || ''}
                  className="w-20 h-28 object-cover rounded"
                />
              )}
              <div className="flex-1">
                <h2 className="text-base font-medium">{scenario?.title || 'シナリオ'}</h2>
                {group.name && (
                  <p className="text-sm text-muted-foreground mt-1">{group.name}</p>
                )}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{memberCount}/{group.target_participant_count || '?'}名</span>
                  </div>
                </div>
                <Badge variant="outline" className="mt-2 bg-purple-100 text-purple-800 border-purple-200 text-xs">
                  貸切グループ
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 日程回答 */}
        <div className="mb-6">
          <h3 className="text-base font-semibold mb-3">参加可能な日時を選んでください</h3>
          <div className="space-y-3">
            {group.candidate_dates?.map((cd, index) => (
              <Card key={cd.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                          候補 {index + 1}
                        </Badge>
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>{formatDate(cd.date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>{cd.time_slot} {cd.start_time} - {cd.end_time}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div onClick={() => handleResponseChange(cd.id, 'ok')}>
                        {getResponseIcon(responses[cd.id], 'ok')}
                      </div>
                      <div onClick={() => handleResponseChange(cd.id, 'maybe')}>
                        {getResponseIcon(responses[cd.id], 'maybe')}
                      </div>
                      <div onClick={() => handleResponseChange(cd.id, 'ng')}>
                        {getResponseIcon(responses[cd.id], 'ng')}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex justify-center gap-6 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                <Circle className="w-2 h-2 text-white" />
              </div>
              参加可能
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                <HelpCircle className="w-2 h-2 text-white" />
              </div>
              未定
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                <X className="w-2 h-2 text-white" />
              </div>
              不可
            </div>
          </div>
        </div>

        {/* ゲスト情報（非ログイン時） */}
        {!user && !existingMemberId && (
          <Card className="mb-6">
            <CardContent className="p-4 space-y-4">
              <h3 className="text-base font-semibold">お名前を入力</h3>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">お名前 *</Label>
                <Input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="山田 太郎"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">メールアドレス（任意）</Label>
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="example@example.com"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  予約確定時にご連絡します
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ログイン中のユーザー情報 */}
        {user && !existingMemberId && (
          <Card className="mb-6 border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <p className="text-sm text-blue-800">
                <span className="font-medium">{user.email}</span> としてログイン中
              </p>
            </CardContent>
          </Card>
        )}

        {/* 送信ボタン */}
        <Button
          onClick={handleSubmit}
          disabled={actionLoading}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          {actionLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              送信中...
            </>
          ) : existingMemberId ? (
            '回答を更新する'
          ) : (
            '参加する'
          )}
        </Button>
      </div>
    </div>
  )
}
