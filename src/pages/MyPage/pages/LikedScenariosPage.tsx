import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Heart, Users, Clock, Sparkles, ChevronRight, CalendarDays } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { useLikedScenariosQuery, useRemoveLikeMutation, useWishlistNextEventsQuery, type WishlistNextEvent } from '../hooks/useLikedScenariosQuery'
import { formatJstDateJa, formatJstMonthDay } from '@/utils/jstDate'

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
  const seats = next.remaining == null ? '' : next.remaining === 0 ? '満席' : `残り${next.remaining}席`
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
      <div className="bg-white shadow-sm p-8 text-center border border-gray-200 rounded-none">
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="w-5 h-5 text-mypage-primary" />
        <h2 className="font-bold text-gray-900">遊びたいシナリオ ({(wantToPlayScenarios as WantToPlayScenario[]).length})</h2>
      </div>

      {(wantToPlayScenarios as WantToPlayScenario[]).map((item) => (
        <div
          key={item.id}
          className="bg-white shadow-sm p-4 hover:shadow-md transition-all duration-300 cursor-pointer border border-gray-200 hover:border-gray-300 rounded-none"
          onClick={() => {
            navigate(`${bookingBasePath}/scenario/${item.scenario.slug || item.scenario.id}`)
          }}
        >
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-20 h-28 bg-gray-900 overflow-hidden relative rounded-none">
              {item.scenario.key_visual_url ? (
                <>
                  <div
                    className="absolute inset-0 scale-110"
                    style={{
                      backgroundImage: `url(${item.scenario.key_visual_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      filter: 'blur(10px) brightness(0.7)',
                    }}
                  />
                  <img
                    src={item.scenario.key_visual_url}
                    alt={item.scenario.title}
                    className="relative w-full h-full object-contain"
                    loading="lazy"
                  />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎭</div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 line-clamp-2">{item.scenario.title}</h3>
                  <p className="ts-muted mt-1">作者: {item.scenario.author}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove(item.id)
                  }}
                  className="flex-shrink-0 hover:bg-red-50"
                  title="お気に入りから削除"
                  aria-label={`${item.scenario.title}を遊びたいリストから外す`}
                >
                  <Heart className="h-5 w-5 fill-current text-mypage-primary" aria-hidden="true" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  <Users className="w-3 h-3 mr-1" />
                  {item.scenario.player_count_min === item.scenario.player_count_max
                    ? `${item.scenario.player_count_max}人`
                    : `${item.scenario.player_count_min}〜${item.scenario.player_count_max}人`}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  {Math.floor(item.scenario.duration / 60)}h{item.scenario.duration % 60 > 0 ? `${item.scenario.duration % 60}m` : ''}
                </Badge>
                {item.scenario.difficulty >= 1 && item.scenario.difficulty <= 5 && (
                  <Badge variant="outline" className="text-xs">
                    {getDifficultyLabel(item.scenario.difficulty)}
                  </Badge>
                )}
              </div>

              <NextEventLine next={nextEvents?.[item.scenario.id]} loading={nextLoading} onOpen={href => navigate(href)} />

              <p className="ts-caption mt-2">追加日: {formatDate(item.created_at)}</p>
            </div>

            <div className="flex items-center">
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
