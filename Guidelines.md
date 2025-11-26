# マーダーミステリー店舗管理システム デザインガイドライン

## 全体方針
- **プロフェッショナル**: 業務用管理システムとして信頼性と効率性を重視
- **情報密度**: 多くの情報を整理して表示する管理画面として、適切な情報密度を保つ
- **日本語対応**: 日本語UI前提でフォントや行間を最適化
- **アクセシビリティ**: 長時間使用する管理者のために目に優しいデザイン
- **淡くて美しいUI**: 現在の洗練された淡い色調を維持し、上品で見やすいインターフェースを保つ

## 色彩システム

### 基本カラー
- プライマリ: `#030213` (ダークネイビー) - 重要なアクション、選択状態
- セカンダリ: `#ececf0` (ライトグレー) - 補助的な要素
- アクセント: `#e9ebef` (ソフトグレー) - ホバー状態、区切り線

### 入力エリア統一色
- **全入力エリア**: `#F6F9FB` - Input, Textarea, Select等すべての入力要素で統一使用
- **角丸**: ガイドライン準拠の `rounded-md` を使用
- **フォーカス状態**: 背景色は変更せず、`#F6F9FB` を維持
- **サイズ固定**: フォーカス時もサイズ変更なし（`max-height` 指定）

### 店舗識別色（全ページ共通・必須使用）
```css
高田馬場店: 青系
  - Badge/Tag: bg-blue-100 text-blue-800
  - Card/Background: bg-blue-50 border-blue-200
  - アクセント: text-blue-600

別館①: 緑系
  - Badge/Tag: bg-green-100 text-green-800
  - Card/Background: bg-green-50 border-green-200
  - アクセント: text-green-600

別館②: 紫系
  - Badge/Tag: bg-purple-100 text-purple-800
  - Card/Background: bg-purple-50 border-purple-200
  - アクセント: text-purple-600

大久保店: オレンジ系
  - Badge/Tag: bg-orange-100 text-orange-800
  - Card/Background: bg-orange-50 border-orange-200
  - アクセント: text-orange-600

大塚店: 赤系
  - Badge/Tag: bg-red-100 text-red-800
  - Card/Background: bg-red-50 border-red-200
  - アクセント: text-red-600

埼玉大宮店: 茶系
  - Badge/Tag: bg-amber-100 text-amber-800
  - Card/Background: bg-amber-50 border-amber-200
  - アクセント: text-amber-600
```

### 公演カテゴリ色（全ページ共通・必須使用）
```css
オープン公演: ブルー系（メイン公演として信頼感を表現）
  - Badge: bg-blue-100 text-blue-800
  - Card: bg-blue-50 border-blue-200 text-blue-800
  - アクセント: border-blue-300
  - 説明: 一般向けメイン公演

貸切公演: パープル系（特別感・プレミアム感を表現）
  - Badge: bg-purple-100 text-purple-800  
  - Card: bg-purple-50 border-purple-200 text-purple-800
  - アクセント: border-purple-300
  - 説明: プライベート・特別公演

GMテスト: オレンジ系（注意・研修を表現）
  - Badge: bg-orange-100 text-orange-800
  - Card: bg-orange-50 border-orange-200 text-orange-800
  - アクセント: border-orange-300
  - 説明: GM研修・スキルアップ

テストプレイ: イエロー系（実験・検証を表現）
  - Badge: bg-yellow-100 text-yellow-800
  - Card: bg-yellow-50 border-yellow-200 text-yellow-800
  - アクセント: border-yellow-300
  - 説明: 新シナリオ検証・テスト

出張公演: グリーン系（外部・移動を表現）
  - Badge: bg-green-100 text-green-800
  - Card: bg-green-50 border-green-200 text-green-800
  - アクセント: border-green-300
  - 説明: 外部会場での公演
```

