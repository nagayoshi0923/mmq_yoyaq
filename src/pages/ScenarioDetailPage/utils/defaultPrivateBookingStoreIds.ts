/**
 * 貸切タブを開いたときに最初からチェックしておく希望店舗。
 * フランチャイズ店（ownership_type='franchise'。クインズワルツでは埼玉大宮店）は最初はチェックしない（2026-11-14 社長指示
 * 「大宮はデフォルトから外して」。希望しないのに大宮にチェックが入ったままの申込が多かったため）。お客様が選べば選べる。
 * 上演できる店舗がフランチャイズ店だけ（札幌店の組織など）のときは、従来どおり全店をチェックする。
 * 空き判定（DB）は変えない。渡す店舗の初期値だけ。
 */
export function defaultPrivateBookingStoreIds(playable: Array<{ id: string; ownership_type?: string | null }>): string[] {
  const nonFranchise = playable.filter(s => s.ownership_type !== 'franchise')
  return (nonFranchise.length > 0 ? nonFranchise : playable).map(s => s.id)
}
