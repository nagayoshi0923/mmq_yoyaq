/**
 * シナリオマスタ編集ダイアログ
 * @purpose シナリオマスタの作成・編集
 * @access license_admin のみ
 * 
 * ScenarioEditDialogV2と同じスタイルを使用
 */
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { 
  Save, Plus, Trash2, Image as ImageIcon, FileText, Users, BookOpen, Settings, ChevronLeft, ChevronRight, Images, Upload, X, GripVertical
} from 'lucide-react'
import { uploadImage, validateMediaFile, uploadMedia } from '@/lib/uploadImage'
import { showToast } from '@/utils/toast'

interface ScenarioMaster {
  id: string
  title: string
  author: string | null
  author_email: string | null
  key_visual_url: string | null
  gallery_images: string[]  // ギャラリー画像のURL配列
  description: string | null
  synopsis: string | null
  player_count_min: number
  player_count_max: number
  official_duration: number
  genre: string[]
  difficulty: string | null
  caution: string | null
  required_items: string[] | null
  has_pre_reading: boolean
  release_date: string | null
  official_site_url: string | null
  master_status: 'draft' | 'pending' | 'approved' | 'rejected'
  rejection_reason: string | null
}

interface ScenarioCharacter {
  id: string
  name: string
  description: string | null
  image_url: string | null
  sort_order: number
  is_new?: boolean
}

interface ScenarioMasterEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  masterId: string | null
  onSaved: () => void
  /** ソートされたマスタIDリスト（矢印キーでの切り替えに使用） */
  sortedMasterIds?: string[]
  /** マスタ切り替え時のコールバック */
  onMasterChange?: (masterId: string | null) => void
}

// タブ定義（ScenarioEditDialogV2と同じ構造）
const TABS = [
  { id: 'basic', label: '基本情報', icon: FileText },
  { id: 'gallery', label: 'ギャラリー', icon: Images },
  { id: 'description', label: '説明', icon: BookOpen },
  { id: 'characters', label: 'キャラクター', icon: Users },
  { id: 'other', label: 'その他', icon: Settings },
] as const

type TabId = typeof TABS[number]['id']

const DEFAULT_MASTER: ScenarioMaster = {
  id: '',
  title: '',
  author: '',
  author_email: '',
  key_visual_url: '',
  gallery_images: [],
  description: '',
  synopsis: '',
  player_count_min: 8,
  player_count_max: 6,
  official_duration: 180,
  genre: [],
  difficulty: 'intermediate',
  caution: '',
  required_items: [],
  has_pre_reading: false,
  release_date: '',
  official_site_url: '',
  master_status: 'approved',
  rejection_reason: null
}

// localStorageからタブを取得する関数
const getSavedTab = (): TabId => {
  const saved = localStorage.getItem('scenarioMasterEditDialogTab')
  if (saved && TABS.some(t => t.id === saved)) {
    return saved as TabId
  }
  return 'basic'
}

