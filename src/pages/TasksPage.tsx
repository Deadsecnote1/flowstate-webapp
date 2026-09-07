import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { archiveCompletedTasks, listArchivedTasks } from '../db/archive.ts'
import { addTask, deleteTask, listVisibleTasks, toggleTask, updateTaskTitle } from '../db/tasks.ts'
import type { Task } from '../types/task.ts'

type FilterMode = 'all' | 'active' | 'done'

export function TasksPage({
  ownerId,
  revision,
  onEdited,
  searchRef,
}: {
  ownerId: string
  revision: number
  onEdited: () => void
  searchRef: { current: HTMLInputElement | null }
}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [archived, setArchived] = useState<{ id: string; title: string }[]>([])
  const [showArchive, setShowArchive] = useState(false)
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [query, setQuery] = useState('')

  async function reload() {
    setTasks(await listVisibleTasks(ownerId))
    setArchived(await listArchivedTasks(ownerId))
  }

  useEffect(() => {
    void reload()
  }, [ownerId, revision])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((task) => {
      if (filter === 'active' && task.completed) return false
      if (filter === 'done' && !task.completed) return false
      if (q && !task.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, filter, query])

  async function onAdd(event: FormEvent) {
    event.preventDefault()
    const created = await addTask(ownerId, draft)
    if (!created) return
    setDraft('')
    onEdited()
  }

  return (
    <section>
      <form className="add-row" onSubmit={(event) => void onAdd(event)}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a task"
          aria-label="New task"
        />
      </form>

      <div className="filters">
        {(['all', 'active', 'done'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={filter === mode ? 'chip active' : 'chip'}
            onClick={() => setFilter(mode)}
          >
            {mode === 'all' ? 'All' : mode === 'active' ? 'Active' : 'Done'}
          </button>
        ))}
        <input
          ref={searchRef}
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles"
          aria-label="Search tasks"
        />
      </div>

      {visible.length === 0 ? <p className="empty">No tasks</p> : null}

      <ul className="task-list">
        {visible.map((task) => (
          <TaskRow key={task.id} task={task} ownerId={ownerId} onEdited={onEdited} />
        ))}
      </ul>

      <div className="archive-row">
        <button
          type="button"
          onClick={() => {
            void archiveCompletedTasks(ownerId).then(() => onEdited())
          }}
        >
          Archive completed
        </button>
        <button type="button" className="chip" onClick={() => setShowArchive((open) => !open)}>
          {showArchive ? 'Hide archive' : `Archive (${archived.length})`}
        </button>
      </div>
      {showArchive ? (
        archived.length === 0 ? (
          <p className="empty">Nothing archived on this device</p>
        ) : (
          <ul className="task-list">
            {archived.map((item) => (
              <li key={item.id} className="task">
                <span className="title muted">{item.title}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}

function TaskRow({ task, ownerId, onEdited }: { task: Task; ownerId: string; onEdited: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)

  async function commit() {
    const next = title.trim()
    setEditing(false)
    if (!next || next === task.title) {
      setTitle(task.title)
      return
    }
    await updateTaskTitle(ownerId, task.id, next)
    onEdited()
  }

  return (
    <li className={task.completed ? 'task done' : 'task'}>
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => {
          void toggleTask(ownerId, task.id).then(onEdited)
        }}
        aria-label={`Complete ${task.title}`}
      />
      {editing ? (
        <input
          className="title-edit"
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit()
            if (event.key === 'Escape') {
              setTitle(task.title)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button type="button" className="title" onClick={() => setEditing(true)}>
          {task.title}
        </button>
      )}
      <button
        type="button"
        className="delete"
        onClick={() => {
          void deleteTask(ownerId, task.id).then(onEdited)
        }}
      >
        Delete
      </button>
    </li>
  )
}
