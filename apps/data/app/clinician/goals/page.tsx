'use client'

import { useEffect, useMemo, useState } from 'react'
import { ClinicianSidebar } from '../../../components/clinician/ClinicianSidebar'
import { TopNavigation } from '../../../components/clinician/TopNavigation'
import {
  addGoalProgressEntry,
  deleteClientGoal,
  fetchClientReportSummaries,
  fetchClientGoals,
  fetchClinicianClients,
  fetchGoalProgressEntries,
  saveClientGoal,
} from '../../../lib/behaviour-tracking/service'
import type {
  ClinicianClient,
  ClinicianGoal,
  ClientReportSummary,
  GoalPriority,
  GoalProgressEntry,
  GoalStatus,
} from '../../../lib/behaviour-tracking/types'
import styles from '../../../components/clinician/ClinicianPortal.module.css'

interface GoalSuggestion {
  title: string
  description: string
  targetDays: number
  reason: string
}

interface GoalOutcomeSuggestion {
  status: GoalStatus
  progressPercent: number
  rationale: string
}

interface PendingDeleteGoal {
  goal: ClinicianGoal
  index: number
  timeoutId: number
}

function statusClass(status: GoalStatus): string {
  if (status === 'completed') return `${styles.badge} ${styles.badgeCompleted}`
  if (status === 'in_progress') return `${styles.badge} ${styles.badgeInProgress}`
  if (status === 'on_hold') return `${styles.badge} ${styles.badgeCancelled}`
  return `${styles.badge} ${styles.badgeScheduled}`
}

function priorityClass(priority: GoalPriority): string {
  if (priority === 'high') return `${styles.badge} ${styles.badgeCancelled}`
  if (priority === 'medium') return `${styles.badge} ${styles.badgeInProgress}`
  return `${styles.badge} ${styles.badgeScheduled}`
}

function progressLabel(value: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return `${clamped}%`
}

