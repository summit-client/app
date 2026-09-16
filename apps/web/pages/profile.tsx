import * as React from 'react'
import Head from 'next/head'
import { AppNav } from '@summit/nav'
import { urlFor } from '@summit/portals'
import { supabase } from '../lib/supabase'
import { ProfileProvider, ProfileGate, useIdentity, useSession } from '../components/profile-provider'
import { motion, AnimatePresence } from 'motion/react'

type FamilyRow = {
  client_id: number
  client_name: string
  household_id: string | null
  permissions: string[]
  clinic_id: string
}

type Household = {
  id: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  phone: string | null
}

type Contact = {
  id: string
  full_name: string
  relationship: string
  phone: string | null
  phone_secondary: string | null
  email: string | null
  is_emergency_contact: boolean
}

type Preference = 'only' | 'if_required' | 'never'

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
// Staff-shaped roles (admin/supervisor/clinician/scheduler) - identity only.
// HR fields (employee number, job title, credential, signature) stay in
// apps/employee's existing "My Profile" rather than being duplicated here.
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

function roleLabel(role: string | null): string {
  switch (role) {
    case 'admin': return 'Admin'
    case 'supervisor': return 'Supervisor'
    case 'clinician': return 'Clinician'
    case 'scheduler': return 'Scheduler'
    default: return role ?? 'Signed in'
  }
}

