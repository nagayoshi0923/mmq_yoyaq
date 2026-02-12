/**
 * マスタからシナリオを追加するダイアログ
 * @purpose シナリオマスタを検索し、組織シナリオとして追加する
 */
import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { 
  Search, Plus, Clock, Users, CheckCircle, Image as ImageIcon
} from 'lucide-react'

interface ScenarioMaster {
  id: string
  title: string
  author: string | null
  key_visual_url: string | null
  player_count_min: number
  player_count_max: number
  official_duration: number
  genre: string[]
  master_status: 'draft' | 'pending' | 'approved' | 'rejected'
}

interface AddFromMasterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
  /** 既に組織に追加済みのマスタIDリスト */
  existingMasterIds?: string[]
}

export function AddFromMasterDialog({ 
  open, 
  onOpenChange, 
  onAdded,
  existingMasterIds = []
}: AddFromMasterDialogProps) {
  const [masters, setMasters] = useState<ScenarioMaster[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [adding, setAdding] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetchMasters()
    }
  }, [open])

  const fetchMasters = async () => {
    try {
      setLoading(true)
      
      // pending または approved のマスタを取得（他組織も利用可能）
      const { data, error } = await supabase
        .from('scenario_masters')
        .select('id, title, author, author_id, key_visual_url, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, required_items, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by')
        .in('master_status', ['pending', 'approved'])
        .order('title', { ascending: true })

      if (error) {
        logger.error('Failed to fetch masters:', error)
        toast.error('マスタの取得に失敗しました')
        return
      }

      setMasters(data || [])
    } catch (err) {
      logger.error('Error fetching masters:', err)
    } finally {
      setLoading(false)
    }
  }

  // フィルタリング
  const filteredMasters = useMemo(() => {
    if (!searchTerm) return masters
    const term = searchTerm.toLowerCase()
    return masters.filter(m => 
      m.title.toLowerCase().includes(term) ||
      (m.author && m.author.toLowerCase().includes(term)) ||
      m.genre?.some(g => g.toLowerCase().includes(term))
    )
  }, [masters, searchTerm])

  // 組織に追加済みかどうか
  const isAlreadyAdded = (masterId: string) => existingMasterIds.includes(masterId)

  // マスタを組織シナリオとして追加
  const handleAdd = async (master: ScenarioMaster) => {
    try {
      setAdding(master.id)
      
      const organizationId = await getCurrentOrganizationId()
      if (!organizationId) {
        toast.error('組織情報が取得できません')
        return
      }

      // organization_scenarios に追加
      const { error } = await supabase
        .from('organization_scenarios')
        .insert({
          organization_id: organizationId,
          scenario_master_id: master.id,
          duration: master.official_duration,
          org_status: 'coming_soon'  // 初期状態は「近日公開」
        })

      if (error) {
        if (error.code === '23505') {
          toast.error('このシナリオは既に追加されています')
        } else {
          logger.error('Failed to add scenario:', error)
          toast.error('追加に失敗しました')
        }
        return
      }

      toast.success(`「${master.title}」を追加しました`)
      onAdded()
    } catch (err) {
      logger.error('Error adding scenario:', err)
      toast.error('追加に失敗しました')
    } finally {
      setAdding(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>マスタからシナリオを追加</DialogTitle>
          <DialogDescription>
            共通マスタから自組織で公演するシナリオを選んで追加します
          </DialogDescription>
        </DialogHeader>

        {/* 検索 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="タイトル、作者、ジャンルで検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* マスタ一覧 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
            </div>
          ) : filteredMasters.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchTerm ? '検索条件に一致するシナリオがありません' : 'シナリオマスタがありません'}
            </div>
          ) : (
            <div className="space-y-2 pr-2">
              {filteredMasters.map((master) => {
                const alreadyAdded = isAlreadyAdded(master.id)
                const isAdding = adding === master.id

                return (
                  <div 
                    key={master.id}
                    className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                      alreadyAdded ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* サムネイル */}
                    <div className="w-16 h-20 flex-shrink-0 bg-gray-100 rounded overflow-hidden border">
                      {master.key_visual_url ? (
                        <img
                          src={master.key_visual_url}
                          alt={master.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* 情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 truncate">{master.title}</h3>
                        {master.master_status === 'approved' && (
                          <Badge variant="default" className="text-xs bg-green-100 text-green-700">
                            承認済
                          </Badge>
                        )}
                        {master.master_status === 'pending' && (
                          <Badge variant="secondary" className="text-xs">
                            申請中
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">作: {master.author || '不明'}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {master.player_count_min === master.player_count_max
                            ? `${master.player_count_min}人`
                            : `${master.player_count_min}〜${master.player_count_max}人`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {Math.floor(master.official_duration / 60)}時間
                          {master.official_duration % 60 > 0 && `${master.official_duration % 60}分`}
                        </span>
                        {master.genre && master.genre.length > 0 && (
                          <span className="flex items-center gap-1">
                            {master.genre.slice(0, 2).map((g, i) => (
                              <Badge key={i} variant="outline" className="text-xs py-0">
                                {g}
                              </Badge>
                            ))}
                            {master.genre.length > 2 && (
                              <span className="text-gray-400">+{master.genre.length - 2}</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 追加ボタン */}
                    <div className="flex-shrink-0">
                      {alreadyAdded ? (
                        <Button variant="ghost" size="sm" disabled className="text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          追加済み
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleAdd(master)}
                          disabled={isAdding}
                        >
                          {isAdding ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-1" />
                              追加
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-between items-center pt-4 border-t">
          <p className="text-sm text-gray-500">
            {filteredMasters.length}件のマスタ
            {existingMasterIds.length > 0 && ` (${existingMasterIds.length}件追加済み)`}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}




