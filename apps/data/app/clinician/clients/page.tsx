'use client'

import { useEffect, useMemo, useState } from 'react'
import { ClinicianSidebar } from '../../../components/clinician/ClinicianSidebar'
import { TopNavigation } from '../../../components/clinician/TopNavigation'
import {
  getClientTrackingProfile,
  saveClientTrackingProfile,
} from '../../../lib/behaviour-tracking/clientBehaviourConfig'
import { fetchClinicianClients } from '../../../lib/behaviour-tracking/service'
import type { BehaviourDefinition, ClientTrackingProfile, ClinicianClient } from '../../../lib/behaviour-tracking/types'
import styles from '../../../components/clinician/ClinicianPortal.module.css'

export default function ClinicianClientsPage() {
  const [clients, setClients] = useState<ClinicianClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [behaviours, setBehaviours] = useState<BehaviourDefinition[]>([])
  const [taskTemplates, setTaskTemplates] = useState<string[]>([])
  const [newBehaviourName, setNewBehaviourName] = useState('')
  const [newBehaviourDescription, setNewBehaviourDescription] = useState('')
  const [newTaskTemplateName, setNewTaskTemplateName] = useState('')
  const [onTaskLabel, setOnTaskLabel] = useState('On Task')
  const [offTaskLabel, setOffTaskLabel] = useState('Off Task')
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadClients() {
      try {
        setLoading(true)
        const rows = await fetchClinicianClients()
        if (!active) return
        setClients(rows)
        setSelectedClientId(rows[0]?.id ?? '')
        setError(null)
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Unknown error')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadClients()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadTrackingProfile() {
      if (!selectedClientId) {
        setBehaviours([])
        setTaskTemplates([])
        return
      }
      const profile = await getClientTrackingProfile(selectedClientId)
      if (active) {
        setBehaviours(profile.behaviours)
        setTaskTemplates(profile.taskTemplates)
        setOnTaskLabel(profile.timerLabels.onTask)
        setOffTaskLabel(profile.timerLabels.offTask)
      }
    }

    void loadTrackingProfile()
    return () => {
      active = false
    }
  }, [selectedClientId])

  const selectedClient = useMemo(
    () => clients.find(client => client.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  )

  const filteredClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return clients.filter(client => {
      if (!query) return true

      return [client.name, client.email ?? '', client.sessionType ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [clients, searchQuery])

  function handleAddBehaviour() {
    const name = newBehaviourName.trim()
    if (!name) return

    setBehaviours(previous => [
      ...previous,
      {
        id: `beh-custom-${Date.now()}`,
        name,
        description: newBehaviourDescription.trim() || undefined,
      },
    ])

    setNewBehaviourName('')
    setNewBehaviourDescription('')
  }

  function handleRemoveBehaviour(behaviourId: string) {
    setBehaviours(previous => previous.filter(item => item.id !== behaviourId))
  }

  function handleOpenCustomize(clientId: string) {
    setSelectedClientId(clientId)
    setNewBehaviourName('')
    setNewBehaviourDescription('')
    setNewTaskTemplateName('')
    setIsCustomizeOpen(true)
  }

  function handleCloseCustomize() {
    setIsCustomizeOpen(false)
  }

  function handleAddTaskTemplate() {
    const value = newTaskTemplateName.trim()
    if (!value) return
    setTaskTemplates(previous => {
      const exists = previous.some(task => task.toLowerCase() === value.toLowerCase())
      if (exists) return previous
      return [...previous, value]
    })
    setNewTaskTemplateName('')
  }

  function handleRemoveTaskTemplate(taskName: string) {
    setTaskTemplates(previous => previous.filter(task => task !== taskName))
  }

  async function handleSave() {
    if (!selectedClientId) return
    setSaving(true)
    const profile: ClientTrackingProfile = {
      behaviours,
      taskTemplates,
      timerLabels: {
        onTask: onTaskLabel,
        offTask: offTaskLabel,
      },
    }

    await saveClientTrackingProfile(selectedClientId, profile)
    setSaving(false)
    setToast('Tracking profile saved')
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <main>
      <TopNavigation
        title="Clients"
        subtitle="Personalize frequency targets, on/off-task labels, and task prompting per client."
      />

      <div className={styles.pageGrid}>
        <ClinicianSidebar activePath="/clinician/clients" />

        <div className={styles.stack}>
          {loading ? <section className={styles.panel}>Loading clients...</section> : null}
          {error ? <section className={styles.panel}>Unable to load clients: {error}</section> : null}

          {!loading && !error ? (
            <>
              <section className={styles.panel}>
                <h2 className={styles.sectionTitle}>Client list</h2>
                <div className={styles.row} style={{ marginBottom: 10 }}>
                  <input
                    className={styles.input}
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="Search client, email, or session type"
                    aria-label="Search clients"
                  />
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Status</th>
                        <th>Session type</th>
                        <th>Profile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={4} className={styles.subtle}>
                            No clients match your search or filters.
                          </td>
                        </tr>
                      ) : (
                        filteredClients.map(client => (
                          <tr key={client.id}>
                            <td>
                              <div>{client.name}</div>
                              <div className={styles.subtle}>{client.email ?? 'No email listed'}</div>
                            </td>
                            <td>{client.status ?? 'unknown'}</td>
                            <td>{client.sessionType ?? 'not set'}</td>
                            <td>
                              <button
                                type="button"
                                className={styles.button}
                                onClick={() => handleOpenCustomize(client.id)}
                              >
                                Customize
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>

      {isCustomizeOpen && selectedClient ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Customize client behaviour profile"
          onClick={handleCloseCustomize}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 20, 30, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1000,
          }}
        >
          <section
            className={styles.panel}
            onClick={event => event.stopPropagation()}
            style={{ width: 'min(980px, 95vw)', maxHeight: '88vh', overflow: 'auto' }}
          >
            <div className={styles.row} style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 className={styles.sectionTitle}>Tracking profile: {selectedClient.name}</h2>
              <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={handleCloseCustomize}>
                Close
              </button>
            </div>

            <h3 className={styles.sectionTitle} style={{ marginTop: 6 }}>A. Behaviour frequency configuration</h3>

            <div className={styles.row}>
              <input
                className={styles.input}
                value={newBehaviourName}
                onChange={event => setNewBehaviourName(event.target.value)}
                placeholder="Target behaviour name"
              />
              <input
                className={styles.input}
                value={newBehaviourDescription}
                onChange={event => setNewBehaviourDescription(event.target.value)}
                placeholder="Optional description"
              />
              <button type="button" className={styles.button} onClick={handleAddBehaviour}>
                Add behaviour
              </button>
            </div>

            <div className={styles.tableWrap} style={{ marginTop: 12 }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Behaviour</th>
                    <th>Description</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {behaviours.length === 0 ? (
                    <tr>
                      <td colSpan={3} className={styles.subtle}>
                        No behaviours configured yet.
                      </td>
                    </tr>
                  ) : (
                    behaviours.map(item => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.description ?? 'No description'}</td>
                        <td>
                          <button
                            type="button"
                            className={`${styles.button} ${styles.buttonDanger}`}
                            onClick={() => handleRemoveBehaviour(item.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h3 className={styles.sectionTitle} style={{ marginTop: 16 }}>B. On-task vs off-task labels</h3>

            <div className={styles.row}>
              <input
                className={styles.input}
                value={onTaskLabel}
                onChange={event => setOnTaskLabel(event.target.value)}
                placeholder="On-task label (e.g., Engaged)"
              />
              <input
                className={styles.input}
                value={offTaskLabel}
                onChange={event => setOffTaskLabel(event.target.value)}
                placeholder="Off-task label (e.g., Redirected)"
              />
            </div>

            <h3 className={styles.sectionTitle} style={{ marginTop: 16 }}>C. Task completion and prompting templates</h3>

            <div className={styles.row}>
              <input
                className={styles.input}
                value={newTaskTemplateName}
                onChange={event => setNewTaskTemplateName(event.target.value)}
                placeholder="Task name (e.g., Reading trial)"
              />
              <button type="button" className={styles.button} onClick={handleAddTaskTemplate}>
                Add task
              </button>
            </div>

            <div className={styles.tableWrap} style={{ marginTop: 12 }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Task template</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {taskTemplates.length === 0 ? (
                    <tr>
                      <td colSpan={2} className={styles.subtle}>
                        No task templates configured yet.
                      </td>
                    </tr>
                  ) : (
                    taskTemplates.map(taskName => (
                      <tr key={taskName}>
                        <td>{taskName}</td>
                        <td>
                          <button
                            type="button"
                            className={`${styles.button} ${styles.buttonDanger}`}
                            onClick={() => handleRemoveTaskTemplate(taskName)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.row} style={{ marginTop: 12 }}>
              <button type="button" className={styles.button} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save profile'}
              </button>
              {toast ? <span className={styles.subtle}>{toast}</span> : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