// ---------------------------------------------------------------------------
// Family/guardian view.
// ---------------------------------------------------------------------------
function FamilyProfile() {
  const identity = useIdentity()
  const [family, setFamily] = React.useState<FamilyRow[] | null>(null)
  const [household, setHousehold] = React.useState<Household | null>(null)
  const [contacts, setContacts] = React.useState<Contact[]>([])
  const [preferences, setPreferences] = React.useState<Record<number, Preference>>({})
  const [selectedClient, setSelectedClient] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    const { data: familyRows, error: familyErr } = await supabase
      .from('my_family')
      .select('client_id, client_name, household_id, permissions, clinic_id')
    if (familyErr) { setError(familyErr.message); return }
    setFamily(familyRows as FamilyRow[])
    setSelectedClient((prev) => prev ?? (familyRows?.[0]?.client_id ?? null))

    const { data: householdRow } = await supabase.from('households').select('*').maybeSingle()
    setHousehold(householdRow as Household | null)

    if (householdRow) {
      const { data: memberRows } = await supabase
        .from('household_members')
        .select('id, full_name, relationship, phone, phone_secondary, email, is_emergency_contact')
        .eq('household_id', householdRow.id)
        .eq('is_emergency_contact', true)
      setContacts((memberRows as Contact[]) ?? [])
    }

    if (familyRows?.length) {
      const { data: prefRows } = await supabase
        .from('home_session_preferences')
        .select('client_id, preference')
        .in('client_id', familyRows.map((r) => r.client_id))
      const map: Record<number, Preference> = {}
      for (const row of (prefRows ?? []) as { client_id: number; preference: Preference }[]) {
        map[row.client_id] = row.preference
      }
      setPreferences(map)
    }
  }, [])

  React.useEffect(() => { void reload() }, [reload])

  if (error) {
    return (
      <div className="card card-pad">
        <h1 className="h-page">Couldn't load your profile</h1>
        <p className="sub" style={{ marginTop: 8 }}>{error}</p>
      </div>
    )
  }
  if (!family) return <p className="sub">Loading…</p>
  if (family.length === 0) {
    return (
      <div className="card card-pad">
        <h1 className="h-page">No linked profile yet</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          Your account isn't linked to a child's record yet. Contact your clinic to set this up.
        </p>
      </div>
    )
  }

  const canManageHousehold = family.some((r) => r.permissions.includes('manage_household'))

  async function savePreference(clientId: number, preference: Preference) {
    const row = family!.find((r) => r.client_id === clientId)
    if (!row) return
    const { error: prefErr } = await supabase.from('home_session_preferences').upsert(
      { client_id: clientId, clinic_id: row.clinic_id, preference, updated_by: identity.userId, updated_at: new Date().toISOString() },
      { onConflict: 'client_id' },
    )
    if (prefErr) { setError(prefErr.message); return }
    setPreferences((prev) => ({ ...prev, [clientId]: preference }))
  }

  async function saveHousehold(fields: Partial<Household>) {
    if (!household) return
    const { error: hhErr } = await supabase.from('households').update(fields).eq('id', household.id)
    if (hhErr) { setError(hhErr.message); return }
    setHousehold({ ...household, ...fields })
  }

  async function addContact(input: { full_name: string; relationship: string; phone: string; phone_secondary: string; email: string }) {
    if (!household) return
    const { data, error: insErr } = await supabase
      .from('household_members')
      .insert({
        clinic_id: family![0].clinic_id,
        household_id: household.id,
        full_name: input.full_name,
        relationship: input.relationship || 'emergency_contact',
        is_emergency_contact: true,
        phone: input.phone || null,
        phone_secondary: input.phone_secondary || null,
        email: input.email || null,
      })
      .select('id, full_name, relationship, phone, phone_secondary, email, is_emergency_contact')
      .single()
    if (insErr) { setError(insErr.message); return }
    setContacts((prev) => [...prev, data as Contact])
  }

  async function updateContact(id: string, fields: Partial<Contact>) {
    const { error: updErr } = await supabase.from('household_members').update(fields).eq('id', id)
    if (updErr) { setError(updErr.message); return }
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...fields } : c)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 className="h-page">{identity.fullName ?? 'Your profile'}</h1>
        <p className="sub" style={{ marginTop: 4 }}>Family account</p>
      </div>

      {family.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {family.map((r) => (
            <button
              key={r.client_id}
              className={r.client_id === selectedClient ? 'btn' : 'btn secondary'}
              onClick={() => setSelectedClient(r.client_id)}
            >
              {r.client_name}
            </button>
          ))}
        </div>
      )}

      {selectedClient != null && (
        <HomeSessionWizard
          clientName={family.find((r) => r.client_id === selectedClient)?.client_name ?? ''}
          value={preferences[selectedClient] ?? null}
          onChoose={(pref) => savePreference(selectedClient, pref)}
        />
      )}

      <HouseholdCard
        household={household}
        canEdit={canManageHousehold}
        onSave={saveHousehold}
      />

      <EmergencyContactsCard
        contacts={contacts}
        canEdit={canManageHousehold}
        onAdd={addContact}
        onUpdate={updateContact}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Setup wizard: no default preference exists in the schema on purpose (see
// migration 0073) - this is what makes that absence visible and nudges
// completion, with a small reward on choosing rather than a hard block.
// ---------------------------------------------------------------------------
function HomeSessionWizard({ clientName, value, onChoose }: {
  clientName: string
  value: Preference | null
  onChoose: (p: Preference) => void
}) {
  const [justSaved, setJustSaved] = React.useState(false)
  const options: { key: Preference; label: string; detail: string }[] = [
    { key: 'only', label: 'Only in-home', detail: 'Sessions should happen at home whenever possible.' },
    { key: 'if_required', label: 'If required', detail: 'In-home is fine when the clinic needs it.' },
    { key: 'never', label: 'Never', detail: 'Keep sessions out of the home.' },
  ]

  async function choose(p: Preference) {
    onChoose(p)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1800)
  }

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="h-page" style={{ fontSize: '1.05rem' }}>
          Home session preference{clientName ? ` — ${clientName}` : ''}
        </h2>
        <AnimatePresence>
          {justSaved && (
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              className="pill good"
            >
              ✓ Saved
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {value == null && (
        <p className="sub" style={{ marginTop: 4 }}>
          Not chosen yet — pick one so your clinic knows what to expect.
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const active = value === opt.key
          return (
            <motion.button
              key={opt.key}
              onClick={() => choose(opt.key)}
              whileTap={{ scale: 0.96 }}
              className={active ? 'btn' : 'btn secondary'}
              style={{ flex: '1 1 160px', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', height: 'auto', padding: '12px 14px' }}
            >
              <span style={{ fontWeight: 600 }}>{opt.label}</span>
              <span style={{ fontSize: '0.78rem', opacity: 0.85, fontWeight: 400 }}>{opt.detail}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

function HouseholdCard({ household, canEdit, onSave }: {
  household: Household | null
  canEdit: boolean
  onSave: (fields: Partial<Household>) => void
}) {
  const [draft, setDraft] = React.useState<Household | null>(household)
  React.useEffect(() => setDraft(household), [household])

  if (!household) {
    return (
      <div className="card card-pad">
        <h2 className="h-page" style={{ fontSize: '1.05rem' }}>Mailing address</h2>
        <p className="sub" style={{ marginTop: 8 }}>No household on file yet.</p>
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className="card card-pad">
        <h2 className="h-page" style={{ fontSize: '1.05rem' }}>Mailing address</h2>
        <p className="sub" style={{ marginTop: 4 }}>
          {household.address_line1
            ? [household.address_line1, household.address_line2, household.city, household.province, household.postal_code]
                .filter(Boolean).join(', ')
            : 'Not set yet.'}
        </p>
        <p className="sub" style={{ marginTop: 8 }}>
          You don't have edit access to this yet — contact your clinic to make changes.
        </p>
      </div>
    )
  }

  return (
    <div className="card card-pad">
      <h2 className="h-page" style={{ fontSize: '1.05rem' }}>Mailing address</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <div className="field">
          <label>Address line 1</label>
          <input className="input" value={draft?.address_line1 ?? ''} onChange={(e) => setDraft((d) => d && { ...d, address_line1: e.target.value })} />
        </div>
        <div className="field">
          <label>Address line 2</label>
          <input className="input" value={draft?.address_line2 ?? ''} onChange={(e) => setDraft((d) => d && { ...d, address_line2: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>City</label>
            <input className="input" value={draft?.city ?? ''} onChange={(e) => setDraft((d) => d && { ...d, city: e.target.value })} />
          </div>
          <div className="field" style={{ width: 100 }}>
            <label>Province</label>
            <input className="input" value={draft?.province ?? ''} onChange={(e) => setDraft((d) => d && { ...d, province: e.target.value })} />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label>Postal code</label>
            <input className="input" value={draft?.postal_code ?? ''} onChange={(e) => setDraft((d) => d && { ...d, postal_code: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Phone</label>
          <input className="input" value={draft?.phone ?? ''} onChange={(e) => setDraft((d) => d && { ...d, phone: e.target.value })} />
        </div>
        <button
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => draft && onSave(draft)}
        >
          Save address
        </button>
      </div>
    </div>
  )
}

function EmergencyContactsCard({ contacts, canEdit, onAdd, onUpdate }: {
  contacts: Contact[]
  canEdit: boolean
  onAdd: (input: { full_name: string; relationship: string; phone: string; phone_secondary: string; email: string }) => void
  onUpdate: (id: string, fields: Partial<Contact>) => void
}) {
  const [adding, setAdding] = React.useState(false)
  const [draft, setDraft] = React.useState({ full_name: '', relationship: 'emergency_contact', phone: '', phone_secondary: '', email: '' })

  return (
    <div className="card card-pad">
      <h2 className="h-page" style={{ fontSize: '1.05rem' }}>Emergency contacts</h2>
      {contacts.length === 0 && <p className="sub" style={{ marginTop: 8 }}>None on file yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {contacts.map((c) => (
          <div key={c.id} style={{ borderTop: '1px solid var(--line, #e5e5e5)', paddingTop: 10 }}>
            {canEdit ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input className="input" value={c.full_name} onChange={(e) => onUpdate(c.id, { full_name: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" placeholder="Phone" value={c.phone ?? ''} onChange={(e) => onUpdate(c.id, { phone: e.target.value })} />
                  <input className="input" placeholder="Second phone" value={c.phone_secondary ?? ''} onChange={(e) => onUpdate(c.id, { phone_secondary: e.target.value })} />
                </div>
                <input className="input" placeholder="Email" value={c.email ?? ''} onChange={(e) => onUpdate(c.id, { email: e.target.value })} />
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600 }}>{c.full_name}</div>
                <div className="sub">
                  {[c.phone, c.phone_secondary, c.email].filter(Boolean).join(' · ') || 'No contact details on file'}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        adding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, borderTop: '1px solid var(--line, #e5e5e5)', paddingTop: 12 }}>
            <input className="input" placeholder="Name" value={draft.full_name} onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="Phone" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
              <input className="input" placeholder="Second phone" value={draft.phone_secondary} onChange={(e) => setDraft((d) => ({ ...d, phone_secondary: e.target.value }))} />
            </div>
            <input className="input" placeholder="Email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                onClick={() => {
                  if (!draft.full_name) return
                  onAdd(draft)
                  setDraft({ full_name: '', relationship: 'emergency_contact', phone: '', phone_secondary: '', email: '' })
                  setAdding(false)
                }}
              >
                Add contact
              </button>
              <button className="btn secondary" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn secondary" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>
            + Add emergency contact
          </button>
        )
      )}
      {!canEdit && (
        <p className="sub" style={{ marginTop: 12 }}>
          You don't have edit access to this yet — contact your clinic to add or change a contact.
        </p>
      )}
    </div>
  )
}
