"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { BehaviourTrackingDashboard } from '../../../../../components/clinician/BehaviourTrackingDashboard'
import { ClinicianSidebar } from '../../../../../components/clinician/ClinicianSidebar'
import { TopNavigation } from '../../../../../components/clinician/TopNavigation'
import { getClientTrackingProfile } from '../../../../../lib/behaviour-tracking/clientBehaviourConfig'
import { fetchAppointmentById } from '../../../../../lib/behaviour-tracking/service'
import type { Appointment, ClientTrackingProfile } from '../../../../../lib/behaviour-tracking/types'
import styles from '../../../../../components/clinician/ClinicianPortal.module.css'

export default function BehaviourTrackingPage() {
  const params = useParams<{ appointmentId: string }>()
  const appointmentId = params?.appointmentId ?? ''

  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [trackingProfile, setTrackingProfile] = useState<ClientTrackingProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      if (!appointmentId) {
        if (active) {
          setError('Missing appointment id')
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)
        const record = await fetchAppointmentById(appointmentId)
        if (active) {
          if (!record) {
            setError('Appointment not found in scheduler data')
          } else {
            setAppointment(record)
            const configuredProfile = await getClientTrackingProfile(record.clientId)
            setTrackingProfile(configuredProfile)
            setError(null)
          }
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
  }, [appointmentId])

  if (loading) {
    return (
      <main>
        <TopNavigation title="Behaviour Tracking" subtitle="Loading appointment details..." />
        <div className={styles.pageGrid}>
            <ClinicianSidebar activePath="/clinician/appointments" />
          <section className={styles.panel}>Loading...</section>
        </div>
      </main>
    )
  }

  if (error || !appointment || !trackingProfile) {
    return (
      <main>
        <TopNavigation title="Behaviour Tracking" subtitle="Unable to load appointment" />
        <div className={styles.pageGrid}>
            <ClinicianSidebar activePath="/clinician/appointments" />
          <section className={styles.panel}>
            <p className={styles.subtle}>{error ?? 'Appointment not found'}</p>
            <Link href="/clinician" className={`${styles.button} ${styles.buttonGhost}`}>
              Back to appointments
            </Link>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main>
      <TopNavigation
        title={`Behaviour Tracking - ${appointment.clientName}`}
        subtitle={`Appointment ${appointment.id} | ${appointment.location ?? 'Location not set'}`}
        clinicianName={appointment.clinicianName}
      />

      <div className={styles.pageGrid}>
        <ClinicianSidebar activePath="/clinician/appointments" />

        <div className={styles.stack}>
          <section className={styles.panel}>
            <p className={styles.subtle}>
              Client: {appointment.clientName} | Session: {new Date(appointment.startsAt).toLocaleTimeString()} to{' '}
              {new Date(appointment.endsAt).toLocaleTimeString()}
            </p>
            <Link href="/clinician" className={`${styles.button} ${styles.buttonGhost}`}>
              Back to appointments
            </Link>
          </section>

          <BehaviourTrackingDashboard
            appointment={appointment}
            trackingProfile={trackingProfile}
          />
        </div>
      </div>
    </main>
  )
}
