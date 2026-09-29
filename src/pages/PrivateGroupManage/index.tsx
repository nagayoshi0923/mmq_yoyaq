import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { usePrivateGroupData } from '@/hooks/usePrivateGroupData'

/** 旧管理URLを維持し、現在のグループ画面へ転送する。 */
export function PrivateGroupManage() {
  const navigate = useNavigate()
  const location = useLocation()
  const id = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    return segments[0] === 'group' && segments[1] === 'manage' ? segments[2] || null : null
  }, [location.pathname])
  const { group, loading, error } = usePrivateGroupData(id)
  const inviteCode = group?.invite_code

  useEffect(() => {
    if (!loading && !error && inviteCode) {
      navigate(`/group/invite/${encodeURIComponent(inviteCode)}`, { replace: true })
    }
  }, [loading, error, inviteCode, navigate])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="/" />
      <div className="container mx-auto max-w-3xl px-4 py-12">
        {loading || (!error && inviteCode) ? (
          <div role="status" className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            読み込み中...
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-4" />
              <h2>グループが見つかりません</h2>
              <p>{error || 'グループが存在しないか、アクセス権がありません'}</p>
              <Button onClick={() => navigate('/')}>トップへ戻る</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
