'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppointmentList } from '../../components/clinician/AppointmentList'
import { ClinicianSidebar } from '../../components/clinician/ClinicianSidebar'
import { DashboardCards } from '../../components/clinician/DashboardCards'
import { TopNavigation } from '../../components/clinician/TopNavigation'
import { fetchClinicianAppointments } from '../../lib/behaviour-tracking/service'
import type { Appointment } from '../../lib/behaviour-tracking/types'
import styles from '../../components/clinician/ClinicianPortal.module.css'

type AppointmentView = 'all' | 'day' | 'week' | 'month'

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatSelectedDate(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function startOfWeek(date: Date): Date {
  const start = new Date(date)
  const day = start.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + mondayOffset)
  start.setHours(0, 0, 0, 0)
  return start
}

function endOfWeek(date: Date): Date {
  const end = startOfWeek(date)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function normalizeDateInputValue(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return toDateInputValue(new Date())
  }

  const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  if (!isIsoDate) {
    return toDateInputValue(new Date())
  }

  const parsed = new Date(`${trimmed}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return toDateInputValue(new Date())
  }

  return trimmed
}

export default function ClinicianHomePage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()))
  const [view, setView] = useState<AppointmentView>('day')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const rows = await fetchClinicianAppointments()
        if (active) {
          setAppointments(rows)
          setError(null)
        }
      } catch (loadError) {
        if (active) {
          const message = loadError instanceof Error ? loadError.message : 'Unknown error'
          setError(message)
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

  const selectedDateObject = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate])

  const scheduledAppointments = useMemo(() => {
    if (view === 'all') {
      return appointments.filter(appointment => appointment.status !== 'cancelled')
    }

    const periodStart =
      view === 'week'
        ? startOfWeek(selectedDateObject)
        : view === 'month'
          ? new Date(selectedDateObject.getFullYear(), selectedDateObject.getMonth(), 1, 0, 0, 0, 0)
          : new Date(selectedDateObject.getFullYear(), selectedDateObject.getMonth(), selectedDateObject.getDate(), 0, 0, 0, 0)

    const periodEnd =
      view === 'week'
        ? endOfWeek(selectedDateObject)
        : view === 'month'
          ? new Date(selectedDateObject.getFullYear(), selectedDateObject.getMonth() + 1, 0, 23, 59, 59, 999)
          : new Date(selectedDateObject.getFullYear(), selectedDateObject.getMonth(), selectedDateObject.getDate(), 23, 59, 59, 999)

    return appointments.filter(appointment => {
      if (appointment.status === 'cancelled') return false
      const start = new Date(appointment.startsAt)
      return start >= periodStart && start <= periodEnd
    })
  }, [appointments, selectedDateObject, view])

  const filteredAppointments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return scheduledAppointments.filter(appointment => {
      if (!query) return true

      const haystack = [appointment.clientName, appointment.clinicianName, appointment.location ?? '']
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [scheduledAppointments, searchQuery])

  const selectedDateLabel = useMemo(() => {
    if (view === 'all') {
      return 'All dates'
    }

    if (view === 'week') {
      const weekStart = startOfWeek(selectedDateObject)
      const weekEnd = endOfWeek(selectedDateObject)
      return `${formatDateLabel(weekStart)} - ${formatDateLabel(weekEnd)}`
    }

    if (view === 'month') {
      return selectedDateObject.toLocaleDateString([], {
        month: 'long',
        year: 'numeric',
      })
    }

    return formatSelectedDate(selectedDate)
  }, [selectedDate, selectedDateObject, view])

  function shiftSelectedDate(days: number): void {
    const date = new Date(selectedDateObject)
    if (view === 'month') {
      date.setMonth(date.getMonth() + days)
    } else if (view === 'week') {
      date.setDate(date.getDate() + days * 7)
    } else {
      date.setDate(date.getDate() + days)
    }
    setSelectedDate(toDateInputValue(date))
  }

  function handleDatePickerChange(value: string): void {
    setSelectedDate(normalizeDateInputValue(value))
  }

  return (
    <main>
      <TopNavigation
        title="Clinician Dashboard"
        subtitle="Track appointments and open live behaviour dashboards."
        clinicianName={appointments[0]?.clinicianName}
      />

      <div className={styles.pageGrid}>
        <ClinicianSidebar activePath="/clinician" />

        <div className={styles.stack}>
          <DashboardCards appointments={filteredAppointments} />
          <section className={styles.panel}>
            <div className={styles.row}>
              <h2 className={styles.sectionTitle}>Appointments</h2>
            </div>

            <div className={styles.row} style={{ marginTop: 10 }}>
              <button
                type="button"
                className={view === 'all' ? styles.button : `${styles.button} ${styles.buttonGhost}`}
                onClick={() => setView('all')}
              >
                All
              </button>
              <button
                type="button"
                className={view === 'day' ? styles.button : `${styles.button} ${styles.buttonGhost}`}
                onClick={() => setView('day')}
              >
                Day
              </button>
              <button
                type="button"
                className={view === 'week' ? styles.button : `${styles.button} ${styles.buttonGhost}`}
                onClick={() => setView('week')}
              >
                Week
              </button>
              <button
                type="button"
                className={view === 'month' ? styles.button : `${styles.button} ${styles.buttonGhost}`}
                onClick={() => setView('month')}
              >
                Month
              </button>

              {view !== 'all' ? (
                <>
                  <input
                    type="date"
                    value={selectedDate}
                    onInput={event => handleDatePickerChange((event.target as HTMLInputElement).value)}
                    onChange={event => handleDatePickerChange(event.target.value)}
                    className={styles.select}
                    aria-label="Select appointment date"
                  />
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonGhost}`}
                    onClick={() => shiftSelectedDate(-1)}
                  >
                    {view === 'month' ? 'Previous month' : view === 'week' ? 'Previous week' : 'Previous day'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonGhost}`}
                    onClick={() => setSelectedDate(toDateInputValue(new Date()))}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonGhost}`}
                    onClick={() => shiftSelectedDate(1)}
                  >
                    {view === 'month' ? 'Next month' : view === 'week' ? 'Next week' : 'Next day'}
                  </button>
                </>
              ) : null}
            </div>

            <div className={styles.row} style={{ marginTop: 10 }}>
              <input
                className={styles.input}
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search client, clinician, or location"
                aria-label="Search appointments"
              />
            </div>
          </section>

          <AppointmentList
            appointments={filteredAppointments}
            loading={loading}
            error={error}
            title={view === 'all' ? 'All appointments' : `Appointments for ${selectedDateLabel}`}
          />
        </div>
      </div>
    </main>
  )
}
