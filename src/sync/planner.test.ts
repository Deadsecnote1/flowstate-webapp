import { describe, expect, it } from 'vitest'
import type { PlanTask } from '../types/planner.ts'
import { applyRemotePlanner, isVirtualId, tasksForDay } from './planner.ts'

const ownerId = '22222222-2222-4222-8222-222222222222'

function plan(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ownerId,
    title: 'Wake up',
    date: '2026-09-01',
    start_min: 480,
    end_min: 481,
    all_day: false,
    notes: '',
    completed: false,
    repeat: 'daily',
    color: 'coral',
    created_at: '2026-09-01T00:00:00.000Z',
    client_updated_at: '2026-09-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('planner virtual copies', () => {
  it('shows a daily task on a later day as virt-* only', () => {
    const shown = tasksForDay([plan()], '2026-09-03')
    expect(shown).toHaveLength(1)
    expect(isVirtualId(shown[0].id)).toBe(true)
    expect(shown[0].id).toBe(`virt-${plan().id}-2026-09-03`)
    expect(shown[0].completed).toBe(false)
  })

  it('does not store or apply virt-* ids from the server', () => {
    const { applied, items } = applyRemotePlanner([], { id: 'virt-abc-2026-09-03', title: 'Nope' }, ownerId)
    expect(applied).toBe(false)
    expect(items).toEqual([])
  })

  it('maps task_date onto the local date field', () => {
    const { applied, items } = applyRemotePlanner(
      [],
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Focus',
        task_date: '2026-09-07',
        start_min: 540,
        end_min: 600,
        client_updated_at: '2026-09-07T00:00:00+00:00',
      },
      ownerId,
    )
    expect(applied).toBe(true)
    expect(items[0].date).toBe('2026-09-07')
  })
})
