/**
 * 作者プロフィール設定
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Globe, Mail, Save, Twitter, User } from 'lucide-react'
import { authorApi } from '@/lib/api/authorApi'
import type { Author } from '@/types'

interface AuthorProfileSettingsProps {
  author: Author
  onUpdate: (author: Author) => void
}

export function AuthorProfileSettings({ author, onUpdate }: AuthorProfileSettingsProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  // プロフィールフォーム
  const [displayName, setDisplayName] = useState(author.display_name || '')
  const [bio, setBio] = useState(author.bio || '')
  const [websiteUrl, setWebsiteUrl] = useState(author.website_url || '')
  const [twitterUrl, setTwitterUrl] = useState(author.twitter_url || '')
  
  // 通知設定
  const [emailOnReport, setEmailOnReport] = useState(
    author.notification_settings?.email_on_report ?? true
  )
  const [emailSummary, setEmailSummary] = useState<'daily' | 'weekly' | 'monthly' | 'none'>(
    author.notification_settings?.email_summary ?? 'monthly'
  )

  const handleSaveProfile = async () => {
    try {
      setLoading(true)
      setMessage(null)
      const updated = await authorApi.updateProfile(author.id, {
        display_name: displayName || null,
        bio: bio || null,
        website_url: websiteUrl || null,
        twitter_url: twitterUrl || null
      })
      onUpdate(updated)
      setMessage({ type: 'success', text: 'プロフィールを保存しました' })
    } catch (err) {
      console.error('Failed to update profile:', err)
      setMessage({ type: 'error', text: '保存に失敗しました' })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveNotifications = async () => {
    try {
      setLoading(true)
      setMessage(null)
      const updated = await authorApi.updateNotificationSettings(author.id, {
        email_on_report: emailOnReport,
        email_summary: emailSummary
      })
      onUpdate(updated)
      setMessage({ type: 'success', text: '通知設定を保存しました' })
    } catch (err) {
      console.error('Failed to update notifications:', err)
      setMessage({ type: 'error', text: '保存に失敗しました' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            プロフィール
          </CardTitle>
          <CardDescription>
            公開プロフィールの設定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>登録名（変更不可）</Label>
              <Input value={author.name} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">表示名</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="公開時の表示名"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">自己紹介</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="自己紹介文"
              rows={4}
            />
          </div>

          <hr className="border-muted" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="website" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                ウェブサイト
              </Label>
              <Input
                id="website"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitter" className="flex items-center gap-2">
                <Twitter className="h-4 w-4" />
                X（Twitter）
              </Label>
              <Input
                id="twitter"
                value={twitterUrl}
                onChange={(e) => setTwitterUrl(e.target.value)}
                placeholder="@username または URL"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              プロフィールを保存
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 通知設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            通知設定
          </CardTitle>
          <CardDescription>
            公演報告の通知設定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>新規報告時の通知</Label>
              <p className="text-sm text-muted-foreground">
                新しい公演報告があったときにメールで通知
              </p>
            </div>
            <Switch
              checked={emailOnReport}
              onCheckedChange={setEmailOnReport}
            />
          </div>

          <hr className="border-muted" />

          <div className="space-y-2">
            <Label>定期サマリー</Label>
            <p className="text-sm text-muted-foreground mb-2">
              公演報告の集計レポートをメールで受け取る頻度
            </p>
            <Select value={emailSummary} onValueChange={(v) => setEmailSummary(v as any)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">毎日</SelectItem>
                <SelectItem value="weekly">毎週</SelectItem>
                <SelectItem value="monthly">毎月</SelectItem>
                <SelectItem value="none">受け取らない</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveNotifications} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              通知設定を保存
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* アカウント情報 */}
      <Card>
        <CardHeader>
          <CardTitle>アカウント情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">メールアドレス</p>
              <p className="font-medium">{author.email || '未設定'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">認証状態</p>
              <p className="font-medium">
                {author.is_verified ? '✓ 認証済み' : '未認証'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">登録日</p>
              <p className="font-medium">
                {new Date(author.created_at).toLocaleDateString('ja-JP')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">最終更新</p>
              <p className="font-medium">
                {new Date(author.updated_at).toLocaleDateString('ja-JP')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

