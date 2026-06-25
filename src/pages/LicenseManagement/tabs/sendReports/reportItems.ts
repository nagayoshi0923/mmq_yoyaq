/**
 * ライセンス報告の明細プレビュー計算（純関数・テスト対象）
 *
 * SendReports の getPreviewItem から計算コアを抽出（Phase 5-5・挙動不変）。
 * 手動上書き（internalInputs / externalInputs）を反映した公演数・金額を算出する。
 * 状態（Record）は引数注入。型は呼び出し側に依存しないようジェネリックにし、
 * 入力の全フィールドを温存したまま上書きフィールドを差し替える。副作用なし。
 */

/** 手動上書きマップ（scenarioKey → 件数。undefined = 実データを使用）。 */
export type OverrideInputs = Record<string, number | undefined>

/** computePreviewItem が参照する入力フィールドの最小集合。 */
export interface PreviewInput {
  scenarioKey: string
  internalEvents: number
  internalLicenseAmount: number
  externalEvents: number
  externalLicenseAmount: number
  scenarioType?: 'normal' | 'managed'
}

/** computePreviewItem が上書きするフィールド。 */
export interface PreviewOverrides {
  internalEvents: number
  internalLicenseCost: number
  externalEvents: number
  externalLicenseCost: number
  events: number
  licenseCost: number
}

/**
 * 明細に手動上書きを反映したプレビュー値を計算する。
 * - 自社公演数: internalInputs[scenarioKey] があればそれ、無ければ item.internalEvents
 * - 他社公演数: 管理作品（scenarioType === 'managed'）のみ externalInputs を反映、それ以外は 0
 * 入力の他フィールドはそのまま温存して返す。
 */
export function computePreviewItem<T extends PreviewInput>(
  item: T,
  internalInputs: OverrideInputs,
  externalInputs: OverrideInputs,
): T & PreviewOverrides {
  const internalKey = item.scenarioKey
  const internalEvents = internalInputs[internalKey] ?? item.internalEvents
  const internalLicenseCost = internalEvents * item.internalLicenseAmount

  const externalEvents = item.scenarioType === 'managed'
    ? (externalInputs[item.scenarioKey] ?? item.externalEvents)
    : 0
  const externalLicenseCost = externalEvents * item.externalLicenseAmount
  const events = internalEvents + externalEvents
  const licenseCost = internalLicenseCost + externalLicenseCost
  return { ...item, internalEvents, internalLicenseCost, externalEvents, externalLicenseCost, events, licenseCost }
}