export function ScenarioMasterEditDialog({ 
  open, 
  onOpenChange, 
  masterId, 
  onSaved,
  sortedMasterIds,
  onMasterChange
}: ScenarioMasterEditDialogProps) {
  const { user } = useAuth()
  const isNew = !masterId
  
  const [master, setMaster] = useState<ScenarioMaster>(DEFAULT_MASTER)
  const [characters, setCharacters] = useState<ScenarioCharacter[]>([])
  const [usingOrganizations, setUsingOrganizations] = useState<Array<{
    id: string
    organization_id: string
    organization_name: string
    org_status: string
  }>>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [genreInput, setGenreInput] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>(getSavedTab)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // マスタIDリスト（矢印キーでの切り替え用）
  const masterIdList = sortedMasterIds || []

  // ファイルアップロード処理（共通）
  const handleFilesUpload = async (files: File[]) => {
    if (files.length === 0 || uploading) return
    
    setUploading(true)
    setUploadProgress({ current: 0, total: files.length })
    
    let successCount = 0
    let firstImageUrl: string | null = null
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadProgress({ current: i + 1, total: files.length })
      
      const validation = validateMediaFile(file, 30, 100)
      if (!validation.valid) {
        showToast.error(validation.error || 'ファイルが無効です')
        continue
      }
      
      try {
        const result = await uploadMedia(file, 'key-visuals')
        if (result) {
          // 最初の画像（動画でない）をメインビジュアル候補として記録
          if (!firstImageUrl && result.type === 'image') {
            firstImageUrl = result.url
          }
          
          setMaster(prev => ({
            ...prev,
            gallery_images: [...(prev.gallery_images || []), result.url]
          }))
          successCount++
        }
      } catch (err) {
        logger.error('Gallery upload error:', err)
        showToast.error('ファイルのアップロードに失敗しました')
      }
    }
    
    // メインビジュアルが未設定で、画像がアップロードされた場合は自動設定
    if (firstImageUrl) {
      setMaster(prev => {
        if (!prev.key_visual_url) {
          return { ...prev, key_visual_url: firstImageUrl }
        }
        return prev
      })
    }
    
    setUploading(false)
    setUploadProgress({ current: 0, total: 0 })
    if (successCount > 0) {
      showToast.success(`${successCount}件のファイルをアップロードしました`)
    }
  }

  // ドラッグ＆ドロップハンドラ
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!uploading) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    if (uploading) return
    
    const files = Array.from(e.dataTransfer.files)
    await handleFilesUpload(files)
  }

  useEffect(() => {
    if (open) {
      setActiveTab(getSavedTab())
    }
  }, [open, masterId])

  // 矢印キーでマスタを切り替える
  useEffect(() => {
    if (!open || !onMasterChange || !masterId || masterIdList.length <= 1) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力フィールドにフォーカスがある場合は無視
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return
      }
      
      // contenteditable要素も無視
      if (target.isContentEditable) {
        return
      }

      const currentIndex = masterIdList.indexOf(masterId)

      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault()
        e.stopPropagation()
        onMasterChange(masterIdList[currentIndex - 1])
      } else if (e.key === 'ArrowRight' && currentIndex < masterIdList.length - 1) {
        e.preventDefault()
        e.stopPropagation()
        onMasterChange(masterIdList[currentIndex + 1])
      }
    }

    // captureフェーズで登録して、他のコンポーネントより先にキャッチ
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onMasterChange, masterId, masterIdList])

  useEffect(() => {
    if (open) {
      if (masterId) {
        fetchData()
      } else {
        setMaster(DEFAULT_MASTER)
        setCharacters([])
      }
    }
  }, [open, masterId])

  const fetchData = async () => {
    if (!masterId) return

    try {
      setLoading(true)

      const { data: masterData, error: masterError } = await supabase
        .from('scenario_masters')
        .select('*')
        .eq('id', masterId)
        .single()

      if (masterError || !masterData) {
        logger.error('Failed to fetch master:', masterError)
        toast.error('シナリオの読み込みに失敗しました')
        onOpenChange(false)
        return
      }

      setMaster({
        ...masterData,
        gallery_images: masterData.gallery_images || []
      })

      const { data: charData } = await supabase
        .from('scenario_characters')
        .select('*')
        .eq('scenario_master_id', masterId)
        .order('sort_order', { ascending: true })

      setCharacters(charData || [])

      // 使用している組織を取得
      const { data: orgData } = await supabase
        .from('organization_scenarios')
        .select(`
          id,
          organization_id,
          org_status,
          organizations(name)
        `)
        .eq('scenario_master_id', masterId)

      if (orgData) {
        setUsingOrganizations(orgData.map((item: any) => ({
          id: item.id,
          organization_id: item.organization_id,
          organization_name: item.organizations?.name || '不明',
          org_status: item.org_status || 'available'
        })))
      }
    } catch (err) {
      logger.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (statusOverride?: 'draft' | 'pending' | 'approved') => {
    if (!master.title.trim()) {
      toast.error('タイトルを入力してください')
      return
    }

    const newStatus = statusOverride || master.master_status

    try {
      setSaving(true)

      const saveData = {
        title: master.title,
        author: master.author || null,
        author_email: master.author_email || null,
        key_visual_url: master.key_visual_url || null,
        gallery_images: master.gallery_images || [],
        description: master.description || null,
        synopsis: master.synopsis || null,
        player_count_min: master.player_count_min,
        player_count_max: master.player_count_max,
        official_duration: master.official_duration,
        genre: master.genre || [],
        difficulty: master.difficulty || null,
        caution: master.caution || null,
        required_items: master.required_items || [],
        has_pre_reading: master.has_pre_reading,
        release_date: master.release_date || null,
        official_site_url: master.official_site_url || null,
        master_status: newStatus
      }

      if (isNew) {
        const { data, error } = await supabase
          .from('scenario_masters')
          .insert(saveData)
          .select()
          .single()

        if (error) throw error
        
        const statusMessage = newStatus === 'draft' ? '下書き保存しました' : 'シナリオマスタを作成しました'
        toast.success(statusMessage)
        onSaved()
        onOpenChange(false)
      } else {
        const { error } = await supabase
          .from('scenario_masters')
          .update(saveData)
          .eq('id', masterId)

        if (error) throw error

        // キャラクター保存
        for (const char of characters) {
          if (char.is_new) {
            const { id: _, is_new: __, ...charData } = char
            await supabase
              .from('scenario_characters')
              .insert({ ...charData, scenario_master_id: masterId })
          } else {
            const { is_new: _, ...charData } = char
            await supabase
              .from('scenario_characters')
              .update(charData)
              .eq('id', char.id)
          }
        }

        // ステータスを更新
        setMaster(prev => ({ ...prev, master_status: newStatus }))
        
        // 保存成功メッセージを表示（3秒後に消える）
        const statusMessage = newStatus === 'draft' ? '下書き保存しました' : '保存しました'
        setSaveMessage(statusMessage)
        setTimeout(() => setSaveMessage(null), 3000)
        onSaved()
      }
    } catch (err) {
      logger.error('Save error:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const addCharacter = () => {
    const newChar: ScenarioCharacter = {
      id: `new-${Date.now()}`,
      name: '',
      description: '',
      image_url: '',
      sort_order: characters.length,
      is_new: true
    }
    setCharacters([...characters, newChar])
  }

  const updateCharacter = (index: number, field: keyof ScenarioCharacter, value: any) => {
    const updated = [...characters]
    updated[index] = { ...updated[index], [field]: value }
    setCharacters(updated)
  }

  const removeCharacter = async (index: number) => {
    const char = characters[index]
    if (!char.is_new && masterId) {
      await supabase.from('scenario_characters').delete().eq('id', char.id)
    }
    setCharacters(characters.filter((_, i) => i !== index))
  }

  const addGenre = () => {
    if (genreInput.trim()) {
      setMaster({
        ...master,
        genre: [...(master.genre || []), genreInput.trim()]
      })
      setGenreInput('')
    }
  }

  const removeGenre = (index: number) => {
    setMaster({
      ...master,
      genre: master.genre.filter((_, i) => i !== index)
    })
  }

  // タブコンテンツをレンダリング
  const renderTabContent = (tabId: TabId) => {
    switch (tabId) {
      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">タイトル *</Label>
              <Input
                id="title"
                value={master.title}
                onChange={(e) => setMaster({ ...master, title: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="author">作者</Label>
                <Input
                  id="author"
                  value={master.author || ''}
                  onChange={(e) => setMaster({ ...master, author: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="author_email">作者メール</Label>
                <Input
                  id="author_email"
                  type="email"
                  value={master.author_email || ''}
                  onChange={(e) => setMaster({ ...master, author_email: e.target.value })}
                />
              </div>
            </div>

            {/* メインビジュアルはギャラリータブで設定 */}
            {master.key_visual_url && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <img src={master.key_visual_url} alt="メインビジュアル" className="w-16 h-12 object-cover rounded" />
                <div>
                  <p className="text-xs text-gray-500">メインビジュアル設定済み</p>
                  <p className="text-xs text-gray-400">変更はギャラリータブから</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="player_count_min">最小人数</Label>
                <Input
                  id="player_count_min"
                  type="number"
                  value={master.player_count_min}
                  onChange={(e) => setMaster({ ...master, player_count_min: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <Label htmlFor="player_count_max">最大人数</Label>
                <Input
                  id="player_count_max"
                  type="number"
                  value={master.player_count_max}
                  onChange={(e) => setMaster({ ...master, player_count_max: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <Label htmlFor="official_duration">公演時間(分)</Label>
                <Input
                  id="official_duration"
                  type="number"
                  value={master.official_duration}
                  onChange={(e) => setMaster({ ...master, official_duration: parseInt(e.target.value) || 180 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="difficulty">難易度</Label>
                <Select
                  value={master.difficulty || ''}
                  onValueChange={(v) => setMaster({ ...master, difficulty: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="難易度を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">初心者向け</SelectItem>
                    <SelectItem value="intermediate">中級者向け</SelectItem>
                    <SelectItem value="advanced">上級者向け</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="master_status">ステータス</Label>
                <Select
                  value={master.master_status}
                  onValueChange={(v) => setMaster({ ...master, master_status: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">下書き</SelectItem>
                    <SelectItem value="pending">承認待ち</SelectItem>
                    <SelectItem value="approved">承認済み</SelectItem>
                    <SelectItem value="rejected">却下</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>ジャンル</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={genreInput}
                  onChange={(e) => setGenreInput(e.target.value)}
                  placeholder="ジャンルを追加..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGenre())}
                />
                <Button type="button" onClick={addGenre} variant="outline">追加</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {master.genre?.map((g, i) => (
                  <Badge key={i} variant="secondary" className="flex items-center gap-1">
                    {g}
                    <button onClick={() => removeGenre(i)} className="ml-1 hover:text-red-500">×</button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )

      case 'gallery':
        return (
          <div 
            className="space-y-4"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">ギャラリー画像</p>
                <p className="text-xs text-gray-500">画像・動画をドラッグ＆ドロップ、または下のボタンから追加</p>
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm,video/quicktime"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const files = e.target.files
                    if (!files) return
                    await handleFilesUpload(Array.from(files))
                    e.target.value = ''
                  }}
                />
                <div className={`flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <Upload className="w-4 h-4" />
                  {uploading ? `アップロード中... (${uploadProgress.current}/${uploadProgress.total})` : '画像・動画を追加'}
                </div>
              </label>
            </div>

            {/* ドラッグオーバー時のオーバーレイ */}
            {isDragging && (
              <div className="fixed inset-0 bg-primary/10 z-50 flex items-center justify-center pointer-events-none">
                <div className="bg-white rounded-xl shadow-2xl p-8 border-2 border-dashed border-primary">
                  <Upload className="w-12 h-12 mx-auto text-primary mb-3" />
                  <p className="text-lg font-medium text-primary">ここにドロップしてアップロード</p>
                </div>
              </div>
            )}

            {(!master.gallery_images || master.gallery_images.length === 0) ? (
              <label className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors block ${isDragging ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm,video/quicktime"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const files = e.target.files
                    if (!files) return
                    await handleFilesUpload(Array.from(files))
                    e.target.value = ''
                  }}
                />
                <Images className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm">ギャラリー画像がありません</p>
                <p className="text-gray-400 text-xs mt-1">クリックまたはドラッグ＆ドロップで追加</p>
              </label>
            ) : (
              <div className="space-y-4">
                {/* アップロード中のプログレス */}
                {uploading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                      <span className="text-sm font-medium text-blue-800">
                        アップロード中... ({uploadProgress.current}/{uploadProgress.total})
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* スライドプレビュー */}
                <div className="relative bg-gray-100 rounded-lg overflow-hidden">
                  <div className="flex overflow-x-auto gap-2 p-4 snap-x snap-mandatory">
                    {master.gallery_images.map((url, index) => {
                      const isMV = master.key_visual_url === url
                      const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url)
                      return (
                        <div 
                          key={index} 
                          className={`relative flex-shrink-0 snap-center group ${isMV ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                          style={{ width: '200px', height: '150px' }}
                        >
                          {isVideo ? (
                            <video 
                              src={url}
                              className="w-full h-full object-cover rounded-lg"
                              muted
                              loop
                              playsInline
                              onMouseEnter={(e) => e.currentTarget.play()}
                              onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
                            />
                          ) : (
                            <img 
                              src={url} 
                              alt={`ギャラリー ${index + 1}`}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          )}
                          {/* 動画バッジ */}
                          {isVideo && (
                            <div className="absolute top-2 right-10 bg-black/70 text-white text-xs px-2 py-0.5 rounded font-medium">
                              動画
                            </div>
                          )}
                          {/* メインビジュアルバッジ */}
                          {isMV && (
                            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded font-medium">
                              メイン
                            </div>
                          )}
                          {/* メインビジュアルに設定ボタン（動画は不可） */}
                          {!isMV && !isVideo && (
                            <button
                              type="button"
                              onClick={() => {
                                setMaster(prev => ({ ...prev, key_visual_url: url }))
                                showToast.success('メインビジュアルに設定しました')
                              }}
                              className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary"
                            >
                              メインに設定
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setMaster(prev => ({
                                ...prev,
                                gallery_images: prev.gallery_images.filter((_, i) => i !== index),
                                // メインビジュアルだった場合はクリア
                                key_visual_url: prev.key_visual_url === url ? '' : prev.key_visual_url
                              }))
                            }}
                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            title="削除"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
                            {index + 1} / {master.gallery_images.length}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 画像一覧（並び替え可能） */}
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">画像をクリックでメインビジュアルに設定できます</p>
                  {master.gallery_images.map((url, index) => {
                    const isMV = master.key_visual_url === url
                    const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url)
                    return (
                      <div 
                        key={index}
                        className={`flex items-center gap-3 p-2 rounded-lg border ${isMV ? 'bg-primary/5 border-primary' : 'bg-gray-50'}`}
                      >
                        <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                        <div className="w-16 h-12 flex-shrink-0 bg-gray-200 rounded overflow-hidden relative">
                          {isVideo ? (
                            <video src={url} className="w-full h-full object-cover" muted />
                          ) : (
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          )}
                          {isVideo && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <span className="text-white text-xs">▶</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          {isMV && (
                            <Badge variant="default" className="text-xs shrink-0">メイン</Badge>
                          )}
                          {isVideo && (
                            <Badge variant="secondary" className="text-xs shrink-0">動画</Badge>
                          )}
                          <p className="text-sm text-gray-600 truncate">{url}</p>
                        </div>
                        {!isMV && !isVideo && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMaster(prev => ({ ...prev, key_visual_url: url }))
                              showToast.success('メインビジュアルに設定しました')
                            }}
                            className="text-xs shrink-0"
                          >
                            メインに設定
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setMaster(prev => ({
                              ...prev,
                              gallery_images: prev.gallery_images.filter((_, i) => i !== index),
                              key_visual_url: prev.key_visual_url === url ? '' : prev.key_visual_url
                            }))
                          }}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* URL直接入力 */}
            <div className="pt-4 border-t">
              <Label>URLで追加</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="https://..."
                  id="gallery-url-input"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const input = document.getElementById('gallery-url-input') as HTMLInputElement
                    if (input && input.value.trim()) {
                      setMaster(prev => ({
                        ...prev,
                        gallery_images: [...(prev.gallery_images || []), input.value.trim()]
                      }))
                      input.value = ''
                    }
                  }}
                >
                  追加
                </Button>
              </div>
            </div>
          </div>
        )

      case 'description':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="description">概要（短い説明）</Label>
              <Textarea
                id="description"
                value={master.description || ''}
                onChange={(e) => setMaster({ ...master, description: e.target.value })}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="synopsis">あらすじ（詳細）</Label>
              <Textarea
                id="synopsis"
                value={master.synopsis || ''}
                onChange={(e) => setMaster({ ...master, synopsis: e.target.value })}
                rows={8}
              />
            </div>

            <div>
              <Label htmlFor="caution">注意事項</Label>
              <Textarea
                id="caution"
                value={master.caution || ''}
                onChange={(e) => setMaster({ ...master, caution: e.target.value })}
                rows={3}
                placeholder="苦手要素、年齢制限など..."
              />
            </div>
          </div>
        )

      case 'characters':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">キャラクター訴求画像を管理します</p>
              <Button variant="outline" size="sm" onClick={addCharacter}>
                <Plus className="w-4 h-4 mr-2" />
                追加
              </Button>
            </div>

            {characters.length === 0 ? (
              <p className="text-gray-500 text-center py-8">キャラクターがありません</p>
            ) : (
              <div className="space-y-4">
                {characters.map((char, index) => (
                  <div key={char.id} className="flex gap-4 p-4 border rounded-lg">
                    <div className="w-20 h-28 flex-shrink-0">
                      {char.image_url ? (
                        <img
                          src={char.image_url}
                          alt={char.name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input
                        value={char.name}
                        onChange={(e) => updateCharacter(index, 'name', e.target.value)}
                        placeholder="キャラクター名"
                      />
                      <Input
                        value={char.image_url || ''}
                        onChange={(e) => updateCharacter(index, 'image_url', e.target.value)}
                        placeholder="画像URL"
                      />
                      <Textarea
                        value={char.description || ''}
                        onChange={(e) => updateCharacter(index, 'description', e.target.value)}
                        placeholder="説明（ネタバレなし）"
                        rows={2}
                      />
                    </div>
                    <button
                      onClick={() => removeCharacter(index)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case 'other':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="official_site_url">公式サイトURL</Label>
              <Input
                id="official_site_url"
                value={master.official_site_url || ''}
                onChange={(e) => setMaster({ ...master, official_site_url: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="release_date">リリース日</Label>
              <Input
                id="release_date"
                type="date"
                value={master.release_date || ''}
                onChange={(e) => setMaster({ ...master, release_date: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="has_pre_reading"
                checked={master.has_pre_reading}
                onChange={(e) => setMaster({ ...master, has_pre_reading: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="has_pre_reading">事前読み込みあり</Label>
            </div>

            {/* 使用している組織リスト */}
            {!isNew && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-3">
                  <Label>使用している組織</Label>
                  <Badge variant="secondary">{usingOrganizations.length}組織</Badge>
                </div>
                {usingOrganizations.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded-lg">
                    このシナリオを使用している組織はありません
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {usingOrganizations.map((org) => (
                      <div 
                        key={org.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                      >
                        <span className="font-medium text-sm">{org.organization_name}</span>
                        <Badge 
                          variant={org.org_status === 'available' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {org.org_status === 'available' ? '公開中' : 
                           org.org_status === 'unavailable' ? '非公開' : 
                           org.org_status === 'coming_soon' ? '近日公開' : org.org_status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-w-[95vw] sm:max-w-4xl h-[90vh] sm:h-[min(85vh,750px)] p-0 flex flex-col overflow-hidden [&>button]:z-10">
        <DialogHeader className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 pb-0 shrink-0">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <DialogTitle className="text-base sm:text-xl shrink-0">
              {isNew ? '新規シナリオマスタ' : 'シナリオマスタ編集'}
            </DialogTitle>
            {/* マスタ切り替え */}
            {onMasterChange && masterId && masterIdList.length > 1 && (
              <div className="flex items-center gap-1 flex-1 max-w-md">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    const currentIndex = masterIdList.indexOf(masterId)
                    if (currentIndex > 0) {
                      onMasterChange(masterIdList[currentIndex - 1])
                    }
                  }}
                  disabled={masterIdList.indexOf(masterId) === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select
                  value={masterId}
                  onValueChange={(value) => onMasterChange(value)}
                >
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue placeholder="マスタを選択" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value={masterId}>{master.title || '(タイトル未設定)'}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    const currentIndex = masterIdList.indexOf(masterId)
                    if (currentIndex < masterIdList.length - 1) {
                      onMasterChange(masterIdList[currentIndex + 1])
                    }
                  }}
                  disabled={masterIdList.indexOf(masterId) === masterIdList.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <DialogDescription className="text-xs sm:text-sm">
            {master.title ? `${master.title}の情報を編集します` : 'シナリオマスタの情報を入力してください'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* タブナビゲーション */}
            <Tabs 
              value={activeTab} 
              onValueChange={(v) => {
                setActiveTab(v as TabId)
                localStorage.setItem('scenarioMasterEditDialogTab', v)
              }} 
              className="flex-1 flex flex-col overflow-hidden"
              onKeyDown={(e) => {
                // 矢印キーでのタブ切り替えを無効化（マスタ切り替えに使用するため）
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  e.stopPropagation()
                }
              }}
            >
              <div className="px-4 sm:px-6 pt-4 shrink-0 border-b">
                <TabsList 
                  className="w-full h-auto flex flex-wrap gap-1 bg-transparent p-0 justify-start"
                  onKeyDown={(e) => {
                    // 矢印キーでのタブ切り替えを無効化（マスタ切り替えに使用するため）
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault()
                      e.stopPropagation()
                    }
                  }}
                >
                  {TABS.map((tab) => {
                    // 新規作成時はキャラクタータブを非表示
                    if (tab.id === 'characters' && isNew) return null
                    
                    const Icon = tab.icon
                    return (
                      <TabsTrigger
                        key={tab.id}
                        value={tab.id}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                            e.preventDefault()
                            e.stopPropagation()
                          }
                        }}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </div>

              {/* タブコンテンツ */}
              <div className="flex-1 overflow-y-auto">
                {TABS.map((tab) => (
                  <TabsContent
                    key={tab.id}
                    value={tab.id}
                    className="m-0 p-4 sm:p-6 focus-visible:outline-none focus-visible:ring-0"
                  >
                    {renderTabContent(tab.id)}
                  </TabsContent>
                ))}
              </div>
            </Tabs>

            {/* フッター（固定） */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-3 sm:px-4 md:px-6 py-2 sm:py-3 border-t bg-muted/30 shrink-0">
              {/* 現在の設定サマリー（小さい画面では非表示） */}
              <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="font-medium text-foreground truncate max-w-[120px]">
                  {master.title || '(タイトル未設定)'}
                </span>
                <span className="text-muted-foreground/50">|</span>
                <span>{master.official_duration}分</span>
                <span className="text-muted-foreground/50">|</span>
                <span>
                  {master.player_count_min === master.player_count_max 
                    ? `${master.player_count_min}人`
                    : `${master.player_count_min}〜${master.player_count_max}人`
                  }
                </span>
                <span className="text-muted-foreground/50">|</span>
                <Badge variant={master.master_status === 'approved' ? 'default' : 'secondary'} className="text-xs">
                  {master.master_status === 'draft' ? '下書き' : 
                   master.master_status === 'pending' ? '承認待ち' : 
                   master.master_status === 'approved' ? '承認済み' : '却下'}
                </Badge>
              </div>

              {/* アクションボタン */}
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                {/* ステータスバッジ */}
                {master.master_status === 'draft' && (
                  <Badge variant="secondary" className="text-[10px] sm:text-xs">下書き</Badge>
                )}
                {master.master_status === 'pending' && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs border-yellow-500 text-yellow-600">申請中</Badge>
                )}
                {master.master_status === 'approved' && (
                  <Badge variant="default" className="text-[10px] sm:text-xs bg-green-500">承認済</Badge>
                )}
                {saveMessage && (
                  <span className="text-green-600 font-medium text-xs sm:text-sm animate-pulse">
                    ✓ {saveMessage}
                  </span>
                )}
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="text-xs sm:text-sm h-8 sm:h-10">
                  閉じる
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleSave('draft')} 
                  disabled={saving}
                  className="text-gray-600 text-xs sm:text-sm h-8 sm:h-10 hidden sm:inline-flex"
                >
                  下書き保存
                </Button>
                <Button onClick={() => handleSave()} disabled={saving} className="w-16 sm:w-24 text-xs sm:text-sm h-8 sm:h-10">
                  <Save className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  保存
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