### 状態色（全ページ共通）
- **🔴 赤色**: エラー・警告・削除・危険 `bg-red-50 text-red-700 border-red-200`
- **🟡 黄色**: 注意・確認・変更内容 `bg-yellow-50 text-yellow-700 border-yellow-200`
- **🟢 緑色**: 成功・使用中・アクティブ `bg-green-50 text-green-700 border-green-200`
- **🔵 青色**: 情報・待機・将来予定 `bg-blue-50 text-blue-700 border-blue-200`
- **⚫ グレー**: 無効・未設定・過去 `bg-gray-50 text-gray-600 border-gray-200`

### ステータスバッジ色システム（全ページ必須統一）
```css
使用中（active）: 緑色
  - Badge: bg-green-100 text-green-700 border-green-200
  - 意味: 現在アクティブに使用されている設定

待機設定（ready）: 青色  
  - Badge: bg-blue-50 text-blue-600 border-blue-200
  - 意味: 将来使用予定、開始時期が設定された状態

以前の設定（legacy）: グレー
  - Badge: bg-gray-50 text-gray-600 border-gray-200  
  - 意味: 過去に使用されていた設定、履歴として保持

未設定（unused）: グレー
  - Badge: bg-gray-50 text-gray-500 border-gray-200
  - 意味: 無効な設定、設定されていない状態
```

### UI要素別色使用ルール
```css
削除ボタン: 赤色 text-red-500 hover:text-red-700
編集ボタン: 青色 text-blue-500 hover:text-blue-700  
保存ボタン: 緑色 bg-green-600 text-white
キャンセルボタン: グレー variant="outline"
警告メッセージ: 赤背景 bg-red-50 border-red-200
注意メッセージ: 黄背景 bg-yellow-50 border-yellow-200
情報メッセージ: 青背景 bg-blue-50 border-blue-200
```

## タイポグラフィ

### 基本原則
- **レスポンシブ対応**: モバイル・タブレット・PCで最適な文字サイズを自動調整
- **コンポーネント統一**: ウェイトは要素・コンポーネントで自動適用
- **セマンティックHTML**: 見出しはh1-h3要素を使用

### 禁止クラス（統一感のため削除対象）
```
❌ font-bold, font-semibold, font-medium
   → CardTitle, h2, h3等のコンポーネント/要素で自動適用される
   
❌ text-2xl, text-3xl, text-4xl, text-5xl
   → h1, h2, h3等のセマンティックHTML要素を使用すべき
   
❌ leading-* (行間)
   → デフォルト値で十分、特別な理由がない限り変更不要
```

### 許容クラス（レスポンシブ対応に必要）
```
✅ text-xs, text-sm, text-base, text-lg
   → レスポンシブパターン専用: text-xs sm:text-sm md:text-base
   → index.cssでPC版は自動的に4px拡大される
   
✅ text-muted-foreground, text-destructive等
   → 色指定は許容（デザインシステムの一部）
```

### レスポンシブタイポグラフィの仕組み
```css
/* index.css - PC版で自動拡大 */
@media (min-width: 1280px) {
  .text-xs  { font-size: 16px !important; }  /* 12px → 16px */
  .text-sm  { font-size: 18px !important; }  /* 14px → 18px */
  .text-base{ font-size: 20px !important; }  /* 16px → 20px */
  .text-lg  { font-size: 24px !important; }  /* 20px → 24px */
}
```

### 推奨パターン
```jsx
// ✅ 正しい: レスポンシブパターン
<p className="text-xs sm:text-sm">説明文</p>
<CardTitle className="text-base sm:text-lg">カードタイトル</CardTitle>

// ✅ 正しい: セマンティックHTML
<h2>セクションタイトル</h2>  {/* 自動でスタイル適用 */}

// ❌ 間違い: ウェイトクラス使用
<p className="font-bold">太字テキスト</p>

// ❌ 間違い: 大きなサイズクラス
<div className="text-3xl">大見出し</div>
```

