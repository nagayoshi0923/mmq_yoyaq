import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Calendar, ChevronRight, Sparkles, Users, XCircle } from 'lucide-react'
import { formatJstDateJa } from '@/utils/jstDate'
import type { Reservation } from '@/types'
import type { MyPageData } from '../hooks/useMyPageDataQuery'
import { PrivateBookingSections } from './PrivateBookingCards/PrivateBookingSections'
import { countActivePrivateBookings, type PrivateBookingView } from './PrivateBookingCards/privateBookingModel'
import { CANCEL_KIND_LABELS, cancelledDateReplacement, classifyCancellation } from '../utils/cancelledReservation'

export type ReservationsSubTab = 'bookings' | 'private' | 'cancelled'

interface ReservationsTabProps {
  privateView: PrivateBookingView
  upcomingReservations: Reservation[]
  pastReservations: Reservation[]
  cancelledReservations: Reservation[]
  scenarioImages: MyPageData['scenarioImages']
  stores: MyPageData['stores']
  reservationsSubTab: ReservationsSubTab
  setReservationsSubTab: (sub: ReservationsSubTab) => void
  cleanTitle: (title?: string) => string
  getDaysUntil: (dateString: string) => number
  getPerformanceDateTime: (reservation: Reservation) => { date: string; time: string }
  getPerformanceStatus: (reservation: Reservation) => { label: string; color: string } | null
  /** 貸切の予約か（キャンセル済みで候補日を日付として出さない判定に使う） */
  isPrivate: (reservation: Reservation) => boolean
  setActiveTab: (tab: string) => void
}

