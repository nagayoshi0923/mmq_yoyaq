import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Images, Calendar, MapPin, Star, EyeOff, Users, Clock, User, Plus, Trash2, Pencil, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { showToast } from '@/utils/toast'
import { OptimizedImage } from '@/components/ui/optimized-image'
import {
  useAlbumQuery, useAlbumOptionsQuery, useScenarioCharactersQuery,
  useAddManualHistoryMutation, useSaveCharacterMutation, useDeleteManualHistoryMutation,
  useToggleLikeMutation, useRemoveLikeMutation,
  type PlayedScenario,
} from '../hooks/useAlbumQuery'

const formatDate = (date: string) => {
  const d = new Date(date)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const cleanTitle = (title: string) =>
  title.replace(/\s*-\s*\d{4}年\d{1,2}月\d{1,2}日\([月火水木金土日]\)/g, '').trim()

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

export function AlbumPage() {
  const { user } = useAuth()
  const { organizationId } = useOrganization()
  const navigate = useNavigate()
  const [hiddenScenarios, setHiddenScenarios] = useState<Set<string>>(new Set())

  // 手動登録用ステート
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newScenarioId, setNewScenarioId] = useState('')
  const [newPlayedAt, setNewPlayedAt] = useState('')
  const [newStoreId, setNewStoreId] = useState('')
  const [newRating, setNewRating] = useState(0)
  const [newCharacterId, setNewCharacterId] = useState('')

  // 配役記録用ステート
  const [editCharacterPlay, setEditCharacterPlay] = useState<PlayedScenario | null>(null)
  const [editCharacterId, setEditCharacterId] = useState('')

  // Queries
  const { data: albumData, isLoading } = useAlbumQuery(user?.email)
  const { data: optionsData, isLoading: optionsLoading } = useAlbumOptionsQuery()
  const { data: newCharacterOptions = [] } = useScenarioCharactersQuery(newScenarioId || undefined)
  const { data: editCharacterOptions = [] } = useScenarioCharactersQuery(editCharacterPlay?.scenario_id || undefined)

  const playedScenarios = albumData?.playedScenarios ?? []
  const likedScenariosList = albumData?.likedScenariosList ?? []
  const likedScenarios = albumData?.likedScenarios ?? new Set<string>()
  const customerId = albumData?.customerId ?? null
  const scenarioOptions = optionsData?.scenarioOptions ?? []
  const storeOptions = optionsData?.storeOptions ?? []

  // Mutations
  const addManualHistory = useAddManualHistoryMutation(customerId, scenarioOptions, storeOptions, organizationId, user?.email)
  const saveCharacter = useSaveCharacterMutation(customerId, user?.email)
  const deleteManualHistory = useDeleteManualHistoryMutation(customerId, user?.email)
  const toggleLike = useToggleLikeMutation(customerId, organizationId, user?.email)
  const removeLike = useRemoveLikeMutation(user?.email)

  const handleAddManualHistory = async () => {
    if (!newScenarioId) { showToast.error('シナリオは必須です'); return }
    await addManualHistory.mutateAsync({ scenarioId: newScenarioId, playedAt: newPlayedAt, storeId: newStoreId, rating: newRating, characterId: newCharacterId, characterOptions: newCharacterOptions })
    setIsAddDialogOpen(false)
    setNewScenarioId(''); setNewPlayedAt(''); setNewStoreId(''); setNewRating(0); setNewCharacterId('')
  }

  const handleSaveCharacter = async () => {
    if (!editCharacterPlay) return
    await saveCharacter.mutateAsync({ play: editCharacterPlay, characterId: editCharacterId, characterOptions: editCharacterOptions })
    setEditCharacterPlay(null)
  }

  const handleToggleHide = (scenarioName: string) => {
    setHiddenScenarios(prev => {
      const newSet = new Set(prev)
      if (newSet.has(scenarioName)) newSet.delete(scenarioName)
      else newSet.add(scenarioName)
      return newSet
    })
  }

  const scenarioGroups = playedScenarios.reduce((acc, item) => {
    const existing = acc.find((g) => g.scenario === item.scenario)
    if (existing) { existing.plays.push(item); existing.count++ }
    else acc.push({ scenario: item.scenario, count: 1, plays: [item] })
    return acc
  }, [] as Array<{ scenario: string; count: number; plays: PlayedScenario[] }>)

  if (isLoading) {
    return (
      <Card className="shadow-none border">
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground text-sm">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="shadow-none border"><CardContent className="pt-4 sm:pt-6 text-center"><div className="text-lg text-primary">{playedScenarios.length}</div><div className="text-xs text-muted-foreground mt-1">総プレイ回数</div></CardContent></Card>
        <Card className="shadow-none border"><CardContent className="pt-4 sm:pt-6 text-center"><div className="text-lg text-primary">{scenarioGroups.length}</div><div className="text-xs text-muted-foreground mt-1">プレイしたシナリオ</div></CardContent></Card>
        <Card className="shadow-none border"><CardContent className="pt-4 sm:pt-6 text-center"><div className="text-lg text-primary">{likedScenariosList.length}</div><div className="text-xs text-muted-foreground mt-1">いいねしたシナリオ</div></CardContent></Card>
      </div>

      {/* シナリオリスト */}
      <Card className="shadow-none border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Images className="h-4 w-4 sm:h-5 sm:w-5" />アルバム
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">過去の体験を追加</span>
                <span className="sm:hidden">追加</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>過去の体験を追加</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>シナリオ *</Label>
                  <SearchableSelect
                    options={scenarioOptions.map((s): SearchableSelectOption => ({ value: s.id, label: s.title }))}
                    value={newScenarioId} onValueChange={setNewScenarioId}
                    placeholder={optionsLoading ? '読み込み中...' : scenarioOptions.length === 0 ? 'シナリオがありません' : 'シナリオを選択'}
                    searchPlaceholder="シナリオを検索..." emptyText="シナリオが見つかりません"
                    disabled={optionsLoading || scenarioOptions.length === 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label>プレイした日付（任意）</Label>
                  <SingleDatePopover date={newPlayedAt} onDateChange={(date) => setNewPlayedAt(date || '')} placeholder="日付を選択" />
                </div>
                <div className="space-y-2">
                  <Label>店舗（任意）</Label>
                  <SearchableSelect
                    options={storeOptions.map((s): SearchableSelectOption => ({ value: s.id, label: s.name }))}
                    value={newStoreId} onValueChange={setNewStoreId}
                    placeholder={optionsLoading ? '読み込み中...' : storeOptions.length === 0 ? '店舗がありません' : '店舗を選択'}
                    searchPlaceholder="店舗を検索..." emptyText="店舗が見つかりません"
                    disabled={optionsLoading || storeOptions.length === 0} allowClear={true}
                  />
                </div>
                <div className="space-y-2">
                  <Label>おすすめ度（任意）</Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} type="button" onClick={() => setNewRating(newRating === star ? 0 : star)} className="p-0.5 focus:outline-none">
                        <Star className={`h-7 w-7 transition-colors ${star <= newRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 hover:text-yellow-300'}`} />
                      </button>
                    ))}
                    {newRating > 0 && <span className="text-xs text-muted-foreground ml-1">{newRating === 1 ? 'いまいち' : newRating === 2 ? 'まあまあ' : newRating === 3 ? '良かった' : newRating === 4 ? 'とても良かった' : '最高！'}</span>}
                  </div>
                </div>
                {newCharacterOptions.length > 0 && (
                  <div className="space-y-2">
                    <Label>自分の役（任意）</Label>
                    <SearchableSelect
                      options={newCharacterOptions.map((c): SearchableSelectOption => ({ value: c.id, label: c.name }))}
                      value={newCharacterId} onValueChange={setNewCharacterId}
                      placeholder="役を選択" searchPlaceholder="役を検索..." emptyText="役が見つかりません" allowClear={true}
                    />
                  </div>
                )}
                <Button onClick={handleAddManualHistory} disabled={addManualHistory.isPending || !newScenarioId} className="w-full">
                  {addManualHistory.isPending ? '追加中...' : '追加'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {scenarioGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>プレイ履歴がありません</p>
              <p className="mt-2 text-xs">「過去の体験を追加」から手動で登録できます</p>
            </div>
          ) : (
            <div className="space-y-4">
              {scenarioGroups.filter(group => !hiddenScenarios.has(group.scenario)).map((group, idx) => {
                const scenarioId = group.plays[0]?.scenario_id
                const isLiked = scenarioId ? likedScenarios.has(scenarioId) : false
                return (
                  <div key={idx} className={`border rounded-lg p-3 sm:p-4 hover:bg-muted/50 transition-colors ${scenarioId ? 'cursor-pointer' : ''}`}
                    onClick={() => scenarioId && navigate(`/scenario/${scenarioId}`)}>
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="flex-shrink-0 w-12 sm:w-16 h-16 sm:h-20 bg-gray-200 rounded overflow-hidden">
                        {group.plays[0]?.key_visual_url ? (
                          <OptimizedImage src={group.plays[0].key_visual_url} alt={group.scenario} className="w-full h-full object-cover" responsive={true} srcSetSizes={[48, 64, 128]} breakpoints={{ mobile: 48, tablet: 64, desktop: 128 }} useWebP={true} quality={85} fallback={<div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Image</div>} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Image</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0 pr-2"><h3 className="text-base break-words">{cleanTitle(group.scenario)}</h3></div>
                          <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" onClick={() => scenarioId && toggleLike.mutate({ scenarioId, isLiked })} className="hover:bg-yellow-50 h-8 w-8 sm:h-9 sm:w-9" title={isLiked ? '遊びたいリストから削除' : '遊びたいリストに追加'}>
                              <Star className={`h-4 w-4 sm:h-5 sm:w-5 ${isLiked ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleToggleHide(group.scenario)} className="hover:bg-gray-50 h-8 w-8 sm:h-9 sm:w-9" title="非表示にする">
                              <EyeOff className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {group.plays.map((play, playIdx) => (
                            <div key={playIdx} className="bg-muted/30 px-2.5 py-1.5 rounded flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs">
                              <div className="flex items-center gap-1 flex-shrink-0"><Calendar className="h-3 w-3 text-muted-foreground" /><span className="text-foreground whitespace-nowrap">{formatDate(play.date)}</span></div>
                              {play.venue && <div className="flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" /><span className="text-foreground truncate">{play.venue}</span></div>}
                              {play.author && <div className="flex items-center gap-1 flex-shrink-0 text-muted-foreground"><User className="h-3 w-3" /><span className="whitespace-nowrap">{play.author}</span></div>}
                              {play.gms.length > 0 && <div className="flex items-center gap-1 flex-shrink-0 text-muted-foreground"><span className="whitespace-nowrap">GM:</span>{play.gms.map((gm, gmIdx) => <Badge key={gmIdx} variant="outline" className="text-xs whitespace-nowrap px-1 py-0">{gm}</Badge>)}</div>}
                              {play.character_name && <div className="flex items-center gap-1 flex-shrink-0"><span className="text-muted-foreground">役:</span><span className="text-foreground whitespace-nowrap">{play.character_name}</span></div>}
                              <div className="flex items-center gap-1 ml-auto" onClick={e => e.stopPropagation()}>
                                {play.scenario_id && (
                                  <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-blue-50" onClick={() => { setEditCharacterPlay(play); setEditCharacterId(play.played_character_id || '') }} title="役を記録">
                                    <Pencil className="h-3 w-3 text-blue-400" />
                                  </Button>
                                )}
                                {play.is_manual && (
                                  <>
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">手動登録</Badge>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-red-50" onClick={() => {
                                      if (!play.manual_id) { showToast.error('この履歴は削除用のIDが付いていません。マイページを再読み込みしてください。'); return }
                                      if (confirm('この履歴を削除しますか？')) deleteManualHistory.mutate(play.manual_id)
                                    }} title="削除">
                                      <Trash2 className="h-3 w-3 text-red-400" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* いいねしたシナリオ */}
      <Card className="shadow-none border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400" />
            いいねしたシナリオ ({likedScenariosList.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {likedScenariosList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">いいねしたシナリオがありません</div>
          ) : (
            <div className="space-y-4">
              {likedScenariosList.map((item) => (
                <div key={item.id} className="border rounded-lg p-3 sm:p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/scenario/${item.scenario.slug || item.scenario.id}`)}>
                  <div className="flex items-start gap-3 sm:gap-4 mb-3">
                    <div className="flex-shrink-0 w-12 sm:w-16 h-16 sm:h-20 bg-gray-200 rounded overflow-hidden">
                      {item.scenario.key_visual_url ? (
                        <OptimizedImage src={item.scenario.key_visual_url} alt={item.scenario.title} className="w-full h-full object-cover" responsive={true} srcSetSizes={[48, 64, 128]} breakpoints={{ mobile: 48, tablet: 64, desktop: 128 }} useWebP={true} quality={85} fallback={<div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Image</div>} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Image</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base mb-1 truncate">{item.scenario.title}</h3>
                          <p className="text-xs text-muted-foreground mb-2">作者: {item.scenario.author}</p>
                          {item.scenario.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{item.scenario.description}</p>}
                        </div>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeLike.mutate(item.id) }} className="hover:bg-red-50 h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0" title="リストから削除">
                          <Star className="h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm mb-3">
                        <div className="flex items-center gap-1"><Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" /><span>{item.scenario.player_count_min === item.scenario.player_count_max ? `${item.scenario.player_count_max}人` : `${item.scenario.player_count_min}〜${item.scenario.player_count_max}人`}</span></div>
                        <div className="flex items-center gap-1"><Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" /><span>{item.scenario.duration}分</span></div>
                        {item.scenario.rating > 0 && <div className="flex items-center gap-1"><Star className="h-3 w-3 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400" /><span>{item.scenario.rating.toFixed(1)}</span></div>}
                        <Badge variant="secondary" className="text-xs">{getDifficultyLabel(item.scenario.difficulty)}</Badge>
                      </div>
                      {item.scenario.genre?.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{item.scenario.genre.map((g, idx) => <Badge key={idx} variant="outline" className="text-xs">{g}</Badge>)}</div>}
                      <div className="text-xs text-muted-foreground">追加日: {formatDate(item.created_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 非表示のシナリオ */}
      {hiddenScenarios.size > 0 && (
        <Card className="shadow-none border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <EyeOff className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              非表示のシナリオ ({hiddenScenarios.size})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scenarioGroups.filter(group => hiddenScenarios.has(group.scenario)).map((group, idx) => {
                const scenarioId = group.plays[0]?.scenario_id
                const isLiked = scenarioId ? likedScenarios.has(scenarioId) : false
                return (
                  <div key={idx} className="flex items-center justify-between p-3 border rounded-lg opacity-60">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm truncate">{group.scenario}</span>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">{group.count}回プレイ</Badge>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
                      <Button variant="ghost" size="icon" onClick={() => scenarioId && toggleLike.mutate({ scenarioId, isLiked })} className="hover:bg-yellow-50 h-8 w-8 sm:h-9 sm:w-9" title={isLiked ? '遊びたいリストから削除' : '遊びたいリストに追加'}>
                        <Star className={`h-4 w-4 sm:h-5 sm:w-5 ${isLiked ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleToggleHide(group.scenario)} className="text-xs sm:text-sm flex-shrink-0">表示する</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 配役編集ダイアログ */}
      <Dialog open={!!editCharacterPlay} onOpenChange={(open) => { if (!open) setEditCharacterPlay(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>自分の役を記録</DialogTitle></DialogHeader>
          {editCharacterPlay && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">{cleanTitle(editCharacterPlay.scenario)}</p>
              <div className="space-y-2">
                <Label>担当した役（任意）</Label>
                {editCharacterOptions.length > 0 ? (
                  <SearchableSelect
                    options={editCharacterOptions.map((c): SearchableSelectOption => ({ value: c.id, label: c.name }))}
                    value={editCharacterId} onValueChange={setEditCharacterId}
                    placeholder="役を選択" searchPlaceholder="役を検索..." emptyText="役が見つかりません" allowClear={true}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">このシナリオには役名リストが登録されていません</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditCharacterPlay(null)}>
                  <X className="h-4 w-4 mr-1" />キャンセル
                </Button>
                <Button className="flex-1" onClick={() => void handleSaveCharacter()} disabled={saveCharacter.isPending}>
                  {saveCharacter.isPending ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
