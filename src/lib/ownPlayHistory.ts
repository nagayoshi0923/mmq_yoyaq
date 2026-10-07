import { customerPlayHistory } from './customerPlayHistory'

export async function snapshotAllCustomers(customerIds: string[]) {
  const snapshots = await Promise.all([...new Set(customerIds)].map(id => customerPlayHistory.snapshot(id)))
  return { can_edit: snapshots.every(snapshot => snapshot.can_edit), manual: snapshots.flatMap(snapshot => snapshot.manual), overrides: snapshots.flatMap(snapshot => snapshot.overrides) }
}
export async function findManualHistoryOwner(customerIds: string[], manualId: string) {
  const ids = [...new Set(customerIds)]
  const snapshots = await Promise.all(ids.map(id => customerPlayHistory.snapshot(id)))
  const index = snapshots.findIndex(snapshot => snapshot.manual.some(row => row.id === manualId))
  return index < 0 ? null : ids[index]
}

export async function updateOwnManualDate(customerIds: string[], manualId: string, playedAt: string) {
  const owner = await findManualHistoryOwner(customerIds, manualId)
  if (!owner) throw new Error('ご本人の手動履歴が見つかりません')
  return customerPlayHistory.updateDate(owner, manualId, playedAt)
}