### 要素別デフォルトスタイル
- **h1**: システムタイトル、メインヘッダー（最大サイズ）
- **h2**: セクションタイトル、ページタイトル（中サイズ・セミボールド）
- **h3**: サブセクション、カードタイトル（小サイズ・ミディアム）
- **p**: 本文、説明文（通常ウェイト）
- **label**: フォームラベル、項目名（ミディアムウェイト）
- **CardTitle**: カード見出し（ミディアムウェイト・自動調整）

## コンポーネント設計

### ShadCN UIオーバーライド重要性
ShadCN UIコンポーネントにはデフォルトスタイリングが組み込まれているため、Guidelines準拠には**明示的なクラス指定**が必須：

```jsx
// ✅ 正しい：明示的にGuidelines色を指定
<Card className="bg-blue-50 border-blue-200">
  <Badge className="bg-purple-100 text-purple-800">貸切公演</Badge>
</Card>

// ❌ 危険：デフォルトスタイリングに依存
<Card>  {/* デフォルトの白背景になってしまう */}
  <Badge>貸切公演</Badge>  {/* デフォルトの灰色になってしまう */}
</Card>
```

### カード・パネル
- 背景: `bg-card` (白/ダーク対応) **または** 店舗識別色 `bg-*-50`
- 境界線: `border-border` (薄いグレー) **または** 店舗識別色 `border-*-200`
- 角丸: `rounded-lg` (統一)
- 影: 最小限、必要な場合のみ

### ボタン
- Primary: `bg-primary text-primary-foreground` - 主要アクション
- Secondary: `bg-secondary text-secondary-foreground` - 補助アクション  
- Outline: `border border-input` - 取り消し、戻る
- Ghost: `hover:bg-accent` - アイコンボタン、軽微なアクション

### テーブル・リスト
- ヘッダー: `bg-muted` で区別
- 行間: 適度な`py-2`以上で読みやすさ確保
- ホバー: `hover:bg-muted/50`
- 選択: `bg-accent`

### フォーム
- 入力欄背景: `bg-input-background` 
- フォーカス: `focus:ring-2 focus:ring-ring`
- エラー: `border-destructive`でアウトライン表示（背景色なし）

## 全ページ共通 色使用ルール

### 優先順位と使い分け
1. **店舗識別** (最優先): 全てのデータ表示で店舗を色で識別
2. **公演カテゴリ** (高優先): スケジュール、予約、売上等で公演種別を色分け
3. **ステータス** (中優先): アクション結果、データ状態の表示
4. **システム** (基本): UI基盤となる基本色

### 複合表示のルール
同一要素で複数の色分けが必要な場合：
```jsx
// 店舗色を最優先（背景）+ カテゴリ色をバッジで表現
<Card className="bg-blue-50 border-blue-200"> {/* 店舗色 */}
  <Badge className="bg-purple-100 text-purple-800">貸切公演</Badge> {/* カテゴリ色 */}
</Card>

// または店舗アイコン + カテゴリ背景
<div className="bg-orange-50 border-orange-200"> {/* カテゴリ色 */}
  <div className="w-3 h-3 bg-blue-500 rounded-full"></div> {/* 店舗色ドット */}
</div>
```

### 淡い色調の維持
- **背景色**: 必ず `*-50` (最も淡い) を使用
- **境界線**: `*-200` で上品な区切りを表現
- **テキスト**: `*-800` で十分なコントラストを確保
- **アクセント**: `*-100` でほんのり強調

## 情報表示パターン

### ステータス表示
- Badge形式で統一
- 背景色は薄く、テキストはコントラスト確保
- 例: `bg-green-100 text-green-800`

### 数値・統計
- 大きな数字は`text-lg`以上
- 単位や説明は`text-muted-foreground`
- 増減は色で表現（緑=増加、赤=減少）

### 警告・通知
- 背景色は使わず`border-2`でアウトライン表示
- アイコンで種別を明示
- `text-destructive`, `text-warning`等でテキスト色のみ使用

## レイアウト

