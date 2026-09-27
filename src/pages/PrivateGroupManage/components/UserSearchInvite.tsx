import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  UserPlus,
  Copy,
  Check,
  Loader2,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Link,
} from 'lucide-react'
import { readPrivateGroupInvitations, searchPrivateGroupInvitee, managePrivateGroupInvitation } from '@/lib/privateGroupInvitations'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import type { PrivateGroupInvitation, PrivateGroupMember } from '@/types'

interface UserSearchInviteProps {
  groupId: string
  inviteCode: string
  members: PrivateGroupMember[]
  onInvitationSent?: () => void
}

interface SearchedUser {
  id: string
  email: string
  display_name: string | null
}

export function UserSearchInvite({
  groupId,
  inviteCode,
  members,
  onInvitationSent,
}: UserSearchInviteProps) {
  const { user } = useAuth()
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResult, setSearchResult] = useState<SearchedUser | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [invitations, setInvitations] = useState<PrivateGroupInvitation[]>([])
  const [loadingInvitations, setLoadingInvitations] = useState(true)
  const [copied, setCopied] = useState(false)
  const [invitationError, setInvitationError] = useState<string | null>(null)
  const currentGroup = useRef(groupId)
  currentGroup.current = groupId
  const requestVersion = useRef(0)
  const searchVersion = useRef(0)

  const inviteUrl = `${window.location.origin}/group/invite/${inviteCode}`

  const fetchInvitations = useCallback(async () => {
    const version = ++requestVersion.current
    setLoadingInvitations(true)
    setInvitationError(null)
    try {
      const data = await readPrivateGroupInvitations(groupId)
      if (version === requestVersion.current) setInvitations(data)
    } catch (err) {
      logger.error('Failed to fetch invitations', err)
      if (version === requestVersion.current) {
        setInvitations([])
        setInvitationError('招待履歴を取得できませんでした。再試行してください。')
      }
    } finally {
      if (version === requestVersion.current) setLoadingInvitations(false)
    }
  }, [groupId])

  useEffect(() => {
    setInvitations([])
    setSearchResult(null)
    setSearchEmail('')
    setSearchError(null)
    setSearching(false)
    setInviting(false)
    searchVersion.current += 1
    void fetchInvitations()
    return () => { requestVersion.current += 1; searchVersion.current += 1 }
  }, [fetchInvitations])

  const handleSearch = async () => {
    if (!searchEmail.trim()) return

    const version = ++searchVersion.current
    setSearching(true)
    setSearchError(null)
    setSearchResult(null)

    try {
      const emailLower = searchEmail.trim().toLowerCase()

      const existingMember = members.find(
        (m) => m.users?.email?.toLowerCase() === emailLower
      )
      if (existingMember) {
        setSearchError('このユーザーは既にメンバーです')
        return
      }

      const existingInvite = invitations.find(
        (i) => i.invited_email.toLowerCase() === emailLower && i.status === 'pending'
      )
      if (existingInvite) {
        setSearchError('このユーザーには既に招待を送信済みです')
        return
      }

      const data = await searchPrivateGroupInvitee(groupId, emailLower)
      if (currentGroup.current !== groupId || searchVersion.current !== version) return
      if (!data) {
        setSearchError('ユーザーが見つかりません。招待リンクを共有してください。')
        return
      }

      if (data.id === user?.id) {
        setSearchError('自分自身を招待することはできません')
        return
      }

      setSearchResult(data)
    } catch (err) {
      logger.error('Search error', err)
      if (currentGroup.current === groupId && searchVersion.current === version) setSearchError(err instanceof Error ? err.message : '検索中にエラーが発生しました')
    } finally {
      if (searchVersion.current === version) setSearching(false)
    }
  }

  const handleInvite = async (targetUser: SearchedUser) => {
    if (!user) return

    setInviting(true)
    try {
      await managePrivateGroupInvitation(groupId, 'create', targetUser.id, targetUser.email)
      if (currentGroup.current !== groupId) return
      setSearchResult(null)
      setSearchEmail('')
      fetchInvitations()
      onInvitationSent?.()
    } catch (err) {
      logger.error('Failed to send invitation', err)
      if (currentGroup.current === groupId) setSearchError(err instanceof Error ? err.message : '招待を保存できませんでした')
    } finally {
      setInviting(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      logger.error('Failed to copy')
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    setInviting(true)
    setInvitationError(null)
    try {
      await managePrivateGroupInvitation(groupId, 'cancel', invitationId)
      if (currentGroup.current === groupId) await fetchInvitations()
    } catch (err) {
      logger.error('Failed to cancel invitation', err)
      if (currentGroup.current === groupId) setInvitationError(err instanceof Error ? err.message : '招待を取り消せませんでした')
    } finally {
      setInviting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
            <Clock className="w-3 h-3 mr-1" />
            保留中
          </Badge>
        )
      case 'accepted':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            承諾済み
          </Badge>
        )
      case 'declined':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
            <XCircle className="w-3 h-3 mr-1" />
            辞退
          </Badge>
        )
      case 'cancelled':
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
            取消済み
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Mail className="w-4 h-4" />
            メールアドレスで招待
          </h3>
          <div className="flex gap-2">
            <Input
              type="email"
              value={searchEmail}
              onChange={(e) => {
                searchVersion.current += 1
                setSearching(false)
                setSearchEmail(e.target.value)
                setSearchError(null)
                setSearchResult(null)
              }}
              placeholder="example@email.com"
              className="flex-1"
            />
            <Button
              onClick={handleSearch}
              disabled={!searchEmail.trim() || searching}
              variant="outline"
            >
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>

          {searchError && (
            <p className="text-sm text-red-600">{searchError}</p>
          )}

          {searchResult && (
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div>
                <p className="font-medium text-sm">
                  {searchResult.display_name || searchResult.email.split('@')[0]}
                </p>
                <p className="text-xs text-muted-foreground">{searchResult.email}</p>
              </div>
              <Button
                size="sm"
                onClick={() => handleInvite(searchResult)}
                disabled={inviting}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {inviting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <UserPlus className="w-4 h-4 mr-1" />
                )}
                招待
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Link className="w-4 h-4" />
            招待リンクを共有
          </h3>
          <div className="flex gap-2">
            <Input value={inviteUrl} readOnly className="text-sm bg-gray-50" />
            <Button variant="outline" size="icon" onClick={handleCopyLink}>
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            このリンクを友達に共有すると、グループに参加できます
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-semibold">招待履歴</h3>
          {invitationError && (
            <div role="alert">
              <p>{invitationError}</p>
              <Button variant="outline" onClick={() => void fetchInvitations()} disabled={loadingInvitations}>再試行</Button>
            </div>
          )}
          {loadingInvitations ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : invitationError ? null : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              まだ招待を送信していません
            </p>
          ) : (
            <div className="space-y-2">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{invitation.invited_email}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(invitation.created_at).toLocaleDateString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(invitation.status)}
                    {invitation.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelInvitation(invitation.id)}
                        disabled={inviting}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                      >
                        取消
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
