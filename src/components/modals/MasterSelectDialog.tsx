/**
 * マスタ選択ダイアログ
 * シナリオマスタから情報を引用するためのダイアログ
 */
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { Search, BookOpen, Check } from 'lucide-react'

interface ScenarioMaster {
  id: string
  title: string
  author: string | null
  key_visual_url: string | null
  description: string | null
  synopsis: string | null
  player_count_min: number
  player_count_max: number
  official_duration: number
  genre: string[]
  difficulty: string | null
  caution: string | null
  sensitive_tags: string[] | null
  required_items: string[] | null
  gallery_images: string[] | null
  master_status: string
}

interface MasterSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (master: ScenarioMaster) => void
}

export function MasterSelectDialog({
  open,
  onOpenChange,
  onSelect
}: MasterSelectDialogProps) {
  const [masters, setMasters] = useState<ScenarioMaster[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // マスタ一覧を取得
  useEffect(() => {
    const fetchMasters = async () => {
      if (!open) return
      
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('scenario_masters')
          .select('id, title, author, author_id, key_visual_url, gallery_images, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, sensitive_tags, required_items, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by')
          .in('master_status', ['approved', 'pending'])
          .order('title')
        
        if (error) throw error
        setMasters(data || [])
      } catch (err) {
        logger.error('Failed to fetch masters:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchMasters()
  }, [open])

  // フィルタされたマスタ一覧
  const filteredMasters = masters.filter(m => 
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.author && m.author.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleSelect = (master: ScenarioMaster) => {
    onSelect(master)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            マスタから引用
          </DialogTitle>
        </DialogHeader>

        {/* 検索 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="シナリオを検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* マスタ一覧 */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
          ) : filteredMasters.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>利用可能なシナリオマスタがありません</p>
            </div>
          ) : (
            filteredMasters.map(master => (
              <div
                key={master.id}
                onClick={() => handleSelect(master)}
                className="p-3 rounded-lg border cursor-pointer transition-colors bg-white hover:bg-gray-50 border-gray-200"
              >
                <div className="flex items-center gap-3">
                  {master.key_visual_url ? (
                    <img src={master.key_visual_url} alt="" className="w-16 h-12 object-cover rounded" />
                  ) : (
                    <div className="w-16 h-12 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                      No Img
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{master.title}</p>
                      {master.master_status === 'pending' && (
                        <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">申請中</Badge>
                      )}
                      {master.master_status === 'approved' && (
                        <Badge variant="default" className="text-xs bg-green-500">承認済</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {master.author || '作者不明'} ・ 
                      {master.player_count_min}〜{master.player_count_max}人 ・ 
                      {master.official_duration}分
                    </p>
                    {master.genre && master.genre.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {master.genre.slice(0, 3).map((g, i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 注意書き */}
        <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded-lg">
          <p>💡 マスタから引用すると、以下の情報がコピーされます：</p>
          <p className="mt-1">タイトル、作者、説明、人数、時間、難易度、ジャンル、注意事項、キービジュアル</p>
          <p className="mt-1">※ 引用後も各項目は自由に編集できます</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