### 間隔
- セクション間: `space-y-6`
- コンポーネント間: `space-y-4`  
- 要素間: `gap-2`〜`gap-4`

### グリッド・レスポンシブ
- メインコンテンツ: `container mx-auto px-4`
- カード配置: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- タブレット・モバイル対応必須

## インタラクション

### ホバー効果
- 軽微な色変化、過度なアニメーションは避ける
- `hover:bg-muted/50`, `hover:bg-accent`
- カーソル: `cursor-pointer`で明示

### フォーカス
- キーボードナビゲーション対応
- `focus:ring-2 focus:ring-ring focus:ring-offset-2`

### ローディング
- スケルトン表示推奨
- スピナーは最小限
- `animate-pulse`でプレースホルダー

## 店舗管理特有のルール

### 店舗別表示
- 店舗名には必ず識別色のドットやバッジを付与
- 店舗フィルターでは色分けを活用
- 店舗切り替え時は視覚的フィードバック必須

### データテーブル
- ソート可能カラムには矢印アイコン
- ページネーション必須（大量データ対応）
- 行選択時は`bg-accent`で強調

### タブナビゲーション  
- アクティブタブは`bg-background`で明示
- アイコン + テキストの組み合わせ
- モバイルでは必要に応じて省略

## 使用例とベストプラクティス

### 公演カテゴリの表示例
```jsx
// Badge使用例
<Badge className="bg-blue-100 text-blue-800">オープン公演</Badge>
<Badge className="bg-purple-100 text-purple-800">貸切公演</Badge>
<Badge className="bg-orange-100 text-orange-800">GMテスト</Badge>
<Badge className="bg-yellow-100 text-yellow-800">テストプレイ</Badge>
<Badge className="bg-green-100 text-green-800">出張公演</Badge>

// Card使用例  
<Card className="bg-purple-50 border-purple-200 text-purple-800">
  <CardHeader>
    <CardTitle>貸切公演の詳細</CardTitle>
  </CardHeader>
  <CardContent>
    プライベート公演の内容...
  </CardContent>
</Card>
```

### 店舗 + カテゴリの複合表示
```jsx
// 推奨パターン1: 店舗背景 + カテゴリバッジ
<Card className="bg-blue-50 border-blue-200"> {/* 高田馬場店 */}
  <div className="flex items-center gap-2">
    <h3>高田馬場店</h3>
    <Badge className="bg-purple-100 text-purple-800">貸切公演</Badge>
  </div>
</Card>

// 推奨パターン2: カテゴリ背景 + 店舗ドット
<Card className="bg-orange-50 border-orange-200"> {/* GMテスト */}
  <div className="flex items-center gap-2">
    <div className="w-3 h-3 bg-blue-500 rounded-full"></div> {/* 高田馬場店 */}
    <span>GMテスト</span>
  </div>
</Card>
```

## 避けるべき表現
- 過度な装飾やグラデーション
- 派手な色使い（ゲーム業界だがB2B管理画面として節度を保つ）
- 複雑なアニメーション
- 小さすぎるクリック領域（最低44px確保）
- 背景色による警告表示（アウトライン表示を使用）
- 濃い背景色（`*-100`以上は避ける、`*-50`を基本とする）

## 新規開発者向けクイックチェック

### 実装前の必須確認
1. **色指定**: 店舗識別色・公演カテゴリ色を正確に使用しているか？
2. **タイポグラフィ**: `text-*`, `font-*`, `leading-*`クラスを使用していないか？
3. **ShadCNオーバーライド**: デフォルトスタイリングをGuidelines色で上書きしているか？
4. **レスポンシブ**: `container mx-auto px-4` + `space-y-6`を使用しているか？
5. **淡い色調**: 背景*-50、境界線*-200、テキスト*-800を維持しているか？

