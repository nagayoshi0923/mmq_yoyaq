// Generic type for most pages
export interface PageItem {
  title: string
  subtitle?: string
  body?: string
  scene?: string          // "シーン: ..." intro box text
  bullets?: string[]      // unordered list
  orderedBullets?: string[] // ordered/numbered list
  note?: string
  noteType?: 'warning' | 'info' | 'caution' | 'success'
}

export interface PageSection {
  heading: string
  intro?: string
  items: PageItem[]
}

export interface HardcodedPageContent {
  description: string
  sections: PageSection[]
}

// CouponTypeManual specific
export interface CouponScopeItem {
  label: string
  disabled?: boolean
}

export interface CouponTypeNote {
  type: 'info' | 'warning' | 'caution'
  text: string
}

export interface CouponTypeItem {
  title: string
  scopes: CouponScopeItem[]
  steps: string[]
  notes: CouponTypeNote[]
}

export interface CouponTypePageContent {
  description: string
  coupons: CouponTypeItem[]
}
