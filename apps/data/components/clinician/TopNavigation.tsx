import styles from './ClinicianPortal.module.css'

interface TopNavigationProps {
  title: string
  subtitle?: string
  clinicianName?: string
}

export function TopNavigation({ title, subtitle, clinicianName }: TopNavigationProps) {
  return (
    <header className={styles.topNav}>
      <div>
        <h1 className={styles.heading}>{title}</h1>
        {subtitle ? <p className={styles.topNavMeta}>{subtitle}</p> : null}
      </div>
      <div className={styles.topNavMeta}>Signed in clinician: {clinicianName ?? 'Clinician user'}</div>
    </header>
  )
}
