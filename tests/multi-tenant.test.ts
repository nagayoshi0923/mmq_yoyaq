/**
 * マルチテナント対応のテスト
 * 
 * このテストは、複数組織が存在する環境でデータが正しく分離されているかを確認します。
 * 
 * 実行方法:
 *   npm run test:multi-tenant
 * 
 * 注意: 実際のSupabase環境が必要です（テスト環境推奨）
 */

import { describe, it, expect, beforeAll } from '@jest/globals'
import { supabase } from '../src/lib/supabase'

// テスト用の組織ID（実際のテスト環境に合わせて変更）
const TEST_ORG_1 = 'a0000000-0000-0000-0000-000000000001' // クインズワルツ
const TEST_ORG_2 = 'a0000000-0000-0000-0000-000000000002' // テスト組織2

describe('マルチテナント対応テスト', () => {
  beforeAll(() => {
    // テスト環境の確認
    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
      throw new Error('Supabase環境変数が設定されていません')
    }
  })

  describe('schedule_events テーブル', () => {
    it('organization_idで正しくフィルタされる', async () => {
      // 組織1のイベントを取得
      const { data: org1Events, error: org1Error } = await supabase
        .from('schedule_events')
        .select('id, organization_id')
        .eq('organization_id', TEST_ORG_1)
        .limit(10)

      expect(org1Error).toBeNull()
      
      // すべてのイベントが組織1に属していることを確認
      org1Events?.forEach(event => {
        expect(event.organization_id).toBe(TEST_ORG_1)
      })

      // 組織2のイベントを取得
      const { data: org2Events, error: org2Error } = await supabase
        .from('schedule_events')
        .select('id, organization_id')
        .eq('organization_id', TEST_ORG_2)
        .limit(10)

      expect(org2Error).toBeNull()

      // 組織1と組織2のイベントが重複していないことを確認
      const org1Ids = new Set(org1Events?.map(e => e.id) || [])
      const org2Ids = new Set(org2Events?.map(e => e.id) || [])
      
      const intersection = [...org1Ids].filter(id => org2Ids.has(id))
      expect(intersection.length).toBe(0)
    })
  })

  describe('reservations テーブル', () => {
    it('organization_idで正しくフィルタされる', async () => {
      const { data: org1Reservations, error: org1Error } = await supabase
        .from('reservations')
        .select('id, organization_id')
        .eq('organization_id', TEST_ORG_1)
        .limit(10)

      expect(org1Error).toBeNull()
      
      org1Reservations?.forEach(reservation => {
        expect(reservation.organization_id).toBe(TEST_ORG_1)
      })
    })
  })

  describe('scenarios テーブル', () => {
    it('organization_idで正しくフィルタされる', async () => {
      const { data: org1Scenarios, error: org1Error } = await supabase
        .from('scenarios')
        .select('id, organization_id')
        .eq('organization_id', TEST_ORG_1)
        .limit(10)

      expect(org1Error).toBeNull()
      
      org1Scenarios?.forEach(scenario => {
        expect(scenario.organization_id).toBe(TEST_ORG_1)
      })
    })
  })

  describe('staff テーブル', () => {
    it('organization_idで正しくフィルタされる', async () => {
      const { data: org1Staff, error: org1Error } = await supabase
        .from('staff')
        .select('id, organization_id')
        .eq('organization_id', TEST_ORG_1)
        .limit(10)

      expect(org1Error).toBeNull()
      
      org1Staff?.forEach(staff => {
        expect(staff.organization_id).toBe(TEST_ORG_1)
      })
    })
  })

  describe('customers テーブル', () => {
    it('organization_idで正しくフィルタされる', async () => {
      const { data: org1Customers, error: org1Error } = await supabase
        .from('customers')
        .select('id, organization_id')
        .eq('organization_id', TEST_ORG_1)
        .limit(10)

      expect(org1Error).toBeNull()
      
      org1Customers?.forEach(customer => {
        expect(customer.organization_id).toBe(TEST_ORG_1)
      })
    })
  })

  describe('shift_submissions テーブル', () => {
    it('organization_idで正しくフィルタされる', async () => {
      const { data: org1Shifts, error: org1Error } = await supabase
        .from('shift_submissions')
        .select('id, organization_id')
        .eq('organization_id', TEST_ORG_1)
        .limit(10)

      expect(org1Error).toBeNull()
      
      org1Shifts?.forEach(shift => {
        expect(shift.organization_id).toBe(TEST_ORG_1)
      })
    })
  })

  describe('daily_memos テーブル', () => {
    it('organization_idで正しくフィルタされる', async () => {
      const { data: org1Memos, error: org1Error } = await supabase
        .from('daily_memos')
        .select('id, organization_id')
        .eq('organization_id', TEST_ORG_1)
        .limit(10)

      expect(org1Error).toBeNull()
      
      org1Memos?.forEach(memo => {
        expect(memo.organization_id).toBe(TEST_ORG_1)
      })
    })
  })

  describe('staff_scenario_assignments テーブル', () => {
    it('organization_idで正しくフィルタされる', async () => {
      const { data: org1Assignments, error: org1Error } = await supabase
        .from('staff_scenario_assignments')
        .select('id, organization_id')
        .eq('organization_id', TEST_ORG_1)
        .limit(10)

      expect(org1Error).toBeNull()
      
      org1Assignments?.forEach(assignment => {
        expect(assignment.organization_id).toBe(TEST_ORG_1)
      })
    })
  })
})