### デバッグ・品質確認
- **色の一貫性**: 同じ店舗・カテゴリで色が統一されているか？
- **コントラスト**: テキストの可読性は十分か？
- **アクセシビリティ**: フォーカス状態・ホバー状態が適切か？
- **モバイル対応**: 小画面でのレイアウト崩れはないか？

## Tailwind V4 + globals.css連携システム

### 高度な制約システムの理解
```css
/* globals.cssの天才的な仕組み */
:where(:not(:has([class*=" text-"]), :not(:has([class^="text-"])))) {
  /* この条件により、text-*クラスを使わない限り自動適用 */
  h2 { font-size: var(--text-xl); font-weight: var(--font-weight-medium); }
}
```

この制約により：
- ✅ **自動美化**: 何もしなくても美しいタイポグラフィ
- ✅ **デザイン保護**: 勝手にフォントサイズを変更できない
- ✅ **一貫性保証**: 全ページで統一されたタイポグラフィ

### CSS変数の活用（高度）
```jsx
// 特殊なケースでのCSS変数使用例
<div style={{ 
  fontSize: 'var(--text-2xl)', 
  fontWeight: 'var(--font-weight-medium)',
  color: 'var(--color-blue-800)' 
}}>
  カスタムタイトル
</div>
```

## 色システムの拡張ルール

### 新しいカテゴリ追加時
1. 既存の5色（blue, purple, orange, yellow, green）と被らない色を選択
2. 必ず `*-50`, `*-100`, `*-200`, `*-800` の組み合わせを使用
3. 全ページで一貫して使用すること
4. デザインガイドラインに追加すること

### 色の濃度統一
- 背景: 常に `*-50` (最も淡い)
- Badge: 常に `*-100` (淡い) + `*-800` (濃いテキスト)  
- 境界線: 常に `*-200` (薄い境界線)
- アクセント: 常に `*-300` (中間の強調)

🎯 マーダーミステリー店舗管理システム 統合デザイン優先度指示書

📋 デザインシステム全体優先度ランキング

```
🏆 レベル1: Guidelines.md デザインシステム（絶対最優先）
   ├─ 店舗識別色システム（6店舗）
   ├─ 公演カテゴリ色システム（5カテゴリ）
   ├─ 淡い色調システム（*-50, *-100, *-200, *-800）
   └─ ブランドアイデンティティ

🎨 レベル2: globals.css 制約・自動化システム（保護機能）
   ├─ Tailwind V4高度制約システム
   ├─ タイポグラフィ自動適用
   ├─ コンポーネント統一クラス
   └─ 品質保証機能

🔧 レベル3: 明示的Tailwindクラス（補完機能）
   ├─ レイアウト調整（space-y-, gap-）
   ├─ レスポンシブ対応（md:, lg:）
   ├─ インタラクション（hover:, focus:）
   └─ Guidelines非対応領域のみ

📦 レベル4: ShadCN UI デフォルト（必ず上書き対象）
   ├─ 基盤コンポーネント提供
   ├─ デフォルトスタイリング（危険）
   ├─ TypeScript型定義
   └─ アクセシビリティ基盤
```

🎯 全コンポーネント共通実装指針

🏪 店舗・会場表示ルール（全ページ必須）
```
任意の店舗情報表示時：
├─ 背景色: Guidelines.md店舗色 bg--50 border--200
├─ バッジ: Guidelines.md店舗色 bg--100 text--800  
├─ テキスト: 店舗名は必ず識別色で視覚的強調
└─ 一貫性: 全10タブで同一店舗は同一色を維持
```

🎭 公演カテゴリ表示ルール（全ページ必須）
```
任意の公演カテゴリ表示時：
├─ バッジ: Guidelines.md指定色で必ず明示的指定
├─ カード: カテゴリ背景色 bg--50 border--200
├─ 優先度: 店舗色と競合時は用途により使い分け
└─ 統一性: 同一カテゴリは全ページで同一視覚表現
```

