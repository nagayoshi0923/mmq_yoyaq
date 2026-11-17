/** 作品紹介の上に固定する「‹ 作品紹介」の帯（読み込み中・エラーでも同じ形） */
export function IntroBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-12 max-w-4xl items-center gap-2 px-2">
        <button type="button" onClick={onBack} aria-label="戻る" className="flex h-10 w-10 items-center justify-center text-xl">‹</button>
        <h1 className="text-base font-bold">作品紹介</h1>
      </div>
    </div>
  )
}
