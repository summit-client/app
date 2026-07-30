'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BehaviourDefinition, BehaviourEvent } from '../../lib/behaviour-tracking/types'
import styles from './ClinicianPortal.module.css'

interface BehaviourFrequencyClickerProps {
  behaviours: BehaviourDefinition[]
  events: BehaviourEvent[]
  secondsSinceLastEvent: number
  isTimerStopped: boolean
  onRecord: (behaviour: BehaviourDefinition, notes?: string) => void
  onStopTimer: () => void
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}

export function BehaviourFrequencyClicker({
  behaviours,
  events,
  secondsSinceLastEvent,
  isTimerStopped,
  onRecord,
  onStopTimer,
}: BehaviourFrequencyClickerProps) {
  const [selectedBehaviourId, setSelectedBehaviourId] = useState(behaviours[0]?.id ?? '')
  const [notes, setNotes] = useState('')

  const selectedBehaviour = useMemo(
    () => behaviours.find(behaviour => behaviour.id === selectedBehaviourId),
    [behaviours, selectedBehaviourId]
  )

  useEffect(() => {
    if (!behaviours.length) {
      setSelectedBehaviourId('')
      return
    }

    const stillExists = behaviours.some(behaviour => behaviour.id === selectedBehaviourId)
    if (!stillExists) {
      setSelectedBehaviourId(behaviours[0].id)
    }
  }, [behaviours, selectedBehaviourId])

  const lastEvent = events.at(-1)
  const interResponseList = useMemo(() => {
    if (events.length < 2) return []
    const values: number[] = []
    for (let index = 1; index < events.length; index += 1) {
      const previous = +new Date(events[index - 1].timestamp)
      const current = +new Date(events[index].timestamp)
      values.push(Math.max(0, Math.round((current - previous) / 1000)))
    }
    return values
  }, [events])

  const averageInterResponse = interResponseList.length
    ? Math.round(interResponseList.reduce((sum, item) => sum + item, 0) / interResponseList.length)
    : 0

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>A. Behaviour frequency</h2>
      <div className={styles.row}>
        <label htmlFor="behaviour-select" className={styles.subtle}>
          Target behaviour
        </label>
        <select
          id="behaviour-select"
          className={styles.select}
          value={selectedBehaviourId}
          onChange={event => setSelectedBehaviourId(event.target.value)}
        >
          {behaviours.map(behaviour => (
            <option key={behaviour.id} value={behaviour.id}>
              {behaviour.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        <textarea
          className={styles.textarea}
          placeholder="Optional note for this behaviour event"
          value={notes}
          onChange={event => setNotes(event.target.value)}
        />
      </div>

      <div className={styles.row} style={{ marginTop: 12 }}>
        <button
          type="button"
          className={styles.button}
          style={{ flex: 1, minHeight: 72, fontSize: '1.25rem' }}
          onClick={() => {
            if (!selectedBehaviour) return
            onRecord(selectedBehaviour, notes.trim() || undefined)
            setNotes('')
          }}
          disabled={!selectedBehaviour}
        >
          Record Behaviour
        </button>

        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          style={{ minHeight: 72, minWidth: 140 }}
          onClick={onStopTimer}
          disabled={!events.length || isTimerStopped}
        >
          {isTimerStopped ? 'Timer Stopped' : 'Stop Timer'}
        </button>
      </div>

      <div className={styles.statRow}>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>Total frequency count</p>
          <p className={styles.summaryValue}>{events.length}</p>
        </div>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>Last occurrence</p>
          <p>{lastEvent ? formatTimestamp(lastEvent.timestamp) : 'No events yet'}</p>
        </div>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>Time since last behaviour</p>
          <p>{lastEvent ? `${secondsSinceLastEvent}s` : '-'}</p>
        </div>
      </div>

      <div className={styles.statRow}>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>Average inter-response time</p>
          <p>{averageInterResponse}s</p>
        </div>
      </div>

      <div className={styles.tableWrap} style={{ marginTop: 10 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Behaviour</th>
              <th>Timestamp</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.subtle}>
                  No behaviour events recorded yet.
                </td>
              </tr>
            ) : (
              events
                .slice()
                .reverse()
                .map(event => (
                  <tr key={event.id}>
                    <td>{event.behaviourName}</td>
                    <td>{formatTimestamp(event.timestamp)}</td>
                    <td>{event.notes || 'No note'}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
