import { db, type EntityKind } from './db.ts'
import { isUuid } from '../lib/id.ts'
import { isVirtualId } from '../sync/planner.ts'
import { utcNowIso } from '../sync/time.ts'

export type { EntityKind }

export type QueueItem = {
  entity: EntityKind
  entityId: string
}

function queueKey(ownerId: string, entity: EntityKind, entityId: string): string {
  return `${entity}:${ownerId}:${entityId}`
}

export async function enqueue(ownerId: string, entity: EntityKind, entityId: string): Promise<void> {
  if (!isUuid(ownerId) || !isUuid(entityId) || isVirtualId(entityId)) return
  await db.syncQueue.put({
    id: queueKey(ownerId, entity, entityId),
    ownerId,
    entity,
    entityId,
    queuedAt: utcNowIso(),
  })
}

export async function drainQueue(ownerId: string): Promise<QueueItem[]> {
  const entries = await db.syncQueue.where('ownerId').equals(ownerId).toArray()
  const seen = new Set<string>()
  const items: QueueItem[] = []
  for (const entry of entries) {
    if (!isUuid(entry.entityId) || isVirtualId(entry.entityId)) continue
    const key = `${entry.entity}:${entry.entityId}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ entity: entry.entity, entityId: entry.entityId })
  }
  await db.syncQueue.bulkDelete(entries.map((entry) => entry.id))
  return items
}

export async function requeue(ownerId: string, items: readonly QueueItem[]): Promise<void> {
  const now = utcNowIso()
  const rows = items
    .filter((item) => isUuid(item.entityId) && !isVirtualId(item.entityId))
    .map((item) => ({
      id: queueKey(ownerId, item.entity, item.entityId),
      ownerId,
      entity: item.entity,
      entityId: item.entityId,
      queuedAt: now,
    }))
  if (rows.length === 0) return
  await db.syncQueue.bulkPut(rows)
}
