import { durationLabel, playersLabel } from '@/components/renewal/labels'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Heart, Sparkles, CalendarDays, Drama } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { useLikedScenariosQuery, useRemoveLikeMutation, useWishlistNextEventsQuery, type WishlistNextEvent } from '../hooks/useLikedScenariosQuery'
import { formatJstDateJa, formatJstMonthDay } from '@/utils/jstDate'
import { isFewSeats, seatCountText } from '@/lib/seatLabel'

interface WantToPlayScenario {
  id: string
  scenario_id: string
  created_at: string
  scenario: {
    id: string
    slug?: string
    title: string
    description: string
    author: string
    duration: number
    player_count_min: number
    player_count_max: number
    difficulty: number
    genre: string[]
    rating: number
    play_count: number
    key_visual_url?: string
  }
}

const formatDate = (date: string) => {
  return formatJstDateJa(date)
}

const getDifficultyLabel = (difficulty: number) => {
  switch (difficulty) {
    case 1: return '初級'
    case 2: return '中級'
    case 3: return '上級'
    case 4: return '最上級'
    case 5: return '超上級'
    default: return '不明'
  }
}

/** 作品ごとの「次の公演」1 件。押すと作品ページの公演選択へ */
function NextEventLine({ next, loading, onOpen }: { next: WishlistNextEvent | undefined; loading: boolean; onOpen: (href: string) => void }) {
  if (loading) return <p className="ts-caption mt-2" role="status">次の公演を確認中...</p>
  if (!next) {
    return <p className="ts-caption mt-2" data-testid="wishlist-next-none">予定なし・貸切リクエストできます</p>
  }
  const seats = next.remaining == null || next.capacity == null ? '' : next.remaining === 0 ? '満席' : `${seatCountText(next.booked, next.capacity)}${isFewSeats(next.remaining) ? '・残少' : ''}`
  return (
    <button
      type="button"
      data-testid="wishlist-next-event"
      className="mt-2 w-full flex items-center gap-2 px-2 py-1.5 border border-border bg-muted hover:bg-accent text-left transition-colors rounded-none"
      aria-label={`次の公演 ${formatJstMonthDay(next.date, true)} ${next.startTime} ${next.venue ?? ''} ${seats} の予約へ進む`}
      onClick={e => {
        e.stopPropagation()
        onOpen(next.href)
      }}
    >
      <CalendarDays className="w-4 h-4 shrink-0 text-mypage-primary" aria-hidden="true" />
      <span className="text-xs text-foreground min-w-0 flex-1">
        <span className="block">
          次の公演
          {seats && <span className={`ml-2 ${next.remaining === 0 ? 'text-muted-foreground' : 'text-mypage-primary font-bold'}`}>{seats}</span>}
        </span>
        <span className="block">
          <span className="font-bold whitespace-nowrap">{formatJstMonthDay(next.date, true)} {next.startTime}</span>
          {next.venue ? ` ${next.venue}` : ''}
        </span>
      </span>
    </button>
  )
}

export function WantToPlayPage() {
  const { user } = useAuth()
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const bookingBasePath = organization?.slug ? `/${organization.slug}` : ''

  const { data: wantToPlayScenarios = [], isLoading } = useLikedScenariosQuery(user?.id)
  const removeLike = useRemoveLikeMutation(user?.id)
  const { data: nextEvents, isLoading: nextLoading } = useWishlistNextEventsQuery(
    (wantToPlayScenarios as WantToPlayScenario[]).map(item => item.scenario.id),
  )

  const handleRemove = (likeId: string) => {
    removeLike.mutate(likeId)
  }

  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-500">読み込み中...</div>
    )
  }

  if ((wantToPlayScenarios as WantToPlayScenario[]).length === 0) {
    return (
      <div className="bg-white p-8 text-center border border-gray-200 rounded-none">
        <div
          className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-mypage-primary-light rounded-none"
        >
          <Heart className="w-8 h-8 text-mypage-primary" />
        </div>
        <h3 className="font-bold text-gray-900 mb-2">遊びたいリスト</h3>
        <p className="ts-muted mb-6">
          気になるシナリオをお気に入りに追加して<br />
          公演情報をチェックしましょう
        </p>
        <Button
          className="text-white px-8 bg-mypage-primary hover:bg-mypage-primary-hover rounded-none"
          onClick={() => navigate('/')}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          シナリオを探す
        </Button>
      </div>
    )
  }

  const list = wantToPlayScenarios as WantToPlayScenario[]
  // 見本: 1 つの白い箱に「遊びたい作品（N作品）」と、画像・作品名・人数と時間・次の公演の行を並べる
  return (
    <section className="border border-gray-200 bg-white p-4" data-testid="liked-scenarios">
      <h2 className="text-lg font-bold">遊びたい作品（{list.length}作品）</h2>
      <ul className="mt-2">
        {list.map((item) => (
          <li key={item.id} className="flex items-start gap-3 border-b border-gray-200 py-4 last:border-b-0">
            <button
              type="button"
              className="flex min-w-0 flex-1 gap-3 text-left"
              onClick={() => navigate(`${bookingBasePath}/scenario/${item.scenario.slug || item.scenario.id}`)}
            >
              <div className="h-20 w-[60px] shrink-0 overflow-hidden bg-gray-900">
                {item.scenario.key_visual_url
                  ? <img src={item.scenario.key_visual_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : <div className="flex h-full w-full items-center justify-center"><Drama className="h-6 w-6 text-muted-foreground opacity-40" aria-hidden="true" /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold leading-snug line-clamp-2">{item.scenario.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[playersLabel(item.scenario.player_count_min, item.scenario.player_count_max), durationLabel(item.scenario.duration), item.scenario.difficulty >= 1 && item.scenario.difficulty <= 5 ? getDifficultyLabel(item.scenario.difficulty) : null].filter(Boolean).join('・')}
                </p>
                <NextEventLine next={nextEvents?.[item.scenario.id]} loading={nextLoading} onOpen={href => navigate(href)} />
                <p className="mt-1 text-2xs text-muted-foreground">追加日: {formatDate(item.created_at)}</p>
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRemove(item.id)}
              className="flex-shrink-0 hover:bg-red-50"
              title="遊びたいから外す"
              aria-label={`${item.scenario.title}を遊びたいリストから外す`}
            >
              <Heart className="h-5 w-5 fill-current text-mypage-primary" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
