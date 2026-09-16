import * as React from 'react'
import Head from 'next/head'
import { AppNav } from '@summit/nav'
import { urlFor } from '@summit/portals'
import { ProfileProvider, ProfileGate, useIdentity, useSession } from '../components/profile-provider'

export default function ProfilePage() {
  return (
    <ProfileProvider>
      <Head><title>Profile · Summit</title></Head>
      <ProfileNav />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 80px' }}>
        <ProfileGate>
          <ProfileContent />
        </ProfileGate>
      </main>
    </ProfileProvider>
  )
}

function ProfileNav() {
  const { identity } = useSession()
  return <AppNav activeKey="profile" role={identity?.appRole ?? undefined} />
}

function ProfileContent() {
  const identity = useIdentity()
  if (identity.appRole === 'client') return <FamilyProfile />
  return <StaffProfile />
}

// ---------------------------------------------------------------------------
// Every role gets the same shape here: identity only, plus a link into
// wherever the real content actually lives. Staff-shaped roles (admin/
// supervisor/clinician/scheduler) go to apps/employee's "My Profile" (HR
// fields - employee number, job title, credential, signature, contact info,
// availability). `client` (family/guardian) goes to apps/client's "Your
// family" (children, household, emergency contacts, care team, home session
// preference, availability) - that page used to be read-only for household
// data and this one carried a second, editable copy; the write path moved
// there instead of staying duplicated here (2026-09-16).
// ---------------------------------------------------------------------------
function StaffProfile() {
  const identity = useIdentity()
  return (
    <div className="card card-pad">
      <h1 className="h-page">{identity.fullName ?? 'Your profile'}</h1>
      <p className="sub" style={{ marginTop: 4 }}>{roleLabel(identity.appRole)}</p>
      <a
        className="btn secondary"
        style={{ marginTop: 20, display: 'inline-block' }}
        href={`${urlFor('employee')}/profile`}
      >
        Open your full profile in the employee portal →
      </a>
    </div>
  )
}

function FamilyProfile() {
  const identity = useIdentity()
  return (
    <div className="card card-pad">
      <h1 className="h-page">{identity.fullName ?? 'Your profile'}</h1>
      <p className="sub" style={{ marginTop: 4 }}>Family account</p>
      <a
        className="btn secondary"
        style={{ marginTop: 20, display: 'inline-block' }}
        href={`${urlFor('client')}/family`}
      >
        Open your family record in the client portal →
      </a>
    </div>
  )
}

function roleLabel(role: string | null): string {
  switch (role) {
    case 'admin': return 'Admin'
    case 'supervisor': return 'Supervisor'
    case 'clinician': return 'Clinician'
    case 'scheduler': return 'Scheduler'
    default: return role ?? 'Signed in'
  }
}
