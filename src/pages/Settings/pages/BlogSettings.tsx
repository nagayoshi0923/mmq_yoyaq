/**
 * ブログ・お知らせ管理設定
 * @path /settings (blog タブ)
 */
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { BLOG_POST_SELECT_COLUMNS } from '@/lib/blogPublicFetch'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganization, getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  FileText,
  Loader2,
  ExternalLink,
  Upload,
  X,
} from 'lucide-react'
import { uploadBlogCoverImage, deleteBlogCoverImage, validateImageFile } from '@/lib/uploadImage'
import type { BlogPost } from '@/types'

/** 自前アップロード（blog-covers）の公開URLからストレージパスを復元 */
function storagePathFromBlogCoverPublicUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  const marker = '/blog-covers/'
  const i = url.indexOf(marker)
  if (i === -1) return null
  const path = url.slice(i + marker.length).split('?')[0]
  return path || null
}

export function BlogSettings() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [organizationSlug, setOrganizationSlug] = useState<string | null>(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const coverFileInputRef = useRef<HTMLInputElement>(null)

  // フォーム状態
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    cover_image_url: '',
    is_published: false
  })

  useEffect(() => {
    fetchPosts()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const org = await getCurrentOrganization()
        setOrganizationSlug(org?.slug ?? null)
      } catch {
        setOrganizationSlug(null)
      }
    })()
  }, [])

  const publicBlogPostHref = (postSlug: string) => {
    const encoded = encodeURIComponent(postSlug)
    return organizationSlug ? `/${organizationSlug}/blog/${encoded}` : `/blog/${encoded}`
  }

  const fetchPosts = async () => {
    try {
      setLoading(true)
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return

      const { data, error } = await supabase
        .from('blog_posts')
        .select(BLOG_POST_SELECT_COLUMNS)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPosts(data || [])
    } catch (err) {
      logger.error('ブログ記事取得エラー:', err)
      toast.error('記事の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const openNewDialog = () => {
    setEditingPost(null)
    setFormData({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      cover_image_url: '',
      is_published: false
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (post: BlogPost) => {
    setEditingPost(post)
    setFormData({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || '',
      content: post.content,
      cover_image_url: post.cover_image_url || '',
      is_published: post.is_published
    })
    setIsDialogOpen(true)
  }

  const generateSlug = (title: string) => {
    const timestamp = Date.now().toString(36)
    const sanitized = title
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)
    return `${sanitized || 'post'}-${timestamp}`
  }

  const handleCoverFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const check = validateImageFile(file, 5)
    if (!check.valid) {
      toast.error(check.error || '画像を選べませんでした')
      return
    }

    try {
      setIsUploadingCover(true)
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        toast.error('組織情報を取得できません')
        return
      }

      const previousUrl = formData.cover_image_url.trim()
      const previousPath = previousUrl ? storagePathFromBlogCoverPublicUrl(previousUrl) : null

      const result = await uploadBlogCoverImage(file, orgId)
      if (!result) {
        toast.error('画像のアップロードに失敗しました')
        return
      }

      if (previousPath) {
        void deleteBlogCoverImage(previousPath).catch(() => {
          /* 旧ファイル削除失敗は無視（一覧は新URLで表示） */
        })
      }

      setFormData((prev) => ({ ...prev, cover_image_url: result.url }))
      toast.success('カバー画像をアップロードしました')
    } catch (err) {
      logger.error('カバー画像アップロード:', err)
      toast.error('画像のアップロードに失敗しました')
    } finally {
      setIsUploadingCover(false)
    }
  }

  const clearCoverImage = () => {
    setFormData((prev) => ({ ...prev, cover_image_url: '' }))
  }

  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: editingPost ? prev.slug : generateSlug(title)
    }))
  }

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error('タイトルを入力してください')
      return
    }
    if (!formData.content.trim()) {
      toast.error('本文を入力してください')
      return
    }

    try {
      setIsSaving(true)
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        toast.error('組織情報を取得できません')
        return
      }

      const postData = {
        organization_id: orgId,
        title: formData.title.trim(),
        slug: formData.slug || generateSlug(formData.title),
        excerpt: formData.excerpt.trim() || null,
        content: formData.content.trim(),
        cover_image_url: formData.cover_image_url.trim() || null,
        is_published: formData.is_published,
        published_at: formData.is_published ? new Date().toISOString() : null
      }

      if (editingPost) {
        const { error } = await supabase
          .from('blog_posts')
          .update(postData)
          .eq('id', editingPost.id)

        if (error) throw error
        toast.success('記事を更新しました')
      } else {
        const { error } = await supabase
          .from('blog_posts')
          .insert(postData)

        if (error) throw error
        toast.success('記事を作成しました')
      }

      setIsDialogOpen(false)
      fetchPosts()
    } catch (err: any) {
      logger.error('記事保存エラー:', err)
      if (err?.code === '23505') {
        toast.error('同じスラッグの記事が既に存在します')
      } else {
        toast.error('記事の保存に失敗しました')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (post: BlogPost) => {
    if (!confirm(`「${post.title}」を削除しますか？`)) return

    try {
      const { error } = await supabase
        .from('blog_posts')
        .delete()
        .eq('id', post.id)

      if (error) throw error
      toast.success('記事を削除しました')
      fetchPosts()
    } catch (err) {
      logger.error('記事削除エラー:', err)
      toast.error('記事の削除に失敗しました')
    }
  }

  const togglePublish = async (post: BlogPost) => {
    try {
      const newStatus = !post.is_published
      const { error } = await supabase
        .from('blog_posts')
        .update({
          is_published: newStatus,
          published_at: newStatus ? new Date().toISOString() : null
        })
        .eq('id', post.id)

      if (error) throw error
      toast.success(newStatus ? '公開しました' : '非公開にしました')
      fetchPosts()
    } catch (err) {
      logger.error('公開状態更新エラー:', err)
      toast.error('更新に失敗しました')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                ブログ・お知らせ管理
              </CardTitle>
              <CardDescription>
                トップページやマイページに表示するお知らせ記事を管理します
              </CardDescription>
            </div>
            <Button onClick={openNewDialog}>
              <Plus className="w-4 h-4 mr-2" />
              新規作成
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>まだ記事がありません</p>
              <Button variant="outline" className="mt-4" onClick={openNewDialog}>
                最初の記事を作成
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <div
                  key={post.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{post.title}</h3>
                      <Badge variant={post.is_published ? 'default' : 'secondary'}>
                        {post.is_published ? '公開中' : '下書き'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(post.published_at || post.created_at)}
                      </span>
                      {post.excerpt && (
                        <span className="truncate max-w-[200px]">{post.excerpt}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    {post.is_published ? (
                      <Button variant="ghost" size="sm" asChild title="公開ページを新しいタブで開く">
                        <a
                          href={publicBlogPostHref(post.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => togglePublish(post)}
                      title={post.is_published ? '非公開にする' : '公開する'}
                    >
                      {post.is_published ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(post)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(post)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 編集ダイアログ */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPost ? '記事を編集' : '新しい記事を作成'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                タイトル <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="記事のタイトル"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                スラッグ（URL）
              </label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="url-slug"
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                URLに使用されます（例:{' '}
                {organizationSlug
                  ? `/${organizationSlug}/blog/${formData.slug || 'slug'}`
                  : `/blog/${formData.slug || 'slug'}`}
                ）
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                抜粋（一覧表示用）
              </label>
              <Textarea
                value={formData.excerpt}
                onChange={(e) => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
                placeholder="記事の概要を入力..."
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                本文 <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="記事の本文を入力..."
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Markdown記法が使えます
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">カバー画像</label>
              <p className="text-xs text-gray-500 mb-2">
                画像ファイルをアップロードするか、外部URLを直接入力できます
              </p>
              <input
                ref={coverFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleCoverFileSelected}
              />
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploadingCover || isSaving}
                  onClick={() => coverFileInputRef.current?.click()}
                >
                  {isUploadingCover ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  画像をアップロード
                </Button>
                {formData.cover_image_url.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    disabled={isUploadingCover || isSaving}
                    onClick={clearCoverImage}
                  >
                    <X className="w-4 h-4 mr-1" />
                    画像をクリア
                  </Button>
                ) : null}
              </div>
              {formData.cover_image_url.trim() ? (
                <div className="mb-2 rounded-md border border-gray-200 overflow-hidden bg-gray-50 max-h-40 w-full max-w-md">
                  <img
                    src={formData.cover_image_url.trim()}
                    alt="カバープレビュー"
                    className="w-full h-full max-h-40 object-contain"
                  />
                </div>
              ) : null}
              <label className="block text-xs font-medium text-gray-600 mb-1">または画像URL</label>
              <Input
                value={formData.cover_image_url}
                onChange={(e) => setFormData((prev) => ({ ...prev, cover_image_url: e.target.value }))}
                placeholder="https://..."
                disabled={isUploadingCover}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="text-sm font-medium">
                公開する
              </label>
              <Switch
                checked={formData.is_published}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_published: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                editingPost ? '更新' : '作成'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
