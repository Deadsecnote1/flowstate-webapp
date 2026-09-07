import { useEffect, useRef, useState } from 'react'
import { loadTimerSeconds, saveTimerSeconds } from '../db/clock.ts'

const PRESETS = [60, 300, 600, 1500]

function formatCountdown(totalMs: number): string {
  const total = Math.max(0, Math.floor(totalMs / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatStopwatch(totalMs: number): string {
  const total = Math.max(0, totalMs)
  const hours = Math.floor(total / 3600000)
  const minutes = Math.floor((total % 3600000) / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const centis = Math.floor((total % 1000) / 10)
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}

export function ClockPage({ ownerId }: { ownerId: string }) {
  const [mode, setMode] = useState<'timer' | 'stopwatch'>('timer')

  return (
    <section className="clock">
      <div className="filters">
        <button type="button" className={mode === 'timer' ? 'chip active' : 'chip'} onClick={() => setMode('timer')}>
          Timer
        </button>
        <button
          type="button"
          className={mode === 'stopwatch' ? 'chip active' : 'chip'}
          onClick={() => setMode('stopwatch')}
        >
          Stopwatch
        </button>
      </div>
      {mode === 'timer' ? <Timer ownerId={ownerId} /> : <Stopwatch />}
      <p className="empty">Timers stay on this device and stop if you close the tab.</p>
    </section>
  )
}

function Timer({ ownerId }: { ownerId: string }) {
  const [seconds, setSeconds] = useState(60)
  const [remainingMs, setRemainingMs] = useState(60_000)
  const [running, setRunning] = useState(false)
  const started = useRef<number | null>(null)
  const baseMs = useRef(60_000)

  useEffect(() => {
    void loadTimerSeconds(ownerId).then((value) => {
      setSeconds(value)
      setRemainingMs(value * 1000)
      baseMs.current = value * 1000
    })
  }, [ownerId])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      if (started.current == null) return
      const next = baseMs.current - (Date.now() - started.current)
      if (next <= 0) {
        setRemainingMs(0)
        setRunning(false)
        started.current = null
        return
      }
      setRemainingMs(next)
    }, 200)
    return () => window.clearInterval(id)
  }, [running])

  function applySeconds(next: number) {
    const safe = Math.max(0, Math.trunc(next))
    setSeconds(safe)
    setRemainingMs(safe * 1000)
    baseMs.current = safe * 1000
    void saveTimerSeconds(ownerId, safe)
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return (
    <div className="clock-panel">
      <p className="digits">{formatCountdown(remainingMs)}</p>
      <div className="time-pair">
        <label>
          Hours
          <input
            type="number"
            min={0}
            max={23}
            value={hours}
            disabled={running}
            onChange={(event) => applySeconds(Number(event.target.value) * 3600 + minutes * 60 + secs)}
          />
        </label>
        <label>
          Minutes
          <input
            type="number"
            min={0}
            max={59}
            value={minutes}
            disabled={running}
            onChange={(event) => applySeconds(hours * 3600 + Number(event.target.value) * 60 + secs)}
          />
        </label>
        <label>
          Seconds
          <input
            type="number"
            min={0}
            max={59}
            value={secs}
            disabled={running}
            onChange={(event) => applySeconds(hours * 3600 + minutes * 60 + Number(event.target.value))}
          />
        </label>
      </div>
      <div className="filters">
        {PRESETS.map((preset) => (
          <button key={preset} type="button" className="chip" disabled={running} onClick={() => applySeconds(preset)}>
            {preset === 60 ? '1 min' : `${preset / 60} min`}
          </button>
        ))}
      </div>
      <div className="editor-actions">
        <button
          type="button"
          onClick={() => {
            if (running) {
              const next = Math.max(0, baseMs.current - (Date.now() - (started.current ?? Date.now())))
              baseMs.current = next
              started.current = null
              setRemainingMs(next)
              setRunning(false)
              return
            }
            if (remainingMs <= 0) return
            baseMs.current = remainingMs
            started.current = Date.now()
            setRunning(true)
          }}
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(false)
            started.current = null
            setRemainingMs(seconds * 1000)
            baseMs.current = seconds * 1000
          }}
        >
          Reset
        </button>
      </div>
    </div>
  )
}

function Stopwatch() {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [laps, setLaps] = useState<number[]>([])
  const started = useRef<number | null>(null)
  const base = useRef(0)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      if (started.current == null) return
      setElapsed(base.current + (Date.now() - started.current))
    }, 50)
    return () => window.clearInterval(id)
  }, [running])

  return (
    <div className="clock-panel">
      <p className="digits">{formatStopwatch(elapsed)}</p>
      <div className="editor-actions">
        <button
          type="button"
          onClick={() => {
            if (running) {
              base.current += Date.now() - (started.current ?? Date.now())
              started.current = null
              setElapsed(base.current)
              setRunning(false)
              return
            }
            started.current = Date.now()
            setRunning(true)
          }}
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          disabled={!running && elapsed === 0}
          onClick={() => setLaps((current) => [elapsed, ...current])}
        >
          Lap
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(false)
            started.current = null
            base.current = 0
            setElapsed(0)
            setLaps([])
          }}
        >
          Reset
        </button>
      </div>
      {laps.length > 0 ? (
        <ol className="laps">
          {laps.map((lap, index) => (
            <li key={`${lap}-${index}`}>{formatStopwatch(lap)}</li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
