/**
 * 自動のお知らせ（参加した・外れた・候補日が追加された等）を灰色の小さな 1 行で出す（グループページ刷新 段階 1）。
 * 続けて届いたお知らせは「・」でつないで 1 行にまとめる。
 */
export function SystemNoticeLine({ texts }: { texts: string[] }) {
  return (
    <p className="my-2 px-4 text-center text-xs text-muted-foreground leading-snug" data-testid="system-notice-line">
      {texts.join(' ・ ')}
    </p>
  )
}