/** 予約タブ（サブタブ: 一般公演／貸切／キャンセル済み）。仕様: docs/product-spec/マイページ改修_2026-10.md */
export function ReservationsTab({
  privateView,
  upcomingReservations,
  pastReservations,
  cancelledReservations,
  scenarioImages,
  stores,
  reservationsSubTab,
  setReservationsSubTab,
  cleanTitle,
  getDaysUntil,
  getPerformanceDateTime,
  getPerformanceStatus,
  isPrivate,
  setActiveTab,
}: ReservationsTabProps) {
  const navigate = useNavigate()
  const subTabs: Array<{ id: ReservationsSubTab; label: string; shortLabel: string; icon: typeof Calendar; count: number }> = [
    { id: 'bookings', label: '一般公演', shortLabel: '一般公演', icon: Calendar, count: upcomingReservations.length },
    { id: 'private', label: '貸切', shortLabel: '貸切', icon: Users, count: countActivePrivateBookings(privateView) },
    { id: 'cancelled', label: 'キャンセル済み', shortLabel: 'キャンセル', icon: XCircle, count: cancelledReservations.length },
  ]
  return (
              <div className="space-y-4">
                {/* 予約タブ内サブタブ */}
                <div className="flex border border-border overflow-hidden bg-card rounded-none" role="tablist" aria-label="予約の種類">
                  {subTabs.map((tab, i) => {
                    const Icon = tab.icon
                    const selected = reservationsSubTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-label={`${tab.label}（${tab.count}件）`}
                        onClick={() => setReservationsSubTab(tab.id)}
                        className={`flex-1 py-3 px-1 text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${i > 0 ? 'border-l border-border' : ''} ${
                          selected ? 'text-white bg-mypage-primary' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0 hidden min-[400px]:block" aria-hidden="true" />
                        <span className="whitespace-nowrap hidden sm:inline">{tab.label}</span>
                        <span className="whitespace-nowrap sm:hidden">{tab.shortLabel}</span>
                        {tab.count > 0 && (
                          <span
                            className={`text-xs tabular-nums px-1.5 py-0.5 rounded-sm ${selected ? 'bg-white/20' : 'bg-muted text-foreground'}`}
                            aria-hidden="true"
                          >
                            {tab.count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {reservationsSubTab === 'private' && (
                  <PrivateBookingSections view={privateView} onShowCancelled={() => setReservationsSubTab('cancelled')} />
                )}

                {reservationsSubTab === 'bookings' && (
                  <>
                {/* 予約一覧 */}
                {upcomingReservations.length > 0 ? (
                  <>
                    {upcomingReservations.map((reservation) => {
                      const perf = getPerformanceDateTime(reservation)
                      const daysUntil = getDaysUntil(perf.date)
                      const store = reservation.store_id ? stores[reservation.store_id] : null
                      const imageUrl = reservation.scenario_master_id ? scenarioImages[reservation.scenario_master_id] : null
                      
                      // 日付を短くフォーマット（1/11(日)）
                      const shortDate = formatJstDateJa(perf.date, true)
                      
                      return (
                        <div 
                          key={reservation.id}
                          className="bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer rounded-none"
                          onClick={() => navigate(`/mypage/reservation/${reservation.id}`)}
                        >
                          {/* カウントダウンバー（各予約・公演日までの日数） */}
                          {daysUntil >= 0 && (
                            <div 
                              className="px-3 py-1.5 text-white text-sm font-bold flex items-center gap-2 bg-mypage-primary"
                            >
                              <Sparkles className="w-4 h-4" />
                              {daysUntil === 0 ? '本日公演' : `あと${daysUntil}日`}
                            </div>
                          )}
                          
                          {/* メインコンテンツ */}
                          <div className="p-3 flex gap-3">
                            {/* 画像 */}
                            <div className="w-16 h-24 flex-shrink-0 bg-gray-900 relative overflow-hidden rounded-none">
                              {imageUrl ? (
                                <>
                                  <div 
                                    className="absolute inset-0 scale-110"
                                    style={{
                                      backgroundImage: `url(${imageUrl})`,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                      filter: 'blur(8px) brightness(0.6)',
                                    }}
                                  />
                                  <img
                                    src={imageUrl}
                                    alt={reservation.title}
                                    className="relative w-full h-full object-contain"
                                    loading="lazy"
                                  />
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <span className="text-xl opacity-40">🎭</span>
                                </div>
                              )}
                            </div>
                            
                            {/* 情報 */}
                            <div className="flex-1 min-w-0">
                              {/* タイトル */}
                              <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">
                                {cleanTitle(reservation.title)}
                              </h3>
                              
                              {/* 公演日時 */}
                              <p className="text-sm font-bold mt-1 text-mypage-primary">
                                {shortDate} {perf.time ? perf.time.slice(0, 5) : ''}
                              </p>
                              
                              {/* 会場・住所 */}
                              {store && (
                                <div className="mt-1 text-xs text-gray-600">
                                  <p className="font-medium">{store.name}</p>
                                  {store.address && (
                                    <p className="text-gray-500 mt-0.5">{store.address}</p>
                                  )}
                                </div>
                              )}
                              
                              {/* 公演成立状況 */}
                              {(() => {
                                const status = getPerformanceStatus(reservation)
                                if (!status) return null
                                return (
                                  <div className="mt-1.5">
                                    <span className={`text-xs px-2 py-0.5 rounded ${status.color}`}>
                                      {status.label}
                                    </span>
                                  </div>
                                )
                              })()}

                              {/* 予約番号・人数・料金 */}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs text-gray-500">
                                <span className="font-mono">{reservation.reservation_number}</span>
                                <span>•</span>
                                <span>{reservation.participant_count}名</span>
                                <span>•</span>
                                <span className="font-bold text-gray-700">
                                  ¥{(reservation.unit_price || 0).toLocaleString()}/人
                                  <span className="font-normal text-gray-500 ml-1">
                                    (計¥{(reservation.final_price || 0).toLocaleString()})
                                  </span>
                                </span>
                              </div>
                            </div>
                            
                            {/* 矢印 */}
                            <div className="flex items-center">
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <div className="bg-white border border-gray-200 p-8 text-center rounded-none">
                    <div 
                      className="w-14 h-14 flex items-center justify-center mx-auto mb-3 bg-mypage-primary-light rounded-none"
                    >
                      <Calendar className="w-7 h-7 text-mypage-primary" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">予約がありません</h3>
                    <p className="text-gray-500 text-sm mb-4">公演を探して予約しましょう</p>
                    <Button 
                      className="text-white px-6 bg-mypage-primary hover:bg-mypage-primary-hover rounded-none"
                      onClick={() => navigate('/scenario')}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      公演を探す
                    </Button>
                  </div>
                )}

                {/* 参加履歴へのリンク */}
                {pastReservations.length > 0 && (
                  <div 
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200 rounded-none"
                    onClick={() => setActiveTab('album')}
                  >
                    <span className="text-sm text-gray-600">過去の参加履歴を見る</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-mypage-primary">{pastReservations.length}件</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                )}
                  </>
                )}

                {reservationsSubTab === 'cancelled' && (
                  <>
                    {cancelledReservations.length > 0 ? (
                      cancelledReservations.map((reservation) => {
                        const perf = getPerformanceDateTime(reservation)
                        const store = reservation.store_id ? stores[reservation.store_id] : null
                        const imageUrl = reservation.scenario_master_id ? scenarioImages[reservation.scenario_master_id] : null
                        const shortDate = formatJstDateJa(perf.date, true)
                        const cancelKind = CANCEL_KIND_LABELS[classifyCancellation(reservation.cancellation_reason)]
                        const dateReplacement = cancelledDateReplacement(reservation, isPrivate(reservation))
                        return (
                          <div
                            key={reservation.id}
                            className="bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer rounded-none"
                            onClick={() => navigate(`/mypage/reservation/${reservation.id}`)}
                          >
                            <div className="p-3 flex gap-3">
                              {/* 画像（キャンセル済みは淡く） */}
                              <div className="w-14 h-20 flex-shrink-0 bg-gray-900 relative overflow-hidden rounded-none">
                                {imageUrl ? (
                                  <img
                                    src={imageUrl}
                                    alt={reservation.title}
                                    className="w-full h-full object-cover opacity-50"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <span className="text-xl opacity-30">🎭</span>
                                  </div>
                                )}
                              </div>

                              {/* 情報 */}
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-700 text-sm leading-tight line-clamp-1">
                                  {cleanTitle(reservation.title)}
                                </h3>
                                <p className="text-sm mt-1 text-muted-foreground" data-testid="cancelled-date">
                                  {dateReplacement ?? `${shortDate} ${perf.time ? perf.time.slice(0, 5) : ''}`}
                                </p>
                                {store && (
                                  <p className="mt-1 text-xs text-gray-500 font-medium truncate">{store.name}</p>
                                )}
                                <div className="mt-1.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-sm ${cancelKind.color}`} data-testid="cancelled-kind">
                                    {cancelKind.label}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs text-gray-400">
                                  <span className="font-mono">{reservation.reservation_number}</span>
                                  <span>•</span>
                                  <span>{reservation.participant_count}名</span>
                                </div>
                              </div>

                              {/* 矢印 */}
                              <div className="flex items-center">
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="bg-white border border-gray-200 p-8 text-center rounded-none">
                        <p className="text-gray-500 text-sm">キャンセルした予約はありません</p>
                      </div>
                    )}
                  </>
                )}
              </div>
  )
}
