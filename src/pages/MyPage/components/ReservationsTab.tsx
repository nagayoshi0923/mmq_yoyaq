import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, ChevronRight, Clock, MapPin, Sparkles, Users } from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { formatJstDateJa } from '@/utils/jstDate'
import type { Reservation } from '@/types'
import type { MyPageData } from '../hooks/useMyPageDataQuery'

interface ReservationsTabProps {
  privateGroups: MyPageData['privateGroups']
  activePrivateGroups: MyPageData['privateGroups']
  pendingPrivateBookings: Reservation[]
  upcomingReservations: Reservation[]
  pastReservations: Reservation[]
  scheduleEvents: MyPageData['scheduleEvents']
  scenarioImages: MyPageData['scenarioImages']
  orgNames: MyPageData['orgNames']
  stores: MyPageData['stores']
  reservationsSubTab: 'bookings' | 'private'
  setReservationsSubTab: (sub: 'bookings' | 'private') => void
  cleanTitle: (title?: string) => string
  getDaysUntil: (dateString: string) => number
  getPerformanceDateTime: (reservation: Reservation) => { date: string; time: string }
  getPerformanceStatus: (reservation: Reservation) => { label: string; color: string } | null
  setActiveTab: (tab: string) => void
}

/** 予約タブ（サブナビ/貸切リクエスト/調整中/予約一覧/参加履歴リンク）。MyPage から逐語抽出（presentational・挙動不変） */
export function ReservationsTab({
  privateGroups,
  activePrivateGroups,
  pendingPrivateBookings,
  upcomingReservations,
  pastReservations,
  scheduleEvents,
  scenarioImages,
  orgNames,
  stores,
  reservationsSubTab,
  setReservationsSubTab,
  cleanTitle,
  getDaysUntil,
  getPerformanceDateTime,
  getPerformanceStatus,
  setActiveTab,
}: ReservationsTabProps) {
  const navigate = useNavigate()
  return (
              <div className="space-y-4">
                {/* 予約タブ内サブナビ */}
                {(() => {
                  const activePg = privateGroups.filter((g) =>
                    ['gathering', 'date_adjusting', 'booking_requested', 'confirmed'].includes(g.status)
                  )
                  const privateCount = activePg.length + pendingPrivateBookings.length
                  return (
                    <div className="flex border border-gray-200 overflow-hidden bg-white" style={{ borderRadius: 0 }}>
                      <button
                        type="button"
                        onClick={() => setReservationsSubTab('bookings')}
                        className={`flex-1 py-3 px-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${
                          reservationsSubTab === 'bookings' ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                        style={
                          reservationsSubTab === 'bookings'
                            ? { backgroundColor: THEME.primary }
                            : undefined
                        }
                      >
                        <Calendar className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline">公演予約</span>
                        <span className="sm:hidden">予約</span>
                        {upcomingReservations.length > 0 && (
                          <span
                            className={`text-xs tabular-nums px-1.5 py-0.5 rounded ${
                              reservationsSubTab === 'bookings' ? 'bg-white/20' : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {upcomingReservations.length}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReservationsSubTab('private')}
                        className={`flex-1 py-3 px-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1 border-l border-gray-200 ${
                          reservationsSubTab === 'private' ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                        style={
                          reservationsSubTab === 'private'
                            ? { backgroundColor: THEME.primary }
                            : undefined
                        }
                      >
                        <Users className="w-4 h-4 shrink-0" />
                        貸切
                        {privateCount > 0 && (
                          <span
                            className={`text-xs tabular-nums px-1.5 py-0.5 rounded ${
                              reservationsSubTab === 'private' ? 'bg-white/20' : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {privateCount}
                          </span>
                        )}
                      </button>
                    </div>
                  )
                })()}

                {reservationsSubTab === 'private' && (
                  <>
                {/* 貸切リクエスト（グループベース） */}
                {privateGroups.filter(g => ['gathering', 'date_adjusting', 'booking_requested', 'confirmed'].includes(g.status)).length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-purple-600" />
                      <h3 className="text-sm font-bold text-gray-700">貸切リクエスト</h3>
                    </div>
                    {privateGroups.filter(g => ['gathering', 'date_adjusting', 'booking_requested', 'confirmed'].includes(g.status)).map((group) => {
                      const getGroupStatusLabel = (status: string) => {
                        switch (status) {
                          case 'gathering':
                            return '日程調整前'
                          case 'date_adjusting':
                            return '日程調整中'
                          case 'booking_requested':
                            return '申込済み'
                          case 'confirmed':
                            return '確定'
                          default:
                            return status
                        }
                      }
                      const statusLabel = getGroupStatusLabel(group.status)
                      
                      return (
                        <div 
                          key={group.id}
                          className="bg-white border border-purple-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
                          style={{ borderRadius: 0 }}
                          onClick={() => navigate(`/group/invite/${group.invite_code}`)}
                        >
                          <div 
                            className="px-3 py-1.5 text-purple-800 text-sm font-bold flex items-center justify-between"
                            style={{ backgroundColor: '#f3e8ff' }}
                          >
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>貸切（{statusLabel}）</span>
                              {group.is_organizer && (
                                <Badge variant="outline" className="text-xs bg-white">主催者</Badge>
                              )}
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                              {group.member_count}/{group.scenario_player_count_max || '?'}名
                            </span>
                          </div>

                          {group.is_organizer &&
                            group.candidate_dates_count > 0 &&
                            (group.status === 'gathering' || group.status === 'date_adjusting') && (
                              <div
                                className="border-b border-green-200 bg-green-50 px-3 py-2.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <p className="text-xs font-semibold text-green-900">
                                  候補日程が登録されています
                                </p>
                                <p className="text-[11px] text-green-800/90 mt-1 leading-snug">
                                  グループページを開き、画面の「予約リクエストを作成」から店舗へ申し込みを進められます。
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-full mt-2 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                                  style={{ borderRadius: 0 }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/group/invite/${group.invite_code}`)
                                  }}
                                >
                                  グループページを開く
                                </Button>
                              </div>
                            )}
                          
                          <div className="p-3 flex gap-3">
                            <div className="w-16 h-24 flex-shrink-0 bg-gray-900 relative overflow-hidden" style={{ borderRadius: 0 }}>
                              {group.scenario_image ? (
                                <>
                                  <div 
                                    className="absolute inset-0 scale-110"
                                    style={{
                                      backgroundImage: `url(${group.scenario_image})`,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                      filter: 'blur(8px) brightness(0.6)',
                                    }}
                                  />
                                  <img
                                    src={group.scenario_image}
                                    alt={group.scenario_title || ''}
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
                            
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">
                                {group.scenario_title || 'シナリオ未設定'}
                              </h3>
                              {group.name && (
                                <p className="text-xs text-gray-500 mt-0.5">{group.name}</p>
                              )}

                              {group.confirmed_schedule_line && (
                                <p className="flex items-start gap-1.5 mt-2 text-xs text-purple-900 font-medium leading-snug">
                                  <Calendar className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-600" />
                                  <span>{group.confirmed_schedule_line}</span>
                                </p>
                              )}

                              {group.member_displays && group.member_displays.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {group.member_displays.map((m, i) => (
                                    <span
                                      key={`${group.id}-m-${i}`}
                                      className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 border ${
                                        m.is_organizer
                                          ? 'bg-purple-100 border-purple-200 text-purple-900'
                                          : 'bg-gray-50 border-gray-200 text-gray-700'
                                      }`}
                                    >
                                      {m.is_organizer && (
                                        <span className="text-purple-600 font-semibold">主催</span>
                                      )}
                                      <span className="truncate max-w-[7rem] sm:max-w-[10rem]">{m.name}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                              
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2 text-xs text-gray-500">
                                <Users className="w-3 h-3" />
                                <span>{group.member_count}名参加中</span>
                                <span>•</span>
                                <span>コード: {group.invite_code}</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center">
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

                {/* 調整中の貸切申込み */}
                {pendingPrivateBookings.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-bold text-gray-700">日程調整中の貸切申込み</h3>
                    </div>
                    {pendingPrivateBookings.map((reservation) => {
                      const imageUrl = reservation.scenario_master_id ? scenarioImages[reservation.scenario_master_id] : null
                      const candidateDatetimes = reservation.candidate_datetimes as {
                        candidates?: Array<{ order: number; date: string; timeSlot: string; startTime: string; endTime: string; status: string }>
                        confirmedStore?: { storeId: string; storeName?: string }
                        confirmedDateTime?: { date: string; timeSlot: string }
                        requestedStores?: Array<{ storeId: string; storeName: string; storeShortName?: string }>
                      } | null
                      
                      const getStatusLabel = (status: string) => {
                        switch (status) {
                          case 'pending':
                          case 'pending_gm':
                            return { label: 'GM回答待ち', color: 'bg-amber-100 text-amber-700' }
                          case 'gm_confirmed':
                          case 'pending_store':
                            return { label: '店舗確認中', color: 'bg-blue-100 text-blue-700' }
                          default:
                            return { label: '調整中', color: 'bg-gray-100 text-gray-700' }
                        }
                      }
                      const statusInfo = getStatusLabel(reservation.status)
                      
                      // 候補日をフォーマット（最初の3件まで表示）
                      const formatCandidateDate = (date: string, timeSlot: string) => {
                        return `${formatJstDateJa(date, true)} ${timeSlot}`
                      }
                      const candidates = candidateDatetimes?.candidates || []
                      const displayCandidates = candidates.slice(0, 3)
                      const remainingCount = candidates.length - 3
                      
                      // 希望店舗
                      const requestedStores = candidateDatetimes?.requestedStores || []
                      const storeNames = requestedStores.map(s => s.storeShortName || s.storeName).filter(Boolean)
                      
                      return (
                        <div 
                          key={reservation.id}
                          className="bg-white border border-amber-200 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer"
                          style={{ borderRadius: 0 }}
                          onClick={() => navigate(`/mypage/reservation/${reservation.id}`)}
                        >
                          <div 
                            className="px-3 py-1.5 text-amber-800 text-sm font-bold flex items-center justify-between"
                            style={{ backgroundColor: '#fef3c7' }}
                          >
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>日程調整中</span>
                              {reservation.organization_id && orgNames[reservation.organization_id] && (
                                <span className="text-xs font-normal text-amber-700">
                                  （{orgNames[reservation.organization_id]}）
                                </span>
                              )}
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                          
                          <div className="p-3 flex gap-3">
                            <div className="w-16 h-24 flex-shrink-0 bg-gray-900 relative overflow-hidden" style={{ borderRadius: 0 }}>
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
                            
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">
                                {cleanTitle(reservation.title)}
                              </h3>
                              
                              {/* 候補日一覧 */}
                              <div className="mt-1.5 space-y-0.5">
                                {displayCandidates.map((c, i) => (
                                  <p key={i} className="text-xs text-gray-600 flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                    <span className="font-medium">{formatCandidateDate(c.date, c.timeSlot)}</span>
                                  </p>
                                ))}
                                {remainingCount > 0 && (
                                  <p className="text-xs text-gray-400">
                                    他{remainingCount}件の候補日
                                  </p>
                                )}
                              </div>
                              
                              {/* 希望店舗 */}
                              {storeNames.length > 0 && (
                                <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  {storeNames.join('・')}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs text-gray-500">
                                <span className="font-mono">{reservation.reservation_number}</span>
                                <span>•</span>
                                <Users className="w-3 h-3" />
                                <span>{reservation.participant_count}名</span>
                                <span>•</span>
                                <span>
                                  {`${formatJstDateJa(reservation.created_at)} 申込`}
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center">
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

                {activePrivateGroups.length === 0 && pendingPrivateBookings.length === 0 && (
                  <div
                    className="bg-white border border-gray-200 p-8 text-center text-gray-500 text-sm"
                    style={{ borderRadius: 0 }}
                  >
                    <Users className="w-8 h-8 mx-auto mb-2 text-purple-300" />
                    <p>貸切グループ・日程調整中の申込みはまだありません</p>
                    <p className="text-xs text-gray-400 mt-2">
                      招待ページから参加するか、新しくグループを作成できます
                    </p>
                  </div>
                )}
                  </>
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
                      
                      // 貸切公演かどうか
                      const eventId = reservation.schedule_event_id
                      const isPrivate = eventId ? scheduleEvents[eventId]?.category === 'private' : false
                      
                      // 日付を短くフォーマット（1/11(日)）
                      const shortDate = formatJstDateJa(perf.date, true)
                      
                      return (
                        <div 
                          key={reservation.id}
                          className="bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                          style={{ borderRadius: 0 }}
                          onClick={() => navigate(`/mypage/reservation/${reservation.id}`)}
                        >
                          {/* カウントダウンバー（各予約・公演日までの日数）※キャンセル済みは非表示 */}
                          {daysUntil >= 0 && reservation.status !== 'cancelled' && (
                            <div 
                              className="px-3 py-1.5 text-white text-sm font-bold flex items-center gap-2"
                              style={{ backgroundColor: THEME.primary }}
                            >
                              <Sparkles className="w-4 h-4" />
                              {daysUntil === 0 ? '本日公演' : `あと${daysUntil}日`}
                            </div>
                          )}
                          
                          {/* メインコンテンツ */}
                          <div className="p-3 flex gap-3">
                            {/* 画像 */}
                            <div className="w-16 h-24 flex-shrink-0 bg-gray-900 relative overflow-hidden" style={{ borderRadius: 0 }}>
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
                              <p className="text-sm font-bold mt-1" style={{ color: THEME.primary }}>
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
                                {isPrivate ? (
                                  // 貸切公演：合計金額を表示
                                  <span className="font-bold text-gray-700">
                                    ¥{(reservation.final_price || 0).toLocaleString()}
                                  </span>
                                ) : (
                                  // 通常公演：1人あたりと合計を表示
                                  <span className="font-bold text-gray-700">
                                    ¥{(reservation.unit_price || 0).toLocaleString()}/人
                                    <span className="font-normal text-gray-500 ml-1">
                                      (計¥{(reservation.final_price || 0).toLocaleString()})
                                    </span>
                                  </span>
                                )}
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
                  <div className="bg-white border border-gray-200 p-8 text-center" style={{ borderRadius: 0 }}>
                    <div 
                      className="w-14 h-14 flex items-center justify-center mx-auto mb-3"
                      style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
                    >
                      <Calendar className="w-7 h-7" style={{ color: THEME.primary }} />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">予約がありません</h3>
                    <p className="text-gray-500 text-sm mb-4">公演を探して予約しましょう</p>
                    <Button 
                      className="text-white px-6"
                      style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
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
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200"
                    style={{ borderRadius: 0 }}
                    onClick={() => setActiveTab('album')}
                  >
                    <span className="text-sm text-gray-600">過去の参加履歴を見る</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: THEME.primary }}>{pastReservations.length}件</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                )}
                  </>
                )}
              </div>
  )
}
