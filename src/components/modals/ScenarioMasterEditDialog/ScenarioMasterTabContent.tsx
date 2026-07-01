import type { Dispatch, SetStateAction } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Image as ImageIcon, Images, Upload, GripVertical, X } from 'lucide-react'
import { parseIntSafe } from '@/utils/number'
import { showToast } from '@/utils/toast'
import type { ScenarioMaster, ScenarioCharacter } from '../ScenarioMasterEditDialog'

interface ScenarioMasterTabContentProps {
  tabId: string
  master: ScenarioMaster
  setMaster: Dispatch<SetStateAction<ScenarioMaster>>
  genreInput: string
  setGenreInput: Dispatch<SetStateAction<string>>
  isDragging: boolean
  uploading: boolean
  uploadProgress: { current: number; total: number }
  isNew: boolean
  characters: ScenarioCharacter[]
  usingOrganizations: Array<{ id: string; organization_id: string; organization_name: string; org_status: string }>
  addGenre: () => void
  removeGenre: (index: number) => void
  addCharacter: () => void
  updateCharacter: (index: number, field: keyof ScenarioCharacter, value: any) => void
  removeCharacter: (index: number) => void | Promise<void>
  handleFilesUpload: (files: File[]) => void | Promise<void>
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void | Promise<void>
}

/** シナリオマスタ編集ダイアログのタブ中身（switch(tabId)）。逐語抽出（presentational・挙動不変） */
export function ScenarioMasterTabContent({
  tabId, master, setMaster, genreInput, setGenreInput, isDragging,
  uploading, uploadProgress, isNew, characters, usingOrganizations,
  addGenre, removeGenre, addCharacter, updateCharacter, removeCharacter,
  handleFilesUpload, handleDragOver, handleDragLeave, handleDrop,
}: ScenarioMasterTabContentProps) {
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
                  onChange={(e) => setMaster({ ...master, player_count_min: parseIntSafe(e.target.value, 1) })}
                />
              </div>
              <div>
                <Label htmlFor="player_count_max">最大人数</Label>
                <Input
                  id="player_count_max"
                  type="number"
                  value={master.player_count_max}
                  onChange={(e) => setMaster({ ...master, player_count_max: parseIntSafe(e.target.value, 1) })}
                />
              </div>
              <div>
                <Label htmlFor="official_duration">公演時間(分)</Label>
                <Input
                  id="official_duration"
                  type="number"
                  value={master.official_duration}
                  onChange={(e) => setMaster({ ...master, official_duration: parseIntSafe(e.target.value, 180) })}
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
                  onValueChange={(v) => setMaster({ ...master, master_status: v as 'draft' | 'pending' | 'approved' | 'rejected' })}
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
                      <Input
                        value={char.url || ''}
                        onChange={(e) => updateCharacter(index, 'url', e.target.value)}
                        placeholder="関連URL（資料等）"
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
