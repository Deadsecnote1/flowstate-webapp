import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task.ts'
import { applyRemoteTask, remoteIsNewer, visibleTasks } from './merge.ts'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Buy milk',
    completed: false,
    notes: '',
    created_at: '2026-09-01T00:00:00.000Z',
    client_updated_at: '2026-09-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('remoteIsNewer', () => {
  it('treats a later or equal remote timestamp as newer', () => {
    expect(
      remoteIsNewer('2026-09-01T00:00:00.000Z', {
        client_updated_at: '2026-09-02T00:00:00.000Z',
      }),
    ).toBe(true)
    expect(
      remoteIsNewer('2026-09-02T00:00:00.000Z', {
        client_updated_at: '2026-09-02T00:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('rejects a stale remote timestamp', () => {
    expect(
      remoteIsNewer('2026-09-03T00:00:00.000Z', {
        client_updated_at: '2026-09-02T00:00:00.000Z',
      }),
    ).toBe(false)
  })
})

describe('applyRemoteTask', () => {
  it('hides a task when a newer remote tombstone is applied', () => {
    const local = [task()]
    const { items, applied } = applyRemoteTask(local, {
      id: local[0].id,
      title: 'Buy milk',
      completed: false,
      notes: '',
      created_at: local[0].created_at,
      client_updated_at: '2026-09-02T12:00:00.000Z',
      deleted_at: '2026-09-02T12:00:00.000Z',
    })

    expect(applied).toBe(true)
    expect(items).toHaveLength(1)
    expect(items[0].deleted_at).toBe('2026-09-02T12:00:00.000Z')
    expect(visibleTasks(items)).toEqual([])
  })

  it('does not let a stale remote row clear a newer local delete', () => {
    const local = [
      task({
        deleted_at: '2026-09-04T00:00:00.000Z',
        client_updated_at: '2026-09-04T00:00:00.000Z',
      }),
    ]
    const { items, applied } = applyRemoteTask(local, {
      id: local[0].id,
      title: 'Buy milk',
      completed: false,
      notes: '',
      created_at: local[0].created_at,
      client_updated_at: '2026-09-03T00:00:00.000Z',
      deleted_at: null,
    })

    expect(applied).toBe(false)
    expect(items[0].deleted_at).toBe('2026-09-04T00:00:00.000Z')
    expect(visibleTasks(items)).toEqual([])
  })
})
