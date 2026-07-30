'use client'

import type { TaskPromptLevel, TaskTrackingItem } from '../../lib/behaviour-tracking/types'
import { taskPromptLevelLabel } from '../../lib/behaviour-tracking/service'
import styles from './ClinicianPortal.module.css'

interface TaskPromptTrackerProps {
  taskItems: TaskTrackingItem[]
  onUpdateTask: (taskId: string, promptLevel: TaskPromptLevel) => void
}

const promptOptions: TaskPromptLevel[] = [
  'independent',
  'verbal_prompt',
  'gestural_prompt',
  'model_prompt',
  'physical_prompt',
  'not_completed',
]

export function TaskPromptTracker({ taskItems, onUpdateTask }: TaskPromptTrackerProps) {
  const independent = taskItems.filter(item => item.completed && item.promptLevel === 'independent').length
  const prompted = taskItems.filter(
    item => item.completed && item.promptLevel !== 'independent' && item.promptLevel !== 'not_completed'
  ).length
  const notCompleted = taskItems.filter(item => item.promptLevel === 'not_completed').length

  const independencePercentage = taskItems.length
    ? Math.round((independent / taskItems.length) * 100)
    : 0

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>C. Task completion and prompting</h2>

      <div className={styles.statRow}>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>Independent tasks</p>
          <p>{independent}</p>
        </div>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>Prompted tasks</p>
          <p>{prompted}</p>
        </div>
        <div className={styles.statBox}>
          <p className={styles.summaryLabel}>Not completed</p>
          <p>{notCompleted}</p>
          <p className={styles.subtle}>Independence: {independencePercentage}%</p>
        </div>
      </div>

      <div className={styles.tableWrap} style={{ marginTop: 10 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Task</th>
              <th>Completion</th>
              <th>Prompt level</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {taskItems.map(task => (
              <tr key={task.id}>
                <td>{task.taskName}</td>
                <td>{task.completed ? 'Completed' : 'Not completed'}</td>
                <td>
                  <select
                    className={styles.select}
                    value={task.promptLevel}
                    onChange={event => onUpdateTask(task.id, event.target.value as TaskPromptLevel)}
                  >
                    {promptOptions.map(option => (
                      <option key={option} value={option}>
                        {taskPromptLevelLabel(option)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{new Date(task.timestamp).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
