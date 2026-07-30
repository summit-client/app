import type { Appointment } from '../../lib/behaviour-tracking/types'
import styles from './ClinicianPortal.module.css'

interface DashboardCardsProps {
  appointments: Appointment[]
}

export function DashboardCards({ appointments }: DashboardCardsProps) {
  const now = Date.now()
  const totalPatients = new Set(appointments.map(appointment => appointment.clientId)).size
  const upcomingAppointments = appointments.filter(appointment => +new Date(appointment.startsAt) >= now).length
  const inProgress = appointments.filter(appointment => appointment.status === 'in_progress').length
  const completedToday = appointments.filter(appointment => appointment.status === 'completed').length

  return (
    <section className={styles.cardGrid} aria-label="Clinician dashboard summary">
      <article className={styles.summaryCard}>
        <p className={styles.summaryLabel}>Total patients</p>
        <p className={styles.summaryValue}>{totalPatients}</p>
      </article>
      <article className={styles.summaryCard}>
        <p className={styles.summaryLabel}>Upcoming appointments</p>
        <p className={styles.summaryValue}>{upcomingAppointments}</p>
      </article>
      <article className={styles.summaryCard}>
        <p className={styles.summaryLabel}>In progress now</p>
        <p className={styles.summaryValue}>{inProgress}</p>
      </article>
      <article className={styles.summaryCard}>
        <p className={styles.summaryLabel}>Completed today</p>
        <p className={styles.summaryValue}>{completedToday}</p>
      </article>
    </section>
  )
}
