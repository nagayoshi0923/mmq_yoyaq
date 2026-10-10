/**
 * チャットがいま見えているか（グループページ刷新 段階 3）。スマホはチャットタブを開いているとき、PC は右列に常に見えている。
 * グループページ（GroupMemberScreen）が値を入れ、GroupChat の「いま見ている」（presence）に使う。既定は見えている扱い。
 */
import { createContext } from 'react'

export const ChatVisibleContext = createContext(true)

/** 自分の発言を送ったときの合図（通知の案内カードを「初めて発言した直後」に出すため） */
export const MESSAGE_SENT_EVENT = 'private-group-message-sent'
export type MessageSentDetail = { groupId: string; firstOwn: boolean }
