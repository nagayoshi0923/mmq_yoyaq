/**
 * シナリオマスタ編集ダイアログ
 * @purpose シナリオマスタの作成・編集
 * @access license_admin のみ
 * 
 * ScenarioEditDialogV2と同じスタイルを使用
 */
import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import './ScenarioEditDialogV2.css'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { validateMediaFile, uploadMedia } from '@/lib/uploadImage'
import { showToast } from '@/utils/toast'
import { ScenarioMasterTabContent } from './ScenarioMasterEditDialog/ScenarioMasterTabContent'

export interface ScenarioMaster {
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

export interface ScenarioCharacter {
  id: string
  scenario_master_id?: string
  name: string
  description: string | null
  image_url: string | null
  url?: string | null
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
  { id: 'basic', label: '基本情報' },
  { id: 'gallery', label: 'ギャラリー' },
  { id: 'description', label: '説明' },
  { id: 'characters', label: 'キャラクター' },
  { id: 'other', label: 'その他' },
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
  const masterIdList = useMemo(() => sortedMasterIds || [], [sortedMasterIds])

  // 新規作成時はキャラクタータブを出さない
  const visibleTabs = useMemo(
    () => TABS.filter((tab) => !(tab.id === 'characters' && isNew)),
    [isNew]
  )
  const currentTab: TabId = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : 'basic'

  const selectTab = (id: TabId) => {
    setActiveTab(id)
    localStorage.setItem('scenarioMasterEditDialogTab', id)
  }

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
    e.dataTransfer.dropEffect = 'copy'
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
    const droppedFiles = files.length > 0
      ? files
      : Array.from(e.dataTransfer.items)
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)
    await handleFilesUpload(droppedFiles)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, masterId])

  const fetchData = async () => {
    if (!masterId) return

    try {
      setLoading(true)

      const { data: masterData, error: masterError } = await supabase
        .from('scenario_masters')
        .select('id, title, author, author_id, author_email, key_visual_url, gallery_images, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, required_items, has_pre_reading, release_date, official_site_url, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by')
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
        author_email: masterData.author_email ?? null,
        gallery_images: masterData.gallery_images || [],
        has_pre_reading: masterData.has_pre_reading ?? false,
        release_date: masterData.release_date ?? null,
        official_site_url: masterData.official_site_url ?? null,
      })

      const { data: charData } = await supabase
        .from('scenario_characters')
        .select('id, scenario_master_id, name, description, image_url, sort_order')
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
      url: '',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        overlayClassName="scenario-edit-dialog-overlay"
        className="scenario-edit-dialog-host [&>button]:hidden"
      >
        <DialogTitle className="sr-only">
          {isNew ? '新規シナリオマスタ' : 'シナリオマスタ編集'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {master.title ? `${master.title}の情報を編集します` : 'シナリオマスタの情報を入力してください'}
        </DialogDescription>

        <header className="scenario-edit-dialog__header">
          <div className="scenario-edit-dialog__header-left">
            <span className="scenario-edit-dialog__title">
              {isNew ? '新規シナリオマスタ' : 'シナリオマスタ編集'}
            </span>
            {/* マスタ切り替え */}
            {onMasterChange && masterId && masterIdList.length > 1 ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
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
                  <SelectTrigger className="scenario-edit-dialog__scenario">
                    <SelectValue placeholder="マスタを選択" />
                  </SelectTrigger>
                  <SelectContent className="scenario-edit-dialog__scenario-menu">
                    <SelectItem value={masterId}>{master.title || '(タイトル未設定)'}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
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
              </>
            ) : master.title ? (
              <span className="scenario-edit-dialog__scenario">{master.title}</span>
            ) : null}
          </div>
          <button type="button" className="scenario-edit-dialog__close" onClick={() => onOpenChange(false)}>
            閉じる
          </button>
        </header>

        {loading ? (
          <div className="scenario-edit-dialog__body">
            <div className="scenario-edit-dialog__content items-center justify-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          </div>
        ) : (
          <>
            <div className="scenario-edit-dialog__body">
              <nav className="scenario-edit-dialog__nav" aria-label="シナリオマスタ編集セクション">
                {visibleTabs.map((tab) => {
                  const selected = currentTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => selectTab(tab.id)}
                      aria-current={selected ? 'page' : undefined}
                      className={selected ? 'scenario-edit-dialog__nav-item is-selected' : 'scenario-edit-dialog__nav-item'}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </nav>

              <div key={currentTab} className="scenario-edit-dialog__content">
                <h2 className="scenario-edit-dialog__page-title">
                  {visibleTabs.find((tab) => tab.id === currentTab)?.label}
                </h2>
                <ScenarioMasterTabContent
                  tabId={currentTab}
                  master={master}
                  setMaster={setMaster}
                  genreInput={genreInput}
                  setGenreInput={setGenreInput}
                  isDragging={isDragging}
                  uploading={uploading}
                  uploadProgress={uploadProgress}
                  isNew={isNew}
                  characters={characters}
                  usingOrganizations={usingOrganizations}
                  addGenre={addGenre}
                  removeGenre={removeGenre}
                  addCharacter={addCharacter}
                  updateCharacter={updateCharacter}
                  removeCharacter={removeCharacter}
                  handleFilesUpload={handleFilesUpload}
                  handleDragOver={handleDragOver}
                  handleDragLeave={handleDragLeave}
                  handleDrop={handleDrop}
                />
              </div>
            </div>

            <footer className="scenario-edit-dialog__footer">
              <div className="scenario-edit-dialog__meta">
                <span>{master.title || '(タイトル未設定)'}</span>
                <span className="scenario-edit-dialog__meta-sep">|</span>
                <span>{master.official_duration}分</span>
                <span className="scenario-edit-dialog__meta-sep">|</span>
                <span>
                  {master.player_count_min === master.player_count_max 
                    ? `${master.player_count_min}人`
                    : `${master.player_count_min}〜${master.player_count_max}人`
                  }
                </span>
              </div>

              <div className="scenario-edit-dialog__actions">
                {/* ステータス表示 */}
                {master.master_status === 'draft' && (
                  <span className="scenario-edit-dialog__status is-draft">下書き</span>
                )}
                {master.master_status === 'pending' && (
                  <span className="scenario-edit-dialog__status is-private">申請中</span>
                )}
                {master.master_status === 'approved' && (
                  <span className="scenario-edit-dialog__status is-public">承認済</span>
                )}
                {master.master_status === 'rejected' && (
                  <span className="scenario-edit-dialog__status is-private">却下</span>
                )}
                {saveMessage && (
                  <span className="scenario-edit-dialog__status is-public">{saveMessage}</span>
                )}
                <button
                  type="button"
                  className="scenario-edit-dialog__btn"
                  onClick={() => onOpenChange(false)}
                >
                  閉じる
                </button>
                <button
                  type="button"
                  className="scenario-edit-dialog__btn"
                  onClick={() => handleSave('draft')}
                  disabled={saving}
                >
                  下書き保存
                </button>
                <button
                  type="button"
                  className="scenario-edit-dialog__btn-primary"
                  onClick={() => handleSave()}
                  disabled={saving}
                >
                  保存
                </button>
              </div>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
