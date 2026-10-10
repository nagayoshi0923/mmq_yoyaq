/**
 * 貸切グループの招待画面の状態ごとの画面（読み込み中・招待が見つからない・キャンセル済み・参加登録完了）。
 * 招待画面（index.tsx）から見た目を変えずに切り出したもの。
 */
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import type { PrivateGroupProgress } from '@/components/patterns/privateGroup/privateGroupScheduleRules'

export function InviteLoadingScreen() {
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

export function InviteNotFoundScreen({ onBackToTop }: { onBackToTop: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="/" />
      <div className="container mx-auto max-w-lg px-4 py-12">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">招待が見つかりません</h2>
            <p className="text-sm text-muted-foreground mb-2">
              招待コードが無効か、有効期限が切れています
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              お手数ですが、主催者に新しい招待リンクを送ってもらってください。
              <br />
              電波の弱い場所では、再読み込みすると開けることがあります。
            </p>
            <Button onClick={onBackToTop}>
              トップへ戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function InviteCancelledScreen({ onBackToTop }: { onBackToTop: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="/" />
      <div className="container mx-auto max-w-lg px-4 py-12">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">このグループは閉じられています</h2>
            <p className="text-sm text-muted-foreground mb-4">
              主催者がグループを閉じたか、店舗への申込が取り下げ・キャンセルされました
            </p>
            <Button onClick={onBackToTop}>
              トップへ戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** 参加完了画面の「このあと」の案内（グループの進み具合ごと） */
const JOIN_SUCCESS_NEXT_STEP: Record<PrivateGroupProgress, string[]> = {
  gathering: ['主催者が全員の回答を確認後、貸切予約を申し込みます。', '予約確定後にご連絡いたします。'],
  requested: ['このグループはすでに店舗へ申し込み済みです。', '店舗の返事をお待ちください。日程が決まるとご連絡いたします。'],
  confirmed: ['このグループの予約はすでに確定しています。', '日時はグループページでご確認ください。'],
}

export function InviteJoinSuccessScreen({ generatedPin, isNewMember = false, guestEmail, progress = 'gathering', isMember = false, onViewGroup, onBackToTop }: {
  generatedPin: string | null
  /** 今回の操作で新しく参加した（回答の更新ではない） */
  isNewMember?: boolean
  guestEmail: string
  /** グループの進み具合（店舗へ申込済みなら「店舗の返事待ち」と案内する） */
  progress?: PrivateGroupProgress
  /** ログインした会員として参加した（マイページから戻れるのでブックマーク案内は出さない） */
  isMember?: boolean
  onViewGroup: () => void
  onBackToTop: () => void
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="/" />
      <div className="container mx-auto max-w-lg px-4 py-12 space-y-4">
        <Card className="border-2 border-green-200 bg-green-50">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-lg text-green-800 font-medium">
              {generatedPin || isNewMember ? '参加登録が完了しました！' : '回答を更新しました！'}
            </h2>
            <p className="text-sm text-green-700">
              {JOIN_SUCCESS_NEXT_STEP[progress][0]}
              <br />
              {JOIN_SUCCESS_NEXT_STEP[progress][1]}
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={onViewGroup}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                グループページを見る
              </Button>
              <Button
                variant="outline"
                onClick={onBackToTop}
                className="border-green-600 text-green-700"
              >
                トップへ戻る
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* PIN表示（新規ゲスト参加時のみ） */}
        {generatedPin && (
          <Card className="border-2 border-red-300 bg-red-50">
            <CardContent className="p-4 text-center space-y-3">
              <p className="text-sm font-bold text-red-800">
                🔑 アクセスPINを控えてください
              </p>
              <div className="bg-white border-2 border-red-300 rounded-lg py-3 px-6 inline-block">
                <span className="text-3xl font-mono font-bold tracking-widest text-red-700">
                  {generatedPin}
                </span>
              </div>
              <p className="text-xs text-red-700">
                次回このグループにアクセスする際に、<br />
                メールアドレス（{guestEmail}）とこのPINが必要です
              </p>
            </CardContent>
          </Card>
        )}
        
        {/* 戻り方の案内（会員はマイページから、ゲストはブックマークで） */}
        {isMember ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-amber-800 font-medium">
                マイページの貸切タブからいつでも開けます
              </p>
              <p className="text-xs text-amber-700 mt-1">
                グループの状況確認や回答の変更ができます
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-amber-800">
                📌 <span className="font-medium">このページをブックマークしてください</span>
              </p>
              <p className="text-xs text-amber-700 mt-1">
                グループの状況確認や回答変更にいつでもアクセスできます
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
