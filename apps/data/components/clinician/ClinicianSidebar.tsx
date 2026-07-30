import Link from 'next/link'
import styles from './ClinicianPortal.module.css'

interface ClinicianSidebarProps {
  activePath: string
}

const links = [
  { href: '/clinician#today-appointments', label: 'Appointments' },
  { href: '/clinician/clients', label: 'Clients' },
  { href: '/clinician/goals', label: 'Goals' },
  { href: '/clinician/reports', label: 'Reports' },
]

export function ClinicianSidebar({ activePath }: ClinicianSidebarProps) {
  return (
    <aside className={styles.panel}>
      <h2 className={styles.sidebarTitle}>Clinician Portal</h2>
      <nav className={styles.sideNav} aria-label="Clinician navigation">
        {links.map(link => {
          const linkPath = link.href.split('#')[0]
          const isAppointmentsLink = link.href.includes('#today-appointments')
          const isActive = isAppointmentsLink
            ? activePath === '/clinician' || activePath.startsWith('/clinician/appointments')
            : activePath === linkPath

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.sideNavLink} ${isActive ? styles.sideNavLinkActive : ''}`.trim()}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
