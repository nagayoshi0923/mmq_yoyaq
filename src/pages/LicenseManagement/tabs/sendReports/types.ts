/**
 * ライセンス料報告（SendReports）の共有型。
 *
 * 元は SendReports.tsx 内に定義されていたものを純ロジック抽出（grouping 等）で
 * 共有するため切り出した（Phase 5-5・定義の移設のみ・挙動不変）。
 */

// 報告データ
export interface ReportItem {
  scenarioId: string
  scenarioKey: string  // map キー（scenarioId + '_gmtest' or '_カスタム種別' など）
  scenarioTitle: string
  author: string  // 元の作者名
  reportDisplayName: string  // 報告用表示名（report_display_name || author）
  authorEmail: string | null  // あれば作者へ、なければ会社へ
  events: number  // 合計（internalEvents + externalEvents）
  internalEvents: number  // 自社公演数
  externalEvents: number  // 他社報告数
  licenseCost: number  // 合計金額
  internalLicenseCost: number  // 自社公演の金額
  externalLicenseCost: number  // 他社報告の金額
  internalLicenseAmount: number  // 自社公演の単価
  externalLicenseAmount: number  // 他社報告の単価（franchise_license_amount）
  isGMTest?: boolean
  scenarioType?: 'normal' | 'managed'  // 管理作品のみ他社表示
}

// 送信済みメールの確認・編集ダイアログの対象
export interface EmailBodyEditTarget {
  authorName: string
  emailBody: string
  subject: string
}

// 作者ごとにグループ化（報告用表示名でグループ化）
export interface ReportGroup {
  authorName: string  // 報告用表示名（編集可能）
  originalAuthorName: string  // 元の作者名（参照用）
  authorEmail: string | null  // 最も多く使われているメアド
  authorNotes: string | null  // 作者メモ（authorsテーブルから）
  items: ReportItem[]
  totalEvents: number
  totalInternalEvents: number
  totalExternalEvents: number
  totalLicenseCost: number
  totalInternalLicenseCost: number
  totalExternalLicenseCost: number
  // 一部未登録の警告用
  itemsWithEmail: number
  itemsWithoutEmail: number
  hasPartialEmail: boolean  // 一部のみメアド登録
}
