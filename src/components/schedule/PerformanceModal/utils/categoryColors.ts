// カテゴリごとの色設定

export const categoryColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  private: 'bg-purple-100 text-purple-800',
  gmtest: 'bg-orange-100 text-orange-800',
  testplay: 'bg-yellow-100 text-yellow-800',
  offsite: 'bg-green-100 text-green-800',
  venue_rental: 'bg-pink-100 text-pink-800',
  venue_rental_free: 'bg-gray-100 text-gray-800',
  package: 'bg-indigo-100 text-indigo-800'
}

export const categoryLabels: Record<string, string> = {
  open: 'オープン公演',
  private: '貸切公演',
  gmtest: 'GMテスト',
  testplay: 'テストプレイ',
  offsite: '出張公演',
  venue_rental: '会場貸切（有料）',
  venue_rental_free: '会場貸切（無料）',
  package: 'パッケージ'
}

