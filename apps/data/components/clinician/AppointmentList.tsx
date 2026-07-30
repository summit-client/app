import Link from 'next/link'
import type { Appointment } from '../../lib/behaviour-tracking/types'
import styles from './ClinicianPortal.module.css'

interface AppointmentListProps {
  appointments: Appointment[]
  loading: boolean
  error: string | null
  title?: string
}

function statusClass(status: Appointment['status']): string {
  if (status === 'scheduled') return `${styles.badge} ${styles.badgeScheduled}`
  if (status === 'in_progress') return `${styles.badge} ${styles.badgeInProgress}`
  if (status === 'completed') return `${styles.badge} ${styles.badgeCompleted}`
  return `${styles.badge} ${styles.badgeCancelled}`
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const end = new Date(endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${start} - ${end}`
}

export function AppointmentList({ appointments, loading, error, title = 'Appointments' }: AppointmentListProps) {
  if (loading) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.subtle}>Loading appointments...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.subtle}>Unable to load appointments: {error}</p>
      </section>
    )
  }

  if (appointments.length === 0) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.subtle}>No appointments are scheduled for this date.</p>
      </section>
    )
  }

  return (
    <section className={styles.panel} id="today-appointments">
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Client</th>
              <th>Time</th>
              <th>Clinician</th>
              <th>Status</th>
              <th>Behaviour tracking</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map(appointment => (
              <tr key={appointment.id}>
                <td>
                  <div>{appointment.clientName}</div>
                  <div className={styles.subtle}>{appointment.location ?? 'Room not set'}</div>
                </td>
                <td>{formatTimeRange(appointment.startsAt, appointment.endsAt)}</td>
                <td>{appointment.clinicianName}</td>
                <td>
                  <span className={statusClass(appointment.status)}>{appointment.status.replace('_', ' ')}</span>
                </td>
                <td>
                  <Link
                    className={styles.button}
                    href={`/clinician/appointments/${appointment.id}/behaviour-tracking`}
                  >
                    Open dashboard
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