📝 タイポグラフィルール（全ページ必須）
```
任意のテキスト表示時：
├─ 基本原則: text-, font-, leading-*クラス使用禁止
├─ 自動適用: h1, h2, h3, p, label要素は何もしない
├─ 例外処理: 特殊ケースのみCSS変数使用
└─ 品質保証: globals.css制約システムに依存
```

⚡ 競合解決フローチャート

```
デザイン実装時の判断フロー：

Guidelines.mdに該当する色・スタイルはあるか？
   YES → Guidelines.md指定を最優先で適用
   NO  → 次へ

globals.cssで自動適用される要素か？
   YES → 何もせず自動適用に任せる
   NO  → 次へ

レイアウト・間隔・インタラクションの調整が必要か？
   YES → 必要最小限のTailwindクラスを使用
   NO  → 次へ

ShadCN UIデフォルトが残っているか？
   YES → 必ず明示的にオーバーライド
   NO  → 実装完了
```

🔥 技術スタック別役割分担

📋 Guidelines.md（デザインシステムの核）
```
責任範囲：
├─ ブランドアイデンティティの維持
├─ 色システムの統一（店舗・カテゴリ）
├─ 淡い色調による上品さの保持
├─ 全10タブでの一貫性確保
└─ B2B管理画面としての信頼性

実装時の絶対ルール：
店舗・カテゴリ色は必ず指定通りに使用
他の技術スタックより常に最優先
新機能追加時も既存色システムを拡張
```

🎨 globals.css（品質保証システム）
```
責任範囲：
├─ タイポグラフィの自動美化
├─ デザイン制約による品質保証
├─ コンポーネント統一スタイル
├─ Tailwind V4高度機能の活用
└─ 保守性・一貫性の確保

実装時の活用方針：
text-*クラス使用禁止の徹底遵守
新規クラス追加時は@layer componentsを使用
既存の統一クラス（.schedule-table-cell等）を積極活用
```

🔧 Tailwind CSS（柔軟な調整ツール）
```
責任範囲：
├─ レイアウト・間隔の調整
├─ レスポンシブデザインの実装
├─ ホバー・フォーカス等のインタラクション
├─ Guidelines対象外領域の補完
└─ ユーティリティクラスによる効率化

使用制限：
フォント関連クラス（text-, font-, leading-*）は禁止
Guidelines色システム対象はTailwindで指定禁止
必要最小限の使用に留める
```

📦 ShadCN UI（基盤コンポーネント）
```
責任範囲：
├─ プロ品質のコンポーネント基盤
├─ TypeScript完全対応
├─ アクセシビリティ内蔵機能
├─ 高度なインタラクション
└─ 開発効率の向上

危険性と対策：
デフォルトスタイリングは必ず上書き
Guidelines色を明示的に指定
特にBadge, Card, TabsTriggerは要注意
```

📊 実装パターン別指示

🎪 Pattern A: 店舗メイン表示
```jsx
// 店舗背景 + カテゴリバッジパターン
<Card className="bg-blue-50 border-blue-200">  {/* Guidelines店舗色 */}
  <CardHeader>
    <CardTitle>高田馬場店</CardTitle>  {/* globals.css自動適用 */}
  </CardHeader>
  <CardContent className="space-y-4">  {/* Tailwindレイアウト */}
    <Badge className="bg-purple-100 text-purple-800">  {/* Guidelinesカテゴリ色 */}
      貸切公演
    </Badge>
  </CardContent>
</Card>
```

🎭 Pattern B: カテゴリメイン表示
```jsx
// カテゴリ背景 + 店舗バッジパターン
<Card className="bg-purple-50 border-purple-200">  {/* Guidelinesカテゴリ色 */}
  <CardHeader>
    <div className="flex items-center gap-2">
      <Badge className="bg-blue-100 text-blue-800">高田馬場店</Badge>  {/* Guidelines店舗色 */}
      <CardTitle>貸切公演詳細</CardTitle>  {/* globals.css自動適用 */}
    </div>
  </CardHeader>
</Card>
```

