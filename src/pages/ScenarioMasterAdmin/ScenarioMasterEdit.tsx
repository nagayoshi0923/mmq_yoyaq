/**
 * シナリオマスタ編集ページ
 * @path /admin/scenario-masters/:id
 * @purpose シナリオマスタの詳細編集・キャラクター管理
 * @access license_admin のみ
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { 
  ArrowLeft, Save, Plus, Trash2, GripVertical, CheckCircle, XCircle,
  Image as ImageIcon
} from 'lucide-react'

interface ScenarioMaster {
  id: string
  title: string
  author: string | null
  author_email: string | null
  key_visual_url: string | null
  description: string | null
  synopsis: string | null
  player_count_min: number
  player_count_max: number
  official_duration: number
  weekend_duration: number | null // 土日・祝日の公演時間（分）
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

interface CorrectionRequest {
  id: string
  field_name: string
  current_value: string | null
  suggested_value: string
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  requested_by_organization_id: string
  organization_name?: string
  created_at: string
}

export function ScenarioMasterEdit() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const isNew = id === 'new'
  
  const [master, setMaster] = useState<ScenarioMaster | null>(null)
  const [characters, setCharacters] = useState<ScenarioCharacter[]>([])
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [genreInput, setGenreInput] = useState('')

  const isLicenseAdmin = user?.role === 'license_admin'

  const fetchData = useCallback(async () => {
    if (!id || isNew) return

    try {
      setLoading(true)

      // マスタ情報取得
      const { data: masterData, error: masterError } = await supabase
        .from('scenario_masters')
        .select('*')
        .eq('id', id)
        .single()

      if (masterError || !masterData) {
        logger.error('Failed to fetch master:', masterError)
        toast.error('シナリオの読み込みに失敗しました')
        navigate('/admin/scenario-masters')
        return
      }

      setMaster(masterData)

      // キャラクター取得
      const { data: charData } = await supabase
        .from('scenario_characters')
        .select('*')
        .eq('scenario_master_id', id)
        .order('sort_order', { ascending: true })

      setCharacters(charData || [])

      // 修正リクエスト取得
      const { data: correctionData } = await supabase
        .from('scenario_master_corrections')
        .select(`
          *,
          organizations:requested_by_organization_id (name)
        `)
        .eq('scenario_master_id', id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      setCorrections(
        (correctionData || []).map((c: any) => ({
          ...c,
          organization_name: c.organizations?.name
        }))
      )
    } catch (err) {
      logger.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }, [id, isNew, navigate])

  useEffect(() => {
    if (isLicenseAdmin) {
      if (isNew) {
        setMaster({
          id: '',
          title: '',
          author: '',
          author_email: '',
          key_visual_url: '',
          description: '',
          synopsis: '',
          player_count_min: 8,
          player_count_max: 6,
          official_duration: 180,
          weekend_duration: null,
          genre: [],
          difficulty: 'intermediate',
          caution: '',
          required_items: [],
          has_pre_reading: false,
          release_date: '',
          official_site_url: '',
          master_status: 'draft',
          rejection_reason: null
        })
      } else {
        fetchData()
      }
    }
  }, [fetchData, isLicenseAdmin, isNew])

  const handleSave = async () => {
    if (!master) return

    try {
      setSaving(true)

      const saveData = {
        title: master.title,
        author: master.author || null,
        author_email: master.author_email || null,
        key_visual_url: master.key_visual_url || null,
        description: master.description || null,
        synopsis: master.synopsis || null,
        player_count_min: master.player_count_min,
        player_count_max: master.player_count_max,
        official_duration: master.official_duration,
        weekend_duration: master.weekend_duration || null,
        genre: master.genre || [],
        difficulty: master.difficulty || null,
        caution: master.caution || null,
        required_items: master.required_items || [],
        has_pre_reading: master.has_pre_reading,
        release_date: master.release_date || null,
        official_site_url: master.official_site_url || null,
        master_status: master.master_status
      }

      if (isNew) {
        const { data, error } = await supabase
          .from('scenario_masters')
          .insert(saveData)
          .select()
          .single()

        if (error) throw error

        toast.success('シナリオマスタを作成しました')
        navigate(`/admin/scenario-masters/${data.id}`)
      } else {
        const { error } = await supabase
          .from('scenario_masters')
          .update(saveData)
          .eq('id', id)

        if (error) throw error

        // キャラクター保存
        for (const char of characters) {
          if (char.is_new) {
            const { id: _, is_new: __, ...charData } = char
            await supabase
              .from('scenario_characters')
              .insert({ ...charData, scenario_master_id: id })
          } else {
            const { is_new: _, ...charData } = char
            await supabase
              .from('scenario_characters')
              .update(charData)
              .eq('id', char.id)
          }
        }

        toast.success('保存しました')
        fetchData()
      }
    } catch (err) {
      logger.error('Save error:', err)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async () => {
    if (!id) return

    try {
      setSaving(true)
      const { error } = await supabase
        .from('scenario_masters')
        .update({ 
          master_status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', id)

      if (error) throw error

      toast.success('承認しました')
      fetchData()
    } catch (err) {
      logger.error('Approve error:', err)
      toast.error('承認に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleReject = async () => {
    const reason = prompt('却下理由を入力してください:')
    if (!reason || !id) return

    try {
      setSaving(true)
      const { error } = await supabase
        .from('scenario_masters')
        .update({ 
          master_status: 'rejected',
          rejection_reason: reason
        })
        .eq('id', id)

      if (error) throw error

      toast.success('却下しました')
      fetchData()
    } catch (err) {
      logger.error('Reject error:', err)
      toast.error('却下に失敗しました')
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
    if (!char.is_new) {
      await supabase.from('scenario_characters').delete().eq('id', char.id)
    }
    setCharacters(characters.filter((_, i) => i !== index))
  }

  const addGenre = () => {
    if (genreInput.trim() && master) {
      setMaster({
        ...master,
        genre: [...(master.genre || []), genreInput.trim()]
      })
      setGenreInput('')
    }
  }

  const removeGenre = (index: number) => {
    if (master) {
      setMaster({
        ...master,
        genre: master.genre.filter((_, i) => i !== index)
      })
    }
  }

  const handleCorrectionApprove = async (correction: CorrectionRequest) => {
    if (!master) return

    try {
      // 修正を適用
      const fieldName = correction.field_name as keyof ScenarioMaster
      await supabase
        .from('scenario_masters')
        .update({ [fieldName]: correction.suggested_value })
        .eq('id', id)

      // 修正リクエストを承認済みに
      await supabase
        .from('scenario_master_corrections')
        .update({ 
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', correction.id)

      toast.success('修正を適用しました')
      fetchData()
    } catch (err) {
      logger.error('Correction approve error:', err)
      toast.error('修正の適用に失敗しました')
    }
  }

  const handleCorrectionReject = async (correction: CorrectionRequest) => {
    const comment = prompt('却下理由を入力してください:')
    if (!comment) return

    try {
      await supabase
        .from('scenario_master_corrections')
        .update({ 
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_comment: comment
        })
        .eq('id', correction.id)

      toast.success('修正リクエストを却下しました')
      fetchData()
    } catch (err) {
      logger.error('Correction reject error:', err)
      toast.error('却下に失敗しました')
    }
  }

  if (!isLicenseAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">アクセス権限がありません</h1>
          <Button onClick={() => navigate('/')}>トップへ戻る</Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    )
  }

  if (!master) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">シナリオが見つかりません</h1>
          <Button onClick={() => navigate('/admin/scenario-masters')}>一覧へ戻る</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <NavigationBar />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/scenario-masters')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              戻る
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? '新規シナリオマスタ' : master.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {!isNew && master.master_status === 'pending' && (
              <>
                <Button variant="outline" onClick={handleReject} disabled={saving}>
                  <XCircle className="w-4 h-4 mr-2" />
                  却下
                </Button>
                <Button onClick={handleApprove} disabled={saving}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  承認
                </Button>
              </>
            )}
            <Button onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>

        {/* 修正リクエスト */}
        {corrections.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-yellow-800 mb-3">修正リクエスト ({corrections.length}件)</h2>
            <div className="space-y-3">
              {corrections.map((correction) => (
                <div key={correction.id} className="bg-white rounded p-3 border">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-gray-500">{correction.organization_name}</p>
                      <p className="font-medium">{correction.field_name}: {correction.suggested_value}</p>
                      {correction.reason && (
                        <p className="text-sm text-gray-600 mt-1">理由: {correction.reason}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleCorrectionReject(correction)}>
                        却下
                      </Button>
                      <Button size="sm" onClick={() => handleCorrectionApprove(correction)}>
                        適用
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* メインフォーム */}
          <div className="lg:col-span-2 space-y-6">
            {/* 基本情報 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-4">基本情報</h2>
              
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

                <div>
                  <Label htmlFor="key_visual_url">キービジュアルURL</Label>
                  <Input
                    id="key_visual_url"
                    value={master.key_visual_url || ''}
                    onChange={(e) => setMaster({ ...master, key_visual_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="official_duration">公演時間（分）</Label>
                    <Input
                      id="official_duration"
                      type="number"
                      value={master.official_duration}
                      onChange={(e) => setMaster({ ...master, official_duration: parseInt(e.target.value) || 180 })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">平日の公演時間</p>
                  </div>
                  <div>
                    <Label htmlFor="weekend_duration">土日公演時間（分）</Label>
                    <Input
                      id="weekend_duration"
                      type="number"
                      value={master.weekend_duration ?? ''}
                      onChange={(e) => setMaster({ ...master, weekend_duration: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="未設定（通常時間を使用）"
                    />
                    <p className="text-xs text-muted-foreground mt-1">土日・祝日に時間が変わる場合</p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="difficulty">難易度</Label>
                  <select
                    id="difficulty"
                    value={master.difficulty || ''}
                    onChange={(e) => setMaster({ ...master, difficulty: e.target.value })}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">未設定</option>
                    <option value="beginner">初心者向け</option>
                    <option value="intermediate">中級者向け</option>
                    <option value="advanced">上級者向け</option>
                  </select>
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
                    <Button type="button" onClick={addGenre}>追加</Button>
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
            </div>

            {/* 説明・あらすじ */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-4">説明</h2>
              
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
                    rows={6}
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
            </div>

            {/* キャラクター */}
            {!isNew && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">キャラクター</h2>
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
                        <div className="flex items-center text-gray-400">
                          <GripVertical className="w-4 h-4" />
                        </div>
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
            )}
          </div>

          {/* サイドバー */}
          <div className="space-y-6">
            {/* ステータス */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-4">ステータス</h2>
              <select
                value={master.master_status}
                onChange={(e) => setMaster({ ...master, master_status: e.target.value as any })}
                className="w-full border rounded-md p-2"
              >
                <option value="draft">下書き</option>
                <option value="pending">承認待ち</option>
                <option value="approved">承認済み</option>
                <option value="rejected">却下</option>
              </select>

              {master.rejection_reason && (
                <div className="mt-4 p-3 bg-red-50 rounded text-sm text-red-700">
                  <p className="font-medium">却下理由:</p>
                  <p>{master.rejection_reason}</p>
                </div>
              )}
            </div>

            {/* その他設定 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-4">その他</h2>
              
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ScenarioMasterEdit

