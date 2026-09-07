import { useEffect, useState, type FormEvent } from 'react'
import { addDays, formatClock, formatDayLabel, minutesToTimeInput, timeInputToMinutes, todayKey } from '../lib/dates.ts'
import {
  addInboxItem,
  addPlanTask,
  deleteInboxItem,
  deletePlanTask,
  listInbox,
  listPlannerTasks,
  savePlanTask,
  togglePlanTask,
} from '../db/planner.ts'
import { isVirtualId, tasksForDay } from '../sync/planner.ts'
import type { InboxItem, PlanColor, PlanTask } from '../types/planner.ts'

const HOURS = Array.from({ length: 18 }, (_, index) => index + 6)

export function PlannerPage({
  ownerId,
  revision,
  onEdited,
}: {
  ownerId: string
  revision: number
  onEdited: () => void
}) {
  const [day, setDay] = useState(todayKey())
  const [tasks, setTasks] = useState<PlanTask[]>([])
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [inboxDraft, setInboxDraft] = useState('')
  const [editing, setEditing] = useState<PlanTask | null>(null)

  async function reload() {
    setTasks(await listPlannerTasks(ownerId))
    setInbox(await listInbox(ownerId))
  }

  useEffect(() => {
    void reload()
  }, [ownerId, revision])

  const shown = tasksForDay(tasks, day)
  const allDay = shown.filter((task) => task.all_day)
  const timed = shown.filter((task) => !task.all_day)

  async function onInbox(event: FormEvent) {
    event.preventDefault()
    const created = await addInboxItem(ownerId, inboxDraft)
    if (!created) return
    setInboxDraft('')
    onEdited()
  }

  return (
    <section className="planner">
      <aside className="inbox">
        <h2>Inbox</h2>
        <form onSubmit={(event) => void onInbox(event)}>
          <input
            value={inboxDraft}
            onChange={(event) => setInboxDraft(event.target.value)}
            placeholder="Add a new inbox task..."
            aria-label="New inbox item"
          />
        </form>
        {inbox.length === 0 ? <p className="empty">Inbox is empty</p> : null}
        <ul className="task-list">
          {inbox.map((item) => (
            <li key={item.id} className="task">
              <span className="title">{item.title}</span>
              <button
                type="button"
                onClick={() => {
                  void addPlanTask(ownerId, { title: item.title, date: day }).then(() =>
                    deleteInboxItem(ownerId, item.id),
                  ).then(onEdited)
                }}
              >
                Schedule
              </button>
              <button
                type="button"
                className="delete"
                onClick={() => {
                  void deleteInboxItem(ownerId, item.id).then(onEdited)
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="day">
        <div className="day-nav">
          <button type="button" onClick={() => setDay((value) => addDays(value, -1))}>
            Previous
          </button>
          <button type="button" onClick={() => setDay(todayKey())}>
            {formatDayLabel(day)}
          </button>
          <button type="button" onClick={() => setDay((value) => addDays(value, 1))}>
            Next
          </button>
          <button
            type="button"
            onClick={() => {
              void addPlanTask(ownerId, { title: 'New task', date: day }).then((created) => {
                if (created) setEditing(created)
                onEdited()
              })
            }}
          >
            Add task
          </button>
        </div>

        {allDay.length > 0 ? (
          <div className="all-day">
            {allDay.map((task) => (
              <button key={task.id} type="button" className={`block color-${task.color}`} onClick={() => setEditing(task)}>
                {task.title}
              </button>
            ))}
          </div>
        ) : null}

        <div className="timeline">
          {HOURS.map((hour) => (
            <div key={hour} className="hour">
              <span>{formatClock(hour * 60)}</span>
              <div className="hour-body">
                <button
                  type="button"
                  className="hour-hit"
                  aria-label={`Add task at ${formatClock(hour * 60)}`}
                  onClick={() => {
                    void addPlanTask(ownerId, {
                      title: 'New task',
                      date: day,
                      start_min: hour * 60,
                      end_min: hour * 60 + 60,
                    }).then((created) => {
                      if (created) setEditing(created)
                      onEdited()
                    })
                  }}
                />
                {timed
                  .filter((task) => Math.floor(task.start_min / 60) === hour)
                  .map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className={`block color-${task.color}${task.completed ? ' done' : ''}`}
                      onClick={() => setEditing(task)}
                    >
                      {formatClock(task.start_min)} {task.title}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing ? (
        <PlanEditor
          key={editing.id}
          task={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            void savePlanTask(ownerId, next).then(() => {
              setEditing(null)
              onEdited()
            })
          }}
          onDelete={() => {
            void deletePlanTask(ownerId, editing.id).then(() => {
              setEditing(null)
              onEdited()
            })
          }}
          onToggle={() => {
            void togglePlanTask(ownerId, editing).then(() => {
              setEditing(null)
              onEdited()
            })
          }}
        />
      ) : null}
    </section>
  )
}

function PlanEditor({
  task,
  onClose,
  onSave,
  onDelete,
  onToggle,
}: {
  task: PlanTask
  onClose: () => void
  onSave: (task: PlanTask) => void
  onDelete: () => void
  onToggle: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [date, setDate] = useState(task.date)
  const [allDay, setAllDay] = useState(task.all_day)
  const [start, setStart] = useState(minutesToTimeInput(task.start_min))
  const [end, setEnd] = useState(minutesToTimeInput(task.end_min))
  const [daily, setDaily] = useState(task.repeat === 'daily')
  const [color, setColor] = useState<PlanColor>(task.color)
  const [notes, setNotes] = useState(task.notes)
  const virtual = isVirtualId(task.id)

  return (
    <aside className="editor">
      <div className="editor-head">
        <strong>{virtual ? 'Daily copy' : 'Task'}</strong>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {virtual ? <p className="empty">Saving creates a real task for this day. The repeat stays on its start date.</p> : null}
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Date
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
        All-day
      </label>
      <div className="time-pair">
        <label>
          Start
          <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label>
          End
          <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={daily} onChange={(event) => setDaily(event.target.checked)} />
        Daily
      </label>
      <label>
        Color
        <select value={color} onChange={(event) => setColor(event.target.value as PlanColor)}>
          <option value="coral">Coral</option>
          <option value="blue">Blue</option>
          <option value="green">Green</option>
        </select>
      </label>
      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
      </label>
      <div className="editor-actions">
        <button
          type="button"
          onClick={() => {
            const startMin = timeInputToMinutes(start)
            onSave({
              ...task,
              title: title.trim() || 'New task',
              date,
              all_day: allDay,
              start_min: startMin,
              end_min: Math.max(timeInputToMinutes(end), startMin + 1),
              repeat: daily ? 'daily' : 'none',
              color,
              notes,
            })
          }}
        >
          Save
        </button>
        <button type="button" onClick={onToggle}>
          {task.completed ? 'Mark active' : 'Mark done'}
        </button>
        <button type="button" className="delete" onClick={onDelete} disabled={virtual}>
          Delete
        </button>
      </div>
    </aside>
  )
}