🔄 Pattern C: ニュートラル表示
```jsx
// 基本背景 + ダブルバッジパターン
<Card className="bg-card border-border">  {/* ShadCNデフォルト活用 */}
  <CardContent className="p-4 space-y-2">  {/* Tailwindレイアウト */}
    <div className="flex items-center gap-2">
      <Badge className="bg-blue-100 text-blue-800">高田馬場店</Badge>
      <Badge className="bg-purple-100 text-purple-800">貸切公演</Badge>
    </div>
    <h3>イベント詳細</h3>  {/* globals.css自動適用 */}
  </CardContent>
</Card>
```

🚨 よくある競合と解決策

❌ 危険パターン1: ShadCNデフォルト依存
```jsx
// 問題のあるコード
<Badge>カテゴリ</Badge>  // グレーになってしまう
<Card>内容</Card>        // 白背景で識別不可

// 正しい解決法
<Badge className="bg-purple-100 text-purple-800">貸切公演</Badge>
<Card className="bg-blue-50 border-blue-200">高田馬場店</Card>
```

❌ 危険パターン2: globals.css制約違反
```jsx
// 問題のあるコード  
<h2 className="text-xl font-bold">タイトル</h2>  // 制約システム破綻

// 正しい解決法
<h2>タイトル</h2>  // 自動で美しいタイポグラフィが適用
```

❌ 危険パターン3: Guidelines色システム無視
```jsx
// 問題のあるコード
<div className="bg-red-100">高田馬場店</div>  // 間違った色

// 正しい解決法  
<div className="bg-blue-50 border-blue-200">高田馬場店</div>  // Guidelines準拠
```

🎯 10タブ統合運用指針

📅 スケジュール・予約・売上系タブ
```
共通ルール：
├─ 公演データは必ずカテゴリ色で識別
├─ 店舗データは必ず店舗色で識別  
├─ テーブル・カレンダーは統一レイアウト
└─ 数値・統計は見やすさ最優先
```

👥 スタッフ・顧客・在庫系タブ
```
共通ルール：
├─ 人物データは店舗色で所属表示
├─ ステータスは状態色システム活用
├─ フォーム・ダイアログは統一デザイン  
└─ 検索・フィルタは使いやすさ重視
```

🏪 店舗・ライセンス・開発系タブ
```
共通ルール：
├─ 管理データは機能的な色分け
├─ 設定項目は分かりやすいグルーピング
├─ 権限・セキュリティ情報は明確な表示
└─ 技術情報は可読性を最重視
```

✅ 新規開発者向けクイックガイド

🔍 実装前チェックリスト
```
□ Guidelines.mdの該当する色システムを確認済み
□ globals.cssの自動適用要素かどうか確認済み
□ ShadCN UIコンポーネントのオーバーライド計画済み
□ レスポンシブ対応（container mx-auto px-4）計画済み
□ 他の9タブとの一貫性を考慮済み
```

⚡ 困った時の解決手順
```
Guidelines.md検索: 該当する色・スタイルを探す
globals.css確認: 自動適用される要素か確認
既存コード参照: 他タブの類似実装を確認
ShadCNオーバーライド: 明示的クラス指定で上書き
テスト確認: 全画面サイズでの表示確認
```

🎨 最終的な実装方針

あなたのマーダーミステリー店舗管理システムでは、`Guidelines.md絶対優先システム`により、10タブ全体で統一された美しく機能的なデザインシステムを実現します。

Guidelines.md: デザインの魂・ブランドの核心
globals.css: 品質の守護神・一貫性の保証
Tailwind: 柔軟な調整・効率的な実装  
ShadCN UI: 強固な基盤・プロ品質の提供

この優先度システムにより、新規開発者も迷うことなく、既存の美しいデザインクオリティを維持・発展させることができます🎯

この色システムは **全ページ共通** で使用し、マーダーミステリー店舗管理システム全体の **統一されたブランドアイデンティティ** を維持してください。