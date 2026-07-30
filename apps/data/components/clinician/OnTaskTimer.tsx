'use client'

import type { OnOffTaskInterval, OnOffTaskStatus } from '../../lib/behaviour-tracking/types'
import styles from './ClinicianPortal.module.css'

interface OnTaskTimerProps {
  sessionElapsedSeconds: number
  activeStatus: OnOffTaskStatus | null
  intervals: OnOffTaskInterval[]
  onTaskLabel: string
  offTaskLabel: string
  isSessionRunning: boolean
  onStartSession: () => void
  onPauseSession: () => void
  onEndSession: () => void
  onMarkStatus: (status: OnOffTaskStatus) => void
}

function formatClock(seconds: number): string {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export function OnTaskTimer({
  sessionElapsedSeconds,
  activeStatus,
  intervals,
  onTaskLabel,
  offTaskLabel,
  isSessionRunning,
  onStartSession,
  onPauseSession,
  onEndSession,
  onMarkStatus,
}: OnTaskTimerProps) {
  const onTaskTotal = intervals
    .filter(interval => interval.status === 'on_task')
    .reduce((sum, interval) => sum + interval.durationSeconds, 0)

  const offTaskTotal = intervals
    .filter(interval => interval.status === 'off_task')
    .reduce((sum, interval) => sum + interval.durationSeconds, 0)

  const trackedTotal = onTaskTotal + offTaskTotal
  const onTaskPct = trackedTotal ? Math.round((onTaskTotal / trackedTotal) * 100) : 0
  const offTaskPct = trackedTotal ? Math.round((offTaskTotal / trackedTotal) * 100) : 0

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>B. Time on task vs off task</h2>
      <p className={styles.timerValue}>{formatClock(sessionElapsedSeconds)}</p>

      <div className={styles.row} style={{ marginTop: 10 }}>
        <button type="button" className={styles.button} onClick={onStartSession} disabled={isSessionRunning}>
          Start session
        </button>
        <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={onPauseSession}>
          Pause session
        </button>
        <button type="button" className={`${styles.button} ${styles.buttonDanger}`} onClick={onEndSession}>
          End session
        </button>
      </div>

      <div className={styles.row} style={{ marginTop: 10 }}>
        <button
          type="button"
          className={styles.button}
          style={{ background: activeStatus === 'on_task' ? 'var(--success)' : undefined }}
          onClick={() => onMarkStatus('on_task')}
          disabled={!isSessionRunning}
        >
          Mark {onTaskLabel}
        </button>
        <button
          type="button"
          className={styles.button}
          style={{ background: activeStatus === 'off_task' ? 'var(--warning)' : undefined }}
          onClick={() => onMarkStatus('off_task')}
          disabled={!isSessionRunning}
        >
          Mark {offTaskLabel}
        </button>
      </div>

      <div className={styles.statRow}>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>{onTaskLabel} time</p>
          <p>{formatClock(onTaskTotal)}</p>
          <p className={styles.subtle}>{onTaskPct}%</p>
        </div>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>{offTaskLabel} time</p>
          <p>{formatClock(offTaskTotal)}</p>
          <p className={styles.subtle}>{offTaskPct}%</p>
        </div>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>Current state</p>
          <p>
            {activeStatus
              ? (activeStatus === 'on_task' ? onTaskLabel : offTaskLabel)
              : 'Not marked'}
          </p>
        </div>
      </div>

      <div className={styles.tableWrap} style={{ marginTop: 10 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {intervals.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.subtle}>
                  No intervals recorded yet.
                </td>
              </tr>
            ) : (
              intervals
                .slice()
                .reverse()
                .map(interval => (
                  <tr key={interval.id}>
                    <td>{interval.status === 'on_task' ? onTaskLabel : offTaskLabel}</td>
                    <td>{new Date(interval.startTime).toLocaleTimeString()}</td>
                    <td>{new Date(interval.endTime).toLocaleTimeString()}</td>
                    <td>{interval.durationSeconds}s</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
