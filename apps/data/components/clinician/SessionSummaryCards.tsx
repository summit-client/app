import type { BehaviourSessionSummary } from '../../lib/behaviour-tracking/types'
import styles from './ClinicianPortal.module.css'

interface SessionSummaryCardsProps {
  summary: BehaviourSessionSummary
}

function formatMinutes(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  return `${mins} min`
}

export function SessionSummaryCards({ summary }: SessionSummaryCardsProps) {
  const cards = [
    { label: 'Session duration', value: formatMinutes(summary.sessionDurationSeconds) },
    { label: 'Behaviour frequency', value: String(summary.behaviourFrequencyCount) },
    { label: 'Avg time between behaviours', value: `${summary.averageInterResponseSeconds}s` },
    { label: 'On-task percentage', value: `${summary.onTaskPercentage}%` },
    { label: 'Off-task percentage', value: `${summary.offTaskPercentage}%` },
    {
      label: 'Independent completion',
      value: `${summary.independentTaskCompletionPercentage}%`,
    },
    { label: 'Prompted task count', value: String(summary.promptedTaskCount) },
  ]

  return (
    <section className={styles.cardGrid} aria-label="Behaviour dashboard summary cards">
      {cards.map(card => (
        <article key={card.label} className={styles.summaryCard}>
          <p className={styles.summaryLabel}>{card.label}</p>
          <p className={styles.summaryValue}>{card.value}</p>
        </article>
      ))}
    </section>
  )
}