function dateFromNow(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + Math.max(1, days))
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function ProgressTrendChart({ entries }: { entries: GoalProgressEntry[] }) {
  const chronological = [...entries]
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .slice(-8)

  if (chronological.length < 2) {
    return (
      <p className={styles.subtle} style={{ marginTop: 10 }}>
        Add at least two progress updates to view a trend line.
      </p>
    )
  }

  const width = 760
  const height = 220
  const left = 44
  const right = 18
  const top = 16
  const bottom = 44
  const innerWidth = width - left - right
  const innerHeight = height - top - bottom
  const step = chronological.length > 1 ? innerWidth / (chronological.length - 1) : innerWidth

  const points = chronological.map((entry, index) => {
    const x = left + index * step
    const y = top + innerHeight - (clampProgress(entry.progressPercent) / 100) * innerHeight
    const label = new Date(entry.createdAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })
    return { x, y, label, value: clampProgress(entry.progressPercent), id: entry.id }
  })

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return (
    <div style={{ width: '100%', overflowX: 'auto', marginTop: 10 }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 640, height: 'auto' }}>
        <line x1={left} y1={top + innerHeight} x2={width - right} y2={top + innerHeight} stroke="#cfd8e3" />
        <line x1={left} y1={top} x2={left} y2={top + innerHeight} stroke="#cfd8e3" />
        {[0, 25, 50, 75, 100].map(tick => {
          const y = top + innerHeight - (tick / 100) * innerHeight
          return (
            <g key={tick}>
              <line x1={left} y1={y} x2={width - right} y2={y} stroke="#edf2f7" />
              <text x={left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#5f6c7b">
                {tick}%
              </text>
            </g>
          )
        })}

        <path d={path} fill="none" stroke="#1864ab" strokeWidth={3} strokeLinecap="round" />

        {points.map(point => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r={4} fill="#1864ab" />
            <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="11" fill="#334155">
              {point.value}%
            </text>
            <text x={point.x} y={top + innerHeight + 16} textAnchor="middle" fontSize="11" fill="#334155">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function suggestGoalOutcome(goal: ClinicianGoal, report: ClientReportSummary | undefined): GoalOutcomeSuggestion | null {
  if (!report) return null

  const totalTasks = report.independentTaskCount + report.promptedTaskCount + report.notCompletedTaskCount
  const independentRatio = totalTasks > 0 ? report.independentTaskCount / totalTasks : 0
  const behaviorPerAppointment = report.appointmentsTracked > 0
    ? report.behaviourEventCount / report.appointmentsTracked
    : 0

  if (
    report.appointmentsTracked >= 4 &&
    report.onTaskPercentage >= 85 &&
    independentRatio >= 0.65 &&
    behaviorPerAppointment <= 2
  ) {
    return {
      status: 'completed',
      progressPercent: 100,
      rationale: 'Recent report metrics show strong stability and independent performance, so this goal can likely be completed.',
    }
  }

  if (report.appointmentsTracked >= 2 && (report.onTaskPercentage >= 70 || independentRatio >= 0.5)) {
    return {
      status: 'in_progress',
      progressPercent: Math.max(goal.progressPercent, 70),
      rationale: 'Report outcomes suggest reliable improvement; this goal is likely in progress and nearing completion.',
    }
  }

  return {
    status: 'not_started',
    progressPercent: Math.max(goal.progressPercent, 20),
    rationale: 'Current tracked outcomes are limited or mixed, so continue collecting data and incremental progress updates.',
  }
}

export default function ClinicianGoalsPage() {
  const [clients, setClients] = useState<ClinicianClient[]>([])
  const [goals, setGoals] = useState<ClinicianGoal[]>([])
  const [reportSummaries, setReportSummaries] = useState<ClientReportSummary[]>([])
  const [selectedClientFilter, setSelectedClientFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [formClientId, setFormClientId] = useState('')
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false)
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTargetDate, setFormTargetDate] = useState('')
  const [formPriority, setFormPriority] = useState<GoalPriority>('medium')
  const [formStatus, setFormStatus] = useState<GoalStatus>('not_started')

  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [progressDelta, setProgressDelta] = useState<number>(10)
  const [progressNote, setProgressNote] = useState('')
  const [progressEntries, setProgressEntries] = useState<GoalProgressEntry[]>([])

  const [aiSuggestions, setAiSuggestions] = useState<GoalSuggestion[]>([])
  const [aiSource, setAiSource] = useState<'claude' | 'fallback' | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState<ClinicianGoal | null>(null)
  const [pendingDeleteGoal, setPendingDeleteGoal] = useState<PendingDeleteGoal | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const [clientRows, goalRows, reportRows] = await Promise.all([
          fetchClinicianClients(),
          fetchClientGoals(),
          fetchClientReportSummaries(),
        ])
        if (!active) return

        setClients(clientRows)
        setGoals(goalRows)
        setReportSummaries(reportRows)
        setFormClientId(clientRows[0]?.id ?? '')
        setError(null)
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Unknown error')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadProgress() {
      if (!selectedGoalId) {
        setProgressEntries([])
        return
      }

      try {
        const rows = await fetchGoalProgressEntries(selectedGoalId)
        if (active) {
          setProgressEntries(rows)
        }
      } catch {
        if (active) setProgressEntries([])
      }
    }

    void loadProgress()
    return () => {
      active = false
    }
  }, [selectedGoalId])

  useEffect(() => {
    return () => {
      if (pendingDeleteGoal) {
        clearTimeout(pendingDeleteGoal.timeoutId)
      }
    }
  }, [pendingDeleteGoal])

  const clientNameById = useMemo(() => {
    return new Map(clients.map(client => [client.id, client.name]))
  }, [clients])

  const filteredGoals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return goals.filter(goal => {
      if (selectedClientFilter !== 'all' && goal.clientId !== selectedClientFilter) return false
      if (!query) return true

      const clientName = clientNameById.get(goal.clientId) ?? ''
      return [goal.title, goal.description ?? '', clientName].join(' ').toLowerCase().includes(query)
    })
  }, [clientNameById, goals, searchQuery, selectedClientFilter])

  const selectedGoal = useMemo(() => {
    if (!selectedGoalId) return null
    return goals.find(goal => goal.id === selectedGoalId) ?? null
  }, [goals, selectedGoalId])

  const reportByClientId = useMemo(() => {
    return new Map(reportSummaries.map(report => [report.clientId, report]))
  }, [reportSummaries])

  const selectedGoalOutcomeSuggestion = useMemo(() => {
    if (!selectedGoal) return null
    return suggestGoalOutcome(selectedGoal, reportByClientId.get(selectedGoal.clientId))
  }, [reportByClientId, selectedGoal])

  const selectedFormClient = useMemo(() => {
    return clients.find(client => client.id === formClientId) ?? null
  }, [clients, formClientId])

  const filteredClientPickerRows = useMemo(() => {
    const query = clientSearchQuery.trim().toLowerCase()
    if (!query) return clients

    return clients.filter(client => {
      return [client.name, client.email ?? '', client.sessionType ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [clientSearchQuery, clients])

  const goalStats = useMemo(() => {
    const completed = goals.filter(goal => goal.status === 'completed').length
    const inProgress = goals.filter(goal => goal.status === 'in_progress').length
    const avgProgress = goals.length
      ? Math.round(goals.reduce((sum, goal) => sum + goal.progressPercent, 0) / goals.length)
      : 0

    return {
      total: goals.length,
      completed,
      inProgress,
      avgProgress,
    }
  }, [goals])

  function resetGoalForm() {
    setEditingGoalId(null)
    setFormTitle('')
    setFormDescription('')
    setFormTargetDate('')
    setFormPriority('medium')
    setFormStatus('not_started')
    setAiSuggestions([])
    setAiSource(null)
  }

  function handleStartEdit(goal: ClinicianGoal) {
    setEditingGoalId(goal.id)
    setFormClientId(goal.clientId)
    setFormTitle(goal.title)
    setFormDescription(goal.description ?? '')
    setFormTargetDate(goal.targetDate ?? '')
    setFormPriority(goal.priority)
    setFormStatus(goal.status)
  }

  function handleSelectClientForForm(clientId: string) {
    setFormClientId(clientId)
    setIsClientPickerOpen(false)
    setClientSearchQuery('')
  }

  async function handleSaveGoal() {
    const title = formTitle.trim()
    if (!formClientId || !title) return

    try {
      setSaving(true)
      const saved = await saveClientGoal({
        id: editingGoalId ?? undefined,
        clientId: formClientId,
        clinicianId: 'clinician-portal',
        title,
        description: formDescription.trim() || undefined,
        targetDate: formTargetDate || undefined,
        status: formStatus,
        priority: formPriority,
        progressPercent:
          editingGoalId != null
            ? goals.find(goal => goal.id === editingGoalId)?.progressPercent ?? 0
            : 0,
        aiSuggested: aiSource === 'claude',
      })

      setGoals(previous => {
        if (editingGoalId == null) {
          return [saved, ...previous]
        }
        return previous.map(goal => (goal.id === saved.id ? saved : goal))
      })
      resetGoalForm()
      setToast(editingGoalId == null ? 'Goal created' : 'Goal updated')
      setTimeout(() => setToast(null), 2500)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save goal')
    } finally {
      setSaving(false)
    }
  }

  function handleRequestDeleteGoal(goal: ClinicianGoal) {
    setConfirmDeleteGoal(goal)
  }

  async function handleConfirmDeleteGoal() {
    if (!confirmDeleteGoal) return

    const goal = confirmDeleteGoal
    const index = goals.findIndex(item => item.id === goal.id)
    setConfirmDeleteGoal(null)

    setGoals(previous => previous.filter(item => item.id !== goal.id))
    if (selectedGoalId === goal.id) {
      setSelectedGoalId(null)
    }
    if (editingGoalId === goal.id) {
      resetGoalForm()
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        await deleteClientGoal(goal.id)
        setToast('Goal deletion confirmed')
        setTimeout(() => setToast(null), 2200)
      } catch (saveError) {
        setGoals(previous => {
          if (previous.some(item => item.id === goal.id)) return previous
          const next = [...previous]
          const insertAt = Math.max(0, Math.min(index, next.length))
          next.splice(insertAt, 0, goal)
          return next
        })
        setError(saveError instanceof Error ? saveError.message : 'Failed to delete goal')
      } finally {
        setPendingDeleteGoal(current => (current?.goal.id === goal.id ? null : current))
      }
    }, 6000)

    setPendingDeleteGoal({ goal, index, timeoutId })
  }

  function handleUndoDeleteGoal() {
    if (!pendingDeleteGoal) return

    clearTimeout(pendingDeleteGoal.timeoutId)
    const { goal, index } = pendingDeleteGoal

    setGoals(previous => {
      if (previous.some(item => item.id === goal.id)) return previous
      const next = [...previous]
      const insertAt = Math.max(0, Math.min(index, next.length))
      next.splice(insertAt, 0, goal)
      return next
    })

    setPendingDeleteGoal(null)
    setToast('Goal deletion undone')
    setTimeout(() => setToast(null), 2200)
  }

  async function handleGenerateWithAi() {
    if (!formClientId) return

    const clientName = clientNameById.get(formClientId) ?? 'Client'

    try {
      setAiLoading(true)
      const response = await fetch('/api/goal-suggestions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientName,
          context: formDescription,
        }),
      })

      const payload = (await response.json()) as {
        source?: 'claude' | 'fallback'
        suggestions?: GoalSuggestion[]
      }

      setAiSource(payload.source ?? 'fallback')
      setAiSuggestions(payload.suggestions ?? [])
    } catch {
      setAiSource('fallback')
      setAiSuggestions([])
    } finally {
      setAiLoading(false)
    }
  }

  function applySuggestion(suggestion: GoalSuggestion) {
    setFormTitle(suggestion.title)
    setFormDescription(suggestion.description)
    setFormTargetDate(dateFromNow(suggestion.targetDays))
  }

  async function handleLogProgress() {
    if (!selectedGoal || !progressNote.trim()) return

    try {
      setSaving(true)
      const updated = await addGoalProgressEntry({
        goalId: selectedGoal.id,
        note: progressNote.trim(),
        progressDelta,
      })

      setGoals(previous => previous.map(goal => (goal.id === updated.id ? updated : goal)))
      setProgressNote('')
      setProgressDelta(10)

      const rows = await fetchGoalProgressEntries(updated.id)
      setProgressEntries(rows)

      setToast('Progress update logged')
      setTimeout(() => setToast(null), 2500)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to log progress')
    } finally {
      setSaving(false)
    }
  }

  async function handleApplyOutcomeSuggestion() {
    if (!selectedGoal || !selectedGoalOutcomeSuggestion) return

    try {
      setSaving(true)
      const updated = await saveClientGoal({
        id: selectedGoal.id,
        clientId: selectedGoal.clientId,
        clinicianId: selectedGoal.clinicianId,
        title: selectedGoal.title,
        description: selectedGoal.description,
        targetDate: selectedGoal.targetDate,
        status: selectedGoalOutcomeSuggestion.status,
        priority: selectedGoal.priority,
        progressPercent: clampProgress(selectedGoalOutcomeSuggestion.progressPercent),
        aiSuggested: selectedGoal.aiSuggested,
      })

      setGoals(previous => previous.map(goal => (goal.id === updated.id ? updated : goal)))
      setToast('Goal updated from report outcomes')
      setTimeout(() => setToast(null), 2500)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to apply suggestion')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main>
      <TopNavigation
        title="Goals"
        subtitle="Set clinician goals, track progress over time, and use Claude-powered suggestions for SMART planning."
      />

      <div className={styles.pageGrid}>
        <ClinicianSidebar activePath="/clinician/goals" />

        <div className={styles.stack}>
          <section className={styles.cardGrid} aria-label="Goal statistics">
            <article className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Total goals</p>
              <p className={styles.summaryValue}>{goalStats.total}</p>
            </article>
            <article className={styles.summaryCard}>
              <p className={styles.summaryLabel}>In progress</p>
              <p className={styles.summaryValue}>{goalStats.inProgress}</p>
            </article>
            <article className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Completed</p>
              <p className={styles.summaryValue}>{goalStats.completed}</p>
            </article>
            <article className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Avg progress</p>
              <p className={styles.summaryValue}>{goalStats.avgProgress}%</p>
            </article>
          </section>

          {loading ? <section className={styles.panel}>Loading goals...</section> : null}
          {error ? <section className={styles.panel}>Unable to load goals: {error}</section> : null}

          {!loading && !error ? (
            <>
              <section className={styles.panel}>
                <h2 className={styles.sectionTitle}>{editingGoalId ? 'Edit goal' : 'Create goal'}</h2>
                <div className={styles.row}>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonGhost}`}
                    onClick={() => setIsClientPickerOpen(true)}
                  >
                    {selectedFormClient ? `Client: ${selectedFormClient.name}` : 'Select client'}
                  </button>
                  <input
                    className={styles.input}
                    value={formTitle}
                    onChange={event => setFormTitle(event.target.value)}
                    placeholder="Goal title"
                  />
                </div>

                <div className={styles.row} style={{ marginTop: 10 }}>
                  <textarea
                    className={styles.textarea}
                    value={formDescription}
                    onChange={event => setFormDescription(event.target.value)}
                    placeholder="Goal details and baseline notes"
                  />
                </div>

                <div className={styles.row} style={{ marginTop: 10 }}>
                  <input
                    type="date"
                    className={styles.select}
                    value={formTargetDate}
                    onChange={event => setFormTargetDate(event.target.value)}
                    aria-label="Goal target date"
                  />
                  <select
                    className={styles.select}
                    value={formPriority}
                    onChange={event => setFormPriority(event.target.value as GoalPriority)}
                    aria-label="Goal priority"
                  >
                    <option value="low">Low priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="high">High priority</option>
                  </select>
                  <select
                    className={styles.select}
                    value={formStatus}
                    onChange={event => setFormStatus(event.target.value as GoalStatus)}
                    aria-label="Goal status"
                  >
                    <option value="not_started">Not started</option>
                    <option value="in_progress">In progress</option>
                    <option value="on_hold">On hold</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={handleGenerateWithAi} disabled={aiLoading}>
                    {aiLoading ? 'Generating...' : 'Suggest with Claude'}
                  </button>
                  <button type="button" className={styles.button} onClick={handleSaveGoal} disabled={saving}>
                    {saving ? 'Saving...' : editingGoalId ? 'Update goal' : 'Create goal'}
                  </button>
                  {editingGoalId ? (
                    <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={resetGoalForm}>
                      Cancel edit
                    </button>
                  ) : null}
                </div>

                {aiSource ? (
                  <p className={styles.subtle} style={{ marginTop: 10 }}>
                    Suggestion source: {aiSource === 'claude' ? 'Claude AI' : 'Fallback suggestions'}
                  </p>
                ) : null}

                {aiSuggestions.length > 0 ? (
                  <div className={styles.tableWrap} style={{ marginTop: 10 }}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Suggested goal</th>
                          <th>Reason</th>
                          <th>Target window</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiSuggestions.map(suggestion => (
                          <tr key={suggestion.title}>
                            <td>
                              <div>{suggestion.title}</div>
                              <div className={styles.subtle}>{suggestion.description}</div>
                            </td>
                            <td>{suggestion.reason}</td>
                            <td>{suggestion.targetDays} days</td>
                            <td>
                              <button type="button" className={styles.button} onClick={() => applySuggestion(suggestion)}>
                                Use suggestion
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>

              <section className={styles.panel}>
                <h2 className={styles.sectionTitle}>Goal list</h2>
                <div className={styles.row} style={{ marginBottom: 10 }}>
                  <input
                    className={styles.input}
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="Search by client or goal title"
                    aria-label="Search goals"
                  />
                  <select
                    className={styles.select}
                    value={selectedClientFilter}
                    onChange={event => setSelectedClientFilter(event.target.value)}
                    aria-label="Filter goals by client"
                  >
                    <option value="all">All clients</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Goal</th>
                        <th>Target date</th>
                        <th>Progress</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Track</th>
                        <th>Edit</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGoals.length === 0 ? (
                        <tr>
                          <td colSpan={9} className={styles.subtle}>
                            No goals match your current search.
                          </td>
                        </tr>
                      ) : (
                        filteredGoals.map(goal => (
                          <tr key={goal.id}>
                            <td>{clientNameById.get(goal.clientId) ?? `Client ${goal.clientId}`}</td>
                            <td style={{ width: '30%' }}>
                              <div>{goal.title}</div>
                              <div className={styles.subtle} style={{ maxWidth: 280 }}>
                                {goal.description ?? 'No description'}
                              </div>
                            </td>
                            <td>{goal.targetDate ?? 'No target date'}</td>
                            <td>{progressLabel(goal.progressPercent)}</td>
                            <td>
                              <span className={statusClass(goal.status)}>{goal.status.replace('_', ' ')}</span>
                            </td>
                            <td>
                              <span className={priorityClass(goal.priority)}>{goal.priority}</span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`${styles.button} ${styles.buttonGhost}`}
                                onClick={() => setSelectedGoalId(goal.id)}
                              >
                                Track
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`${styles.button} ${styles.buttonGhost}`}
                                onClick={() => handleStartEdit(goal)}
                              >
                                Edit
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`${styles.button} ${styles.buttonDanger}`}
                                onClick={() => handleRequestDeleteGoal(goal)}
                                disabled={saving}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {selectedGoal ? (
                <section className={styles.panel}>
                  <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                    <h2 className={styles.sectionTitle}>Progress tracking: {selectedGoal.title}</h2>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonGhost}`}
                      onClick={() => setSelectedGoalId(null)}
                    >
                      Close
                    </button>
                  </div>

                  <p className={styles.subtle} style={{ marginBottom: 10 }}>
                    Current progress: {progressLabel(selectedGoal.progressPercent)}
                  </p>

                  {selectedGoalOutcomeSuggestion ? (
                    <section className={styles.panel} style={{ marginBottom: 10 }}>
                      <h3 className={styles.sectionTitle}>Report-linked smart suggestion</h3>
                      <p className={styles.subtle}>
                        Suggested status: {selectedGoalOutcomeSuggestion.status.replace('_', ' ')} | Suggested progress:{' '}
                        {selectedGoalOutcomeSuggestion.progressPercent}%
                      </p>
                      <p className={styles.subtle}>{selectedGoalOutcomeSuggestion.rationale}</p>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonGhost}`}
                        onClick={handleApplyOutcomeSuggestion}
                        disabled={saving}
                      >
                        Apply suggestion
                      </button>
                    </section>
                  ) : (
                    <p className={styles.subtle} style={{ marginBottom: 10 }}>
                      Not enough report data to generate an automatic goal outcome suggestion yet.
                    </p>
                  )}

                  <div className={styles.row}>
                    <input
                      type="number"
                      className={styles.select}
                      value={progressDelta}
                      onChange={event => setProgressDelta(Number(event.target.value))}
                      aria-label="Progress delta"
                    />
                    <input
                      className={styles.input}
                      value={progressNote}
                      onChange={event => setProgressNote(event.target.value)}
                      placeholder="Progress note"
                      aria-label="Progress note"
                    />
                    <button type="button" className={styles.button} onClick={handleLogProgress} disabled={saving}>
                      {saving ? 'Saving...' : 'Log progress'}
                    </button>
                  </div>

                  <section className={styles.panel} style={{ marginTop: 10 }}>
                    <h3 className={styles.sectionTitle}>Weekly progress trend</h3>
                    <ProgressTrendChart entries={progressEntries} />
                  </section>

                  <div className={styles.tableWrap} style={{ marginTop: 10 }}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Recorded at</th>
                          <th>Progress change</th>
                          <th>Goal progress</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progressEntries.length === 0 ? (
                          <tr>
                            <td colSpan={4} className={styles.subtle}>
                              No progress entries yet for this goal.
                            </td>
                          </tr>
                        ) : (
                          progressEntries.map(entry => (
                            <tr key={entry.id}>
                              <td>{new Date(entry.createdAt).toLocaleString()}</td>
                              <td>{entry.progressDelta > 0 ? `+${entry.progressDelta}` : entry.progressDelta}%</td>
                              <td>{entry.progressPercent}%</td>
                              <td>{entry.note}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {pendingDeleteGoal ? (
            <section className={styles.panel}>
              <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                <p className={styles.subtle}>
                  Goal "{pendingDeleteGoal.goal.title}" removed. Undo is available for a few seconds.
                </p>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonGhost}`}
                  onClick={handleUndoDeleteGoal}
                >
                  Undo
                </button>
              </div>
            </section>
          ) : null}

          {toast ? <section className={styles.panel}>{toast}</section> : null}
        </div>
      </div>

      {confirmDeleteGoal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm goal deletion"
          onClick={() => setConfirmDeleteGoal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 20, 30, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1200,
          }}
        >
          <section
            className={styles.panel}
            onClick={event => event.stopPropagation()}
            style={{ width: 'min(520px, 95vw)' }}
          >
            <h3 className={styles.sectionTitle}>Delete this goal?</h3>
            <p className={styles.subtle}>
              {confirmDeleteGoal.title} will be removed from the list. You can still undo for a few seconds after deleting.
            </p>
            <div className={styles.row} style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={() => setConfirmDeleteGoal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonDanger}`}
                onClick={() => void handleConfirmDeleteGoal()}
              >
                Delete goal
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isClientPickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select client"
          onClick={() => {
            setIsClientPickerOpen(false)
            setClientSearchQuery('')
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 20, 30, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1200,
          }}
        >
          <section
            className={styles.panel}
            onClick={event => event.stopPropagation()}
            style={{ width: 'min(760px, 95vw)', maxHeight: '80vh', overflow: 'auto' }}
          >
            <div className={styles.row} style={{ justifyContent: 'space-between', paddingBottom: 12 }}>
              <h3 className={styles.sectionTitle}>Select client</h3>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={() => {
                  setIsClientPickerOpen(false)
                  setClientSearchQuery('')
                }}
              >
                Close
              </button>
            </div>

            <input
              className={styles.input}
              value={clientSearchQuery}
              onChange={event => setClientSearchQuery(event.target.value)}
              placeholder="Search client by name, email, or session type"
              aria-label="Search clients for goal"
            />

            <div className={styles.tableWrap} style={{ marginTop: 10 }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Email</th>
                    <th>Session type</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClientPickerRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.subtle}>
                        No clients match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredClientPickerRows.map(client => (
                      <tr key={client.id}>
                        <td>{client.name}</td>
                        <td>{client.email ?? 'No email listed'}</td>
                        <td>{client.sessionType ?? 'not set'}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => handleSelectClientForForm(client.id)}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
