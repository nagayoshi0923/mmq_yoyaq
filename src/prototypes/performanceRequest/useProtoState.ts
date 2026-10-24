import { useCallback, useSyncExternalStore } from 'react'
import { PROTO_STORAGE_KEY, readProtoState, subscribeProtoState, updateProtoState, type ProtoState } from './storage'

let cachedRaw: string | null = null
let cachedState: ProtoState = readProtoState()

function snapshot(): ProtoState {
  let raw: string | null = null
  try { raw = window.localStorage.getItem(PROTO_STORAGE_KEY) } catch { raw = null }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedState = readProtoState()
  }
  return cachedState
}

/** 試作の保存内容（このブラウザの localStorage）を読む。別のタブの変更も反映する */
export function useProtoState(): [ProtoState, (fn: (prev: ProtoState) => ProtoState) => void] {
  const state = useSyncExternalStore(subscribeProtoState, snapshot, snapshot)
  const update = useCallback((fn: (prev: ProtoState) => ProtoState) => { updateProtoState(fn) }, [])
  return [state, update]
}
