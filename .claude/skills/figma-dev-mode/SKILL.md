---
name: figma-dev-mode
description: Figma Dev Mode の実寸（余白・字・色・角丸）をコードにそのまま起こす。figma.com URL、忠実に、Dev Mode、デザイン実装、再現、pixel-perfect と言われたときに使う。既存コンポーネントの見た目に寄せて近似するのは禁止。
---

# Figma Dev Mode 忠実実装

公式の `figma-design-to-code` は「参考にして既存コンポーネントへ適応」と書く。**このスキルはそれを上書きする。** Dev Mode の数値が正。ShadCN / 既存 Button / Dialog のデフォルトに合わせてデザインを崩さない。

完了条件: 実装スクショと Figma スクショを並べて、枠・余白・字サイズ・色が同じに見える。

## 手順

1. **node を確定する。** URL に `node-id` が無いなら聞く。`0-1` はページ全体なので、実装するフレーム（例: モーダル）の ID を取る。
2. **測る。コードを書く前に必ず両方やる。**
   - `get_design_context`（`skillNames`: `figma-design-to-code`）— 参考コードとスクショ
   - `get_screenshot` — 完成イメージ
   - `use_figma` で対象フレームと子を数値ダンプ（[inspect.md](inspect.md)）
3. **仕様表を先に書く。** 実装前にヘッダー / サイドバー / 本文 / フッター（または該当ブロック）ごとに、幅・高さ・padding・gap・fontSize・fontWeight・fill・stroke・radius を表にする。表が空ならまだ書いてはいけない。
4. **既存コンポーネントは見た目が一致するときだけ使う。** `h-7` / `text-xs` / Dialog の `grid` / `p-6` / `text-lg` が Figma と違うなら、そのコンポーネントは枠に使わない。中身の入力やロジックだけ再利用する。
5. **専用 CSS（または同等の明示スタイル）で枠を描く。** Tailwind の近似（`text-sm`≈14 で 15 を代替など）は禁止。プロジェクトが `text-[` を禁じているなら CSS ファイルに `font-size: 15px` と書く。
6. **Figma に無い要素をヒーローに足さない。** 既存の管理ボタン等は残してよいが、ヘッダー／選択中ナビ／メインカードの構図を変えない。余分はフッター末尾か別メニューへ。
7. **折り目を合わせる。** Figma がその画面で見せているもの（タイトル＋1カード等）が、スクロールせずに同じ構図で見えること。追加フィールドはその下。
8. **検証してから「できた」と言う。** `get_screenshot`（Figma）と実装スクショを比較する。ずれがあれば数値を直す。感覚で終わらせない。

## 測る項目（ノードごと）

| 項目 | Figma | コード |
|---|---|---|
| 外枠 | width / height / radius | 同じ px。`min()` はビューポート用だけ |
| レイアウト | layoutMode / itemSpacing / padding | flex 方向・gap・padding |
| 文字 | fontSize / fontWeight / lineHeight / fill | 同じ px・weight・色 |
| 面 | fills / strokes / strokeWeight | 同じ hex |
| 選択 | 選択コンポーネントの fill | 同じ。`bg-primary` が違う色なら使わない |

色は 0–1 なので `rgb = round(c * 255)`。例: `{r:0.09,g:0.11,b:0.14}` → `#171C24`。

## やってはいけないこと

- スクショだけ見て「近いクラス」を当てる
- 「既存の Button を使えば十分」で高さと字を変える
- Dialog / Modal のデフォルト padding・grid・閉じる X を残して構図を壊す
- 公式 skill の「intent / loosely」を理由に px を捨てる
- 公演モーダル・公演カードの見た目を変える（MMQ `design.mdc`）

## ツール

- 読む: `get_design_context` → `get_screenshot` → `use_figma` ダンプ
- 書く（Figma 側）: 先に `figma-use`
- URL: `node-id=2-3` → `nodeId` は `2:3`。`fileKey` は `/design/` の直後

## MMQ

- `design.mdc`: Tailwind の `text-*` / `text-[` を増やさない。実寸は CSS ファイルへ
- 入力背景の正は `#F6F9FB`
- 機能は残す。見た目のヒーローは Figma のまま
