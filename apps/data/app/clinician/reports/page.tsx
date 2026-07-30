'use client'

import { useEffect, useMemo, useState } from 'react'
import { ClinicianSidebar } from '../../../components/clinician/ClinicianSidebar'
import { TopNavigation } from '../../../components/clinician/TopNavigation'
import {
  fetchClientAppointmentTrends,
  fetchClientFrequencyTimeSeries,
  fetchClientReportSummaries,
} from '../../../lib/behaviour-tracking/service'
import type { ClientAppointmentTrendPoint, ClientReportSummary } from '../../../lib/behaviour-tracking/types'
import styles from '../../../components/clinician/ClinicianPortal.module.css'

type RangeOption = 'all' | '7d' | '30d' | '90d'

function rangeOptionToDays(option: RangeOption): number | null {
  if (option === '7d') return 7
  if (option === '30d') return 30
  if (option === '90d') return 90
  return null
}

function rangeOptionLabel(option: RangeOption): string {
  if (option === '7d') return 'Last 7 days'
  if (option === '30d') return 'Last 30 days'
  if (option === '90d') return 'Last 90 days'
  return 'All time'
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m`
}

function percentage(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

function BarChart({
  points,
  maxValue,
}: {
  points: Array<{ label: string; value: number; color: string }>
  maxValue?: number
}) {
  const width = 760
  const height = 260
  const left = 54
  const right = 24
  const top = 24
  const bottom = 52
  const innerWidth = width - left - right
  const innerHeight = height - top - bottom
  const effectiveMax = Math.max(maxValue ?? 0, ...points.map(point => point.value), 1)
  const step = innerWidth / Math.max(points.length, 1)
  const barWidth = Math.min(90, step * 0.6)

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 640, height: 'auto' }}>
        <line x1={left} y1={top + innerHeight} x2={width - right} y2={top + innerHeight} stroke="#cfd8e3" />
        <line x1={left} y1={top} x2={left} y2={top + innerHeight} stroke="#cfd8e3" />

        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const y = top + innerHeight - ratio * innerHeight
          const label = Math.round(effectiveMax * ratio)
          return (
            <g key={ratio}>
              <line x1={left} y1={y} x2={width - right} y2={y} stroke="#edf2f7" />
              <text x={left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#5f6c7b">
                {label}
              </text>
            </g>
          )
        })}

        {points.map((point, index) => {
          const x = left + index * step + (step - barWidth) / 2
          const barHeight = (point.value / effectiveMax) * innerHeight
          const y = top + innerHeight - barHeight

          return (
            <g key={point.label}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={6} fill={point.color} opacity={0.9} />
              <text x={x + barWidth / 2} y={top + innerHeight + 18} textAnchor="middle" fontSize="11" fill="#334155">
                {point.label}
              </text>
              <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fontSize="11" fill="#334155">
                {point.value}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function LinePlot({ points }: { points: Array<{ label: string; value: number }> }) {
  const width = 760
  const height = 240
  const left = 52
  const right = 20
  const top = 20
  const bottom = 48
  const innerWidth = width - left - right
  const innerHeight = height - top - bottom
  const maxValue = Math.max(...points.map(point => point.value), 1)
  const step = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth

  const coords = points.map((point, index) => {
    const x = left + index * step
    const y = top + innerHeight - (point.value / maxValue) * innerHeight
    return { ...point, x, y }
  })

  const path = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`).join(' ')

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 640, height: 'auto' }}>
        <line x1={left} y1={top + innerHeight} x2={width - right} y2={top + innerHeight} stroke="#cfd8e3" />
        <line x1={left} y1={top} x2={left} y2={top + innerHeight} stroke="#cfd8e3" />

        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const y = top + innerHeight - ratio * innerHeight
          return <line key={ratio} x1={left} y1={y} x2={width - right} y2={y} stroke="#edf2f7" />
        })}

        <path d={path} fill="none" stroke="#1864ab" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />

        {coords.map(coord => (
          <g key={coord.label}>
            <circle cx={coord.x} cy={coord.y} r={5} fill="#1864ab" />
            <text x={coord.x} y={coord.y - 10} textAnchor="middle" fontSize="11" fill="#334155">
              {coord.value}
            </text>
            <text x={coord.x} y={top + innerHeight + 18} textAnchor="middle" fontSize="11" fill="#334155">
              {coord.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function MultiLineTrendPlot({
  points,
}: {
  points: Array<{
    label: string
    behaviourEvents: number
    onTaskPercentage: number
    independentPercentage: number
  }>
}) {
  const width = 760
  const height = 260
  const left = 54
  const right = 20
  const top = 20
  const bottom = 52
  const innerWidth = width - left - right
  const innerHeight = height - top - bottom
  const step = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth
  const maxEvents = Math.max(...points.map(point => point.behaviourEvents), 1)

  const eventCoords = points.map((point, index) => ({
    x: left + index * step,
    y: top + innerHeight - (point.behaviourEvents / maxEvents) * innerHeight,
    label: point.label,
    value: point.behaviourEvents,
  }))

  const onTaskCoords = points.map((point, index) => ({
    x: left + index * step,
    y: top + innerHeight - (point.onTaskPercentage / 100) * innerHeight,
    label: point.label,
    value: point.onTaskPercentage,
  }))

  const indepCoords = points.map((point, index) => ({
    x: left + index * step,
    y: top + innerHeight - (point.independentPercentage / 100) * innerHeight,
    label: point.label,
    value: point.independentPercentage,
  }))

  const pathFor = (coords: Array<{ x: number; y: number }>) =>
    coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`).join(' ')

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 640, height: 'auto' }}>
        <line x1={left} y1={top + innerHeight} x2={width - right} y2={top + innerHeight} stroke="#cfd8e3" />
        <line x1={left} y1={top} x2={left} y2={top + innerHeight} stroke="#cfd8e3" />

        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const y = top + innerHeight - ratio * innerHeight
          return <line key={ratio} x1={left} y1={y} x2={width - right} y2={y} stroke="#edf2f7" />
        })}

        <path d={pathFor(eventCoords)} fill="none" stroke="#0b7285" strokeWidth={3} />
        <path d={pathFor(onTaskCoords)} fill="none" stroke="#2f9e44" strokeWidth={3} />
        <path d={pathFor(indepCoords)} fill="none" stroke="#7b61ff" strokeWidth={3} />

        {eventCoords.map(point => (
          <g key={`event-${point.label}`}>
            <circle cx={point.x} cy={point.y} r={4} fill="#0b7285" />
            <text x={point.x} y={top + innerHeight + 18} textAnchor="middle" fontSize="11" fill="#334155">
              {point.label}
            </text>
          </g>
        ))}
      </svg>

      <div className={styles.row} style={{ marginTop: 8, fontSize: 12 }}>
        <span style={{ color: '#0b7285', fontWeight: 600 }}>Behaviour events</span>
        <span style={{ color: '#2f9e44', fontWeight: 600 }}>On-task %</span>
        <span style={{ color: '#7b61ff', fontWeight: 600 }}>Independent %</span>
      </div>
    </div>
  )
}

function trendDeltaLabel(start: number, end: number, suffix = ''): string {
  const delta = end - start
  if (delta === 0) return `flat (0${suffix})`
  const direction = delta > 0 ? 'up' : 'down'
  return `${direction} ${Math.abs(delta)}${suffix}`
}

export default function ClinicianReportsPage() {
  const [rows, setRows] = useState<ClientReportSummary[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClientReport, setSelectedClientReport] = useState<ClientReportSummary | null>(null)
  const [selectedRange, setSelectedRange] = useState<RangeOption>('all')
  const [timeSeries, setTimeSeries] = useState<Array<{ label: string; frequency: number }>>([])
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false)
  const [appointmentTrends, setAppointmentTrends] = useState<ClientAppointmentTrendPoint[]>([])
  const [appointmentTrendsLoading, setAppointmentTrendsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const summaries = await fetchClientReportSummaries()
        if (active) {
          setRows(summaries)
          setError(null)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown error')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.appointments += row.appointmentsTracked
        acc.behaviourEvents += row.behaviourEventCount
        acc.onTaskSeconds += row.onTaskSeconds
        acc.offTaskSeconds += row.offTaskSeconds
        return acc
      },
      { appointments: 0, behaviourEvents: 0, onTaskSeconds: 0, offTaskSeconds: 0 }
    )
  }, [rows])

  const totalTracked = totals.onTaskSeconds + totals.offTaskSeconds
  const globalOnTaskPercentage = totalTracked ? Math.round((totals.onTaskSeconds / totalTracked) * 100) : 0
  const selectedRangeLabel = rangeOptionLabel(selectedRange)

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return rows.filter(row => {
      if (!query) return true
      return row.clientName.toLowerCase().includes(query)
    })
  }, [rows, searchQuery])

  useEffect(() => {
    let active = true

    async function loadSeries() {
      if (!selectedClientReport) {
        setTimeSeries([])
        return
      }

      try {
        setTimeSeriesLoading(true)
        const series = await fetchClientFrequencyTimeSeries(
          selectedClientReport.clientId,
          rangeOptionToDays(selectedRange)
        )
        if (active) {
          setTimeSeries(series)
        }
      } catch {
        if (active) {
          setTimeSeries([])
        }
      } finally {
        if (active) setTimeSeriesLoading(false)
      }
    }

    void loadSeries()
    return () => {
      active = false
    }
  }, [selectedClientReport, selectedRange])

  useEffect(() => {
    let active = true

    async function loadTrends() {
      if (!selectedClientReport) {
        setAppointmentTrends([])
        return
      }

      try {
        setAppointmentTrendsLoading(true)
        const rows = await fetchClientAppointmentTrends(
          selectedClientReport.clientId,
          rangeOptionToDays(selectedRange)
        )
        if (active) {
          setAppointmentTrends(rows)
        }
      } catch {
        if (active) {
          setAppointmentTrends([])
        }
      } finally {
        if (active) setAppointmentTrendsLoading(false)
      }
    }

    void loadTrends()
    return () => {
      active = false
    }
  }, [selectedClientReport, selectedRange])

  return (
    <main>
      <TopNavigation
        title="Client Reports"
        subtitle="Summary of tracked appointment data for each client."
      />

      <div className={styles.pageGrid}>
        <ClinicianSidebar activePath="/clinician/reports" />

        <div className={styles.stack}>
          <section className={styles.cardGrid} aria-label="Report totals">
            <article className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Tracked appointments</p>
              <p className={styles.summaryValue}>{totals.appointments}</p>
            </article>
            <article className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Behaviour events</p>
              <p className={styles.summaryValue}>{totals.behaviourEvents}</p>
            </article>
            <article className={styles.summaryCard}>
              <p className={styles.summaryLabel}>On-task percentage</p>
              <p className={styles.summaryValue}>{globalOnTaskPercentage}%</p>
            </article>
            <article className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Clients with data</p>
              <p className={styles.summaryValue}>{rows.filter(row => row.appointmentsTracked > 0).length}</p>
            </article>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Client summary</h2>
            <div className={styles.row} style={{ marginBottom: 10 }}>
              <input
                className={styles.input}
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search client"
                aria-label="Search reports by client"
              />
            </div>

            {loading ? <p className={styles.subtle}>Loading reports...</p> : null}
            {error ? <p className={styles.subtle}>Unable to load reports: {error}</p> : null}

            {!loading && !error ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Appointments</th>
                      <th>Behaviour events</th>
                      <th>On-task / Off-task</th>
                      <th>Independent / Prompted / Not completed</th>
                      <th>Last captured</th>
                      <th>Graphs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={styles.subtle}>
                          No clients match your search or filters.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map(row => (
                        <tr key={row.clientId}>
                          <td>{row.clientName}</td>
                          <td>{row.appointmentsTracked}</td>
                          <td>{row.behaviourEventCount}</td>
                          <td>
                            {row.onTaskPercentage}% on-task ({formatDuration(row.onTaskSeconds)} / {formatDuration(row.offTaskSeconds)})
                          </td>
                          <td>
                            {row.independentTaskCount} / {row.promptedTaskCount} / {row.notCompletedTaskCount}
                          </td>
                          <td>{row.lastCapturedAt ? new Date(row.lastCapturedAt).toLocaleString() : 'No data yet'}</td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.button} ${styles.buttonGhost}`}
                              onClick={() => setSelectedClientReport(row)}
                            >
                              View Graphs
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {selectedClientReport ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Client report graphs"
          onClick={() => setSelectedClientReport(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 20, 30, 0.48)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1100,
          }}
        >
          <section
            className={styles.panel}
            onClick={event => event.stopPropagation()}
            style={{ width: 'min(860px, 95vw)', maxHeight: '88vh', overflow: 'auto' }}
          >
            <div className={styles.row} style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <div className={styles.row}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonGhost}`}
                  onClick={() => setSelectedClientReport(null)}
                >
                  Close
                </button>
                <h2 className={styles.sectionTitle}>Report Graphs: {selectedClientReport.clientName}</h2>
              </div>

              <div className={styles.row}>
                <label className={styles.subtle} htmlFor="report-range-select">
                  Date range
                </label>
                <select
                  id="report-range-select"
                  className={styles.select}
                  style={{ minWidth: 160 }}
                  value={selectedRange}
                  onChange={event => setSelectedRange(event.target.value as RangeOption)}
                >
                  <option value="all">All time</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </div>
            </div>

            <div className={styles.cardGrid}>
              <article className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Appointments tracked</p>
                <p className={styles.summaryValue}>{selectedClientReport.appointmentsTracked}</p>
              </article>
              <article className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Behaviour events</p>
                <p className={styles.summaryValue}>{selectedClientReport.behaviourEventCount}</p>
              </article>
              <article className={styles.summaryCard}>
                <p className={styles.summaryLabel}>On-task percentage</p>
                <p className={styles.summaryValue}>{selectedClientReport.onTaskPercentage}%</p>
              </article>
              <article className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Last captured</p>
                <p className={styles.summaryValue} style={{ fontSize: 14, fontWeight: 600 }}>
                  {selectedClientReport.lastCapturedAt
                    ? new Date(selectedClientReport.lastCapturedAt).toLocaleString()
                    : 'No data yet'}
                </p>
              </article>
            </div>

            <div className={styles.stack} style={{ marginTop: 14 }}>
              <section className={styles.panel}>
                <h3 className={styles.sectionTitle}>Time vs Frequency ({selectedRangeLabel})</h3>
                {timeSeriesLoading ? <p className={styles.subtle}>Loading time series...</p> : null}
                {!timeSeriesLoading && timeSeries.length === 0 ? (
                  <p className={styles.subtle}>
                    No behaviour event timeline data available yet for this client.
                  </p>
                ) : null}
                {!timeSeriesLoading && timeSeries.length > 0 ? (
                  <>
                    <LinePlot
                      points={timeSeries.map(point => ({
                        label: point.label,
                        value: point.frequency,
                      }))}
                    />
                    <p className={styles.subtle} style={{ marginTop: 10 }}>
                      X-axis: time buckets (hour). Y-axis: behaviour frequency count.
                    </p>
                  </>
                ) : null}
              </section>

              <section className={styles.panel}>
                <h3 className={styles.sectionTitle}>On-task vs Off-task (Bar Graph)</h3>
                <BarChart
                  points={[
                    { label: 'On task', value: selectedClientReport.onTaskSeconds, color: '#2f9e44' },
                    { label: 'Off task', value: selectedClientReport.offTaskSeconds, color: '#f08c00' },
                  ]}
                />
                <p className={styles.subtle} style={{ marginTop: 10 }}>
                  {selectedClientReport.onTaskPercentage}% on-task ({formatDuration(selectedClientReport.onTaskSeconds)} /{' '}
                  {formatDuration(selectedClientReport.offTaskSeconds)})
                </p>
              </section>

              <section className={styles.panel}>
                <h3 className={styles.sectionTitle}>Task Outcomes (Bar Graph)</h3>
                {(() => {
                  const totalTasks =
                    selectedClientReport.independentTaskCount +
                    selectedClientReport.promptedTaskCount +
                    selectedClientReport.notCompletedTaskCount

                  return (
                    <>
                      <BarChart
                        points={[
                          {
                            label: 'Independent',
                            value: selectedClientReport.independentTaskCount,
                            color: '#1864ab',
                          },
                          {
                            label: 'Prompted',
                            value: selectedClientReport.promptedTaskCount,
                            color: '#7b61ff',
                          },
                          {
                            label: 'Not completed',
                            value: selectedClientReport.notCompletedTaskCount,
                            color: '#d6336c',
                          },
                        ]}
                      />
                      <p className={styles.subtle} style={{ marginTop: 10 }}>
                        Independent {percentage(selectedClientReport.independentTaskCount, totalTasks)}% | Prompted{' '}
                        {percentage(selectedClientReport.promptedTaskCount, totalTasks)}% | Not completed{' '}
                        {percentage(selectedClientReport.notCompletedTaskCount, totalTasks)}%
                      </p>
                    </>
                  )
                })()}
              </section>

              <section className={styles.panel}>
                <h3 className={styles.sectionTitle}>Long-term Trend Analysis Across Appointments ({selectedRangeLabel})</h3>
                {appointmentTrendsLoading ? <p className={styles.subtle}>Loading long-term trends...</p> : null}
                {!appointmentTrendsLoading && appointmentTrends.length < 2 ? (
                  <p className={styles.subtle}>
                    At least two appointments with captured data are needed for long-term trend analysis.
                  </p>
                ) : null}

                {!appointmentTrendsLoading && appointmentTrends.length >= 2 ? (
                  <>
                    <MultiLineTrendPlot
                      points={appointmentTrends.map((row, index) => ({
                        label: String(index + 1),
                        behaviourEvents: row.behaviourEventCount,
                        onTaskPercentage: row.onTaskPercentage,
                        independentPercentage: row.independentPercentage,
                      }))}
                    />

                    {(() => {
                      const first = appointmentTrends[0]
                      const last = appointmentTrends[appointmentTrends.length - 1]
                      return (
                        <div className={styles.row} style={{ marginTop: 10, alignItems: 'flex-start' }}>
                          <p className={styles.subtle}>
                            Behaviour events trend: {trendDeltaLabel(first.behaviourEventCount, last.behaviourEventCount)}.
                          </p>
                          <p className={styles.subtle}>
                            On-task trend: {trendDeltaLabel(first.onTaskPercentage, last.onTaskPercentage, '%')}.
                          </p>
                          <p className={styles.subtle}>
                            Independent completion trend: {trendDeltaLabel(first.independentPercentage, last.independentPercentage, '%')}.
                          </p>
                        </div>
                      )
                    })()}

                    <div className={styles.tableWrap} style={{ marginTop: 10 }}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Appointment</th>
                            <th>Behaviour events</th>
                            <th>On-task %</th>
                            <th>Independent %</th>
                            <th>Prompted tasks</th>
                            <th>Not completed tasks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {appointmentTrends.map(row => (
                            <tr key={row.appointmentId}>
                              <td>{row.appointmentLabel}</td>
                              <td>{row.behaviourEventCount}</td>
                              <td>{row.onTaskPercentage}%</td>
                              <td>{row.independentPercentage}%</td>
                              <td>{row.promptedTaskCount}</td>
                              <td>{row.notCompletedTaskCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
