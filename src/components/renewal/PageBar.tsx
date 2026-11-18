/** 画面の上に固定する「‹ 画面名」の帯。‹ は前の画面に戻る（読み込み中・エラーでも同じ形） */
export function PageBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-20 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-12 max-w-4xl items-center gap-2 px-2">
        <button type="button" onClick={onBack} aria-label="戻る" className="flex h-10 w-10 items-center justify-center text-xl" data-testid="back">‹</button>
        <h1 className="text-base font-bold">{title}</h1>
      </div>
    </div>
  )
}
