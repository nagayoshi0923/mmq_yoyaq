import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, GripVertical, User, Upload, X } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import { showToast } from '@/utils/toast'
import type { ScenarioFormData, ScenarioCharacter } from '@/components/modals/ScenarioEditModal/types'

const labelStyle = "text-xs font-medium mb-0.5 block"
const inputStyle = "h-8 text-sm"

interface CharactersSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

const genderOptions = [
  { value: 'male', label: '男性' },
  { value: 'female', label: '女性' },
  { value: 'other', label: 'その他' },
  { value: 'unknown', label: '不明' },
]

const generateId = () => crypto.randomUUID()

export function CharactersSectionV2({ formData, setFormData }: CharactersSectionV2Props) {
  const characters = formData.characters || []
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const handleImageUpload = async (characterId: string, file: File) => {
    // ファイルタイプのみチェック（サイズは自動圧縮されるので制限緩和: 20MBまで）
    const validation = validateImageFile(file, 20)
    if (!validation.valid) {
      showToast.error(validation.error || 'ファイルバリデーションエラー')
      return
    }

    setUploadingId(characterId)
    try {
      // 自動圧縮付きでアップロード（500KB以上は自動でリサイズ・圧縮される）
      const result = await uploadImage(file, 'key-visuals', 'characters', true)
      if (result) {
        updateCharacter(characterId, { image_url: result.url })
        showToast.success('画像をアップロードしました')
      } else {
        showToast.error('画像のアップロードに失敗しました')
      }
    } catch {
      showToast.error('画像のアップロードに失敗しました')
    } finally {
      setUploadingId(null)
    }
  }

  const addCharacter = () => {
    const newCharacter: ScenarioCharacter = {
      id: generateId(),
      name: '',
      gender: 'unknown',
      age: null,
      occupation: null,
      description: null,
      image_url: null,
      sort_order: characters.length + 1,
    }
    setFormData(prev => ({
      ...prev,
      characters: [...(prev.characters || []), newCharacter],
    }))
  }

  const updateCharacter = (id: string, updates: Partial<ScenarioCharacter>) => {
    setFormData(prev => ({
      ...prev,
      characters: (prev.characters || []).map(char =>
        char.id === id ? { ...char, ...updates } : char
      ),
    }))
  }

  const removeCharacter = (id: string) => {
    if (!confirm('このキャラクターを削除しますか？')) return
    setFormData(prev => ({
      ...prev,
      characters: (prev.characters || []).filter(char => char.id !== id),
    }))
  }

  const moveCharacter = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= characters.length) return

    const newCharacters = [...characters]
    const [removed] = newCharacters.splice(index, 1)
    newCharacters.splice(newIndex, 0, removed)
    
    // sort_orderを再設定
    const reordered = newCharacters.map((char, idx) => ({
      ...char,
      sort_order: idx + 1,
    }))

    setFormData(prev => ({ ...prev, characters: reordered }))
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">キャラクター一覧</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            シナリオ詳細ページに表示されるキャラクター情報を設定します
          </p>
        </div>
        <Button onClick={addCharacter} size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" />
          追加
        </Button>
      </div>

      {/* キャラクター一覧 */}
      {characters.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <User className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              キャラクターが登録されていません
            </p>
            <Button onClick={addCharacter} size="sm" variant="outline" className="mt-3">
              <Plus className="w-4 h-4 mr-1" />
              キャラクターを追加
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {characters.map((character, index) => (
            <Card key={character.id}>
              <CardContent className="p-3">
                <div className="flex gap-2">
                  {/* 並び替えハンドル */}
                  <div className="flex flex-col justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => moveCharacter(index, 'up')}
                      disabled={index === 0}
                    >
                      <span className="text-xs">▲</span>
                    </Button>
                    <GripVertical className="w-4 h-4 text-muted-foreground mx-auto" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => moveCharacter(index, 'down')}
                      disabled={index === characters.length - 1}
                    >
                      <span className="text-xs">▼</span>
                    </Button>
                  </div>

                  {/* キャラクター画像 */}
                  <div className="w-20 shrink-0">
                    <Label className={labelStyle}>画像</Label>
                    {character.image_url ? (
                      <div className="relative group">
                        <OptimizedImage
                          src={character.image_url}
                          alt={character.name || 'キャラクター'}
                          className="w-full aspect-square object-cover rounded border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => updateCharacter(character.id, { image_url: null })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className={`w-full aspect-square border-2 border-dashed rounded flex items-center justify-center bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer ${
                          uploadingId === character.id ? 'opacity-50' : ''
                        }`}
                        onClick={() => fileInputRefs.current[character.id]?.click()}
                      >
                        <input
                          ref={(el) => { fileInputRefs.current[character.id] = el }}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleImageUpload(character.id, file)
                            e.target.value = ''
                          }}
                          className="hidden"
                        />
                        {uploadingId === character.id ? (
                          <span className="text-xs text-muted-foreground">...</span>
                        ) : (
                          <Upload className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* メインコンテンツ */}
                  <div className="flex-1 space-y-2">
                    {/* 1行目: 名前・性別 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className={labelStyle}>名前 *</Label>
                        <Input
                          value={character.name}
                          onChange={(e) => updateCharacter(character.id, { name: e.target.value })}
                          placeholder="キャラクター名"
                          className={inputStyle}
                        />
                      </div>
                      <div>
                        <Label className={labelStyle}>性別</Label>
                        <Select
                          value={character.gender}
                          onValueChange={(value: ScenarioCharacter['gender']) => 
                            updateCharacter(character.id, { gender: value })
                          }
                        >
                          <SelectTrigger className={inputStyle}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {genderOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* 2行目: 年齢・職業 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className={labelStyle}>年齢（任意）</Label>
                        <Input
                          value={character.age || ''}
                          onChange={(e) => updateCharacter(character.id, { 
                            age: e.target.value || null 
                          })}
                          placeholder="例: 25歳、20代後半"
                          className={inputStyle}
                        />
                      </div>
                      <div>
                        <Label className={labelStyle}>職業（任意）</Label>
                        <Input
                          value={character.occupation || ''}
                          onChange={(e) => updateCharacter(character.id, { 
                            occupation: e.target.value || null 
                          })}
                          placeholder="例: 探偵、医師"
                          className={inputStyle}
                        />
                      </div>
                    </div>

                    {/* 3行目: 説明 */}
                    <div>
                      <Label className={labelStyle}>説明（任意）</Label>
                      <Textarea
                        value={character.description || ''}
                        onChange={(e) => updateCharacter(character.id, { 
                          description: e.target.value || null 
                        })}
                        placeholder="キャラクターの簡単な説明..."
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  {/* 削除ボタン */}
                  <div className="flex items-start">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCharacter(character.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 追加ボタン（キャラクターがある場合のみ下部にも表示） */}
      {characters.length > 0 && (
        <Button onClick={addCharacter} size="sm" variant="outline" className="w-full">
          <Plus className="w-4 h-4 mr-1" />
          キャラクターを追加
        </Button>
      )}
    </div>
  )
}
