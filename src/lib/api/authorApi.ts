/**
 * 作者関連API
 */
import { supabase } from '../supabase'

export interface Author {
  id: string
  name: string
  email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export const authorApi = {
  // 全作者を取得
  async getAll(): Promise<Author[]> {
    const { data, error } = await supabase
      .from('authors')
      .select('*')
      .order('name', { ascending: true })
    
    if (error) {
      // テーブルが存在しない場合は空配列を返す
      if (error.code === 'PGRST205' || error.code === 'PGRST116') {
        return []
      }
      throw error
    }
    return data || []
  },

  // 作者を名前で取得
  async getByName(name: string): Promise<Author | null> {
    const { data, error } = await supabase
      .from('authors')
      .select('*')
      .eq('name', name)
      .single()
    
    if (error) {
      // テーブルが存在しない場合、またはレコードが見つからない場合はnullを返す
      if (error.code === 'PGRST116' || error.code === 'PGRST205') {
        return null
      }
      throw error
    }
    return data
  },

  // 作者を作成
  async create(author: Omit<Author, 'id' | 'created_at' | 'updated_at'>): Promise<Author> {
    const { data, error } = await supabase
      .from('authors')
      .insert([author])
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 作者を更新
  async update(id: string, updates: Partial<Omit<Author, 'id' | 'created_at' | 'updated_at'>>): Promise<Author> {
    const { data, error } = await supabase
      .from('authors')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 名前で更新または作成（upsert）
  async upsertByName(name: string, updates: Partial<Omit<Author, 'id' | 'name' | 'created_at' | 'updated_at'>>): Promise<Author> {
    const existing = await this.getByName(name)
    
    if (existing) {
      return this.update(existing.id, updates)
    } else {
      // テーブルが存在しない場合はエラーを投げる（createでPGRST205が発生する）
      return this.create({
        name,
        ...updates,
        email: updates.email ?? null,
        notes: updates.notes ?? null
      })
    }
  },

  // 作者を削除
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('authors')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
}

