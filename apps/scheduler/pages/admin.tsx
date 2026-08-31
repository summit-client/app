import { useState, useEffect } from 'react';
import { supabase } from '@summit/db';
import { useContext } from 'react';
import { UserContext } from '../lib/UserContext';
import Sidebar from '../components/Sidebar';
import { useFocusTrap } from '../lib/useFocusTrap';

type Tab = 'staff' | 'clients';

// Data-format bug, found and fixed this pass: this used to be
// ['monday', 'tuesday', ...] (full lowercase names), seeding new staff/
// client availability rows with a `day` value that matches nothing
// anywhere else in this app. Every OTHER place that reads or writes
// staff_availability/client_availability's `day` column - pages/index.jsx's
// AVAIL_DAYS, dateUtils.ts's WEEKDAY_ABBR (used throughout CalendarView,
// TimeGrid, RescheduleModal, suggestions.ts) - uses the three-letter,
// capitalized form ("Mon", "Tue", ...). A row seeded with day: "monday"
// never matched any of those comparisons, so it was invisible to the
// availability grid and to every availability check elsewhere in the app
// until someone opened and saved that entity's availability in the UI
// (which deletes and fully re-inserts in the correct format). Currently
// harmless in practice only because these seed rows are inserted with
// start_time/end_time both null, which already contributes zero selected
// slots regardless of day-format matching - but it's a real data-integrity
// bug waiting for the day something reads these rows directly.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROLES = ['BCBA', 'BCaBA', 'RBT', 'Supervisor'];
// Fallback only, for a clinic that has not configured any session_types row
// yet (migration 0019 seeds a default set for every clinic, so this should
// not normally be reached). Every clinic's real, editable list lives in the
// session_types table (see SessionTypeEditModal / CalendarView) - this used
// to be the only list a client's `session_type` field could ever be set to,
// hardcoded and identical for every clinic regardless of what session types
// that clinic actually configured. See BLOCKED-scheduler.md.
const DEFAULT_SESSION_TYPES = ['Assessment', 'RBA Supervision', 'Direct Therapy', 'Group Therapy'];
const SPECIALTIES_OPTIONS = ['Autism', 'Behavioral Intervention', 'Parent Training', 'Social Skills', 'VB', 'DTT', 'NET'];
const STATUSES = ['active', 'inactive', 'waitlist'];

interface Staff {
  id: number;
  name: string;
  role: string;
  specialties: string[];
  availability: string[];
  capacity: number;
  booked: number;
  location_id: number | null;
}

interface Client {
  id: number;
  name: string;
  email: string;
  session_type: string;
  availability: string[];
  status: string;
  sessions: number;
  location_id: number | null;
  user_id: string | null;
  /** Home address - the scheduler calendar auto-fills this into a session's
   *  home_address when a clinician marks it as a home visit (still editable
   *  per session for a one-off). */
  address?: string | null;
}

const defaultStaffForm = { name: '', role: 'RBT', specialties: [] as string[], capacity: 20 };
const defaultClientForm = { name: '', email: '', session_type: 'Direct Therapy', status: 'active', address: '' };

const roleColors: Record<string, string> = {
  BCBA: '#7C3AED', BCaBA: '#2563EB', RBT: '#16A34A', Supervisor: '#D97706',
};
const statusColors: Record<string, string> = {
  active: '#16A34A', inactive: '#6B7280', waitlist: '#D97706',
};

export default function AdminPage() {
  const appUser = useContext(UserContext);
  const [bookings, setBookings] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [tab, setTab] = useState<Tab>('staff');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [clientList, setClientList] = useState<Client[]>([]);
  const [sessionTypeNames, setSessionTypeNames] = useState<string[]>(DEFAULT_SESSION_TYPES);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffForm, setStaffForm] = useState({ ...defaultStaffForm });
  const [clientForm, setClientForm] = useState({ ...defaultClientForm });
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Staff & Client>>({});

  useEffect(() => { fetchAll(); }, []);

  // This modal had neither Escape-to-close nor any keyboard focus
  // containment - closing only worked via the outside-click handler already
  // on the overlay div below, or the Cancel button, so Tab could walk focus
  // straight out into the page underneath while it was open.
  useEffect(() => {
    if (!showModal) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleModalClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showModal]);
  const modalTrapRef = useFocusTrap<HTMLDivElement>(showModal);

async function fetchAll() {
  setLoading(true);
  const [{ data: staff }, { data: clients }, { data: bk }, { data: cal }, { data: types }] = await Promise.all([
    supabase.from('staff').select('*').order('name'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('sessions').select('*'),
    supabase.from('calendars').select('*'),
    supabase.from('session_types').select('name').order('name'),
  ]);
  setStaffList(staff || []);
  setClientList(clients || []);
  setBookings(bk || []);
  setCalendars(cal || []);
  // This clinic's own configured session types (SessionTypeEditModal,
  // migration 0019), not the fixed four-item list every clinic used to be
  // stuck with here regardless of what it actually configured.
  setSessionTypeNames(types?.length ? types.map((t: { name: string }) => t.name) : DEFAULT_SESSION_TYPES);
  setLoading(false);
}

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function toggleSpecialty(s: string) {
    setStaffForm(f => ({
      ...f,
      specialties: f.specialties.includes(s)
        ? f.specialties.filter(x => x !== s)
        : [...f.specialties, s],
    }));
  }

  async function handleCreateStaff() {
    if (!staffForm.name.trim()) { setError('Name is required.'); return; }
    setError(null);
    setSaving(true);
    const { data, error: insertErr } = await supabase
      .from('staff')
      .insert([{
        name: staffForm.name.trim(),
        role: staffForm.role,
        specialties: staffForm.specialties,
        capacity: staffForm.capacity,
        booked: 0,
        availability: [],
        clinic_id: appUser.clinic_id,
      }])
      .select()
      .single();

    if (insertErr || !data) {
      setError(insertErr?.message || 'Insert failed.');
      setSaving(false);
      return;
    }

    // Auto-link: seed availability rows Mon–Sat
    const availRows = DAYS.map(day => ({
      staff_id: data.id,
      day,
      start_time: null,
      end_time: null,
      clinic_id: appUser.clinic_id,
    }));
    await supabase.from('staff_availability').insert(availRows);

    showToast(`${data.name} added`);
    setStaffForm({ ...defaultStaffForm });
    setShowModal(false);
    await fetchAll();
    setSaving(false);
  }

  async function handleCreateClient() {
    if (!clientForm.name.trim()) { setError('Name is required.'); return; }
    setError(null);
    setSaving(true);
    const { data, error: insertErr } = await supabase
      .from('clients')
      .insert([{
        name: clientForm.name.trim(),
        email: clientForm.email.trim() || null,
        session_type: clientForm.session_type,
        status: clientForm.status,
        address: clientForm.address.trim() || null,
        sessions: 0,
        availability: [],
        clinic_id: appUser.clinic_id,
      }])
      .select()
      .single();

    if (insertErr || !data) {
      setError(insertErr?.message || 'Insert failed.');
      setSaving(false);
      return;
    }

    // Auto-link: seed availability rows Mon–Sat
    const availRows = DAYS.map(day => ({
      client_id: data.id,
      day,
      start_time: null,
      end_time: null,
      clinic_id: appUser.clinic_id,
    }));
    await supabase.from('client_availability').insert(availRows);

    showToast(`${data.name} added`);
    setClientForm({ ...defaultClientForm });
    setShowModal(false);
    await fetchAll();
    setSaving(false);
  }

  function handleModalClose() {
    setShowModal(false);
    setError(null);
    setStaffForm({ ...defaultStaffForm });
    setClientForm({ ...defaultClientForm });
  }
  async function handleDelete(type: 'staff' | 'clients', id: number, name: string) {
  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
  let deleteErr;
  if (type === 'staff') {
    await supabase.from('staff_availability').delete().eq('staff_id', id);
    ({ error: deleteErr } = await supabase.from('staff').delete().eq('id', id));
  } else {
    await supabase.from('client_availability').delete().eq('client_id', id);
    // Clinical tables now carry a foreign key on client_id (migration 0011),
    // so this fails instead of silently orphaning records once the client
    // has any clinical history - that's a database error here, not a bug.
    ({ error: deleteErr } = await supabase.from('clients').delete().eq('id', id));
  }
  if (deleteErr) {
    setError(`Could not delete ${name}: this record still has clinical history attached.`);
    return;
  }
  showToast(`${name} deleted`);
  await fetchAll();
}
async function handleSave(type: 'staff' | 'clients', id: number) {
  setError(null);
  setSaving(true);

  const { error: saveErr } = await supabase
    .from(type)
    .update(editForm)
    .eq('id', id);

  if (saveErr) {
    setError('Could not save changes. Please try again.');
    setSaving(false);
    return;
  }

  setEditingId(null);
  setEditForm({});
  showToast('Saved');
  await fetchAll();
  setSaving(false);
}

  // ── Styles ──────────────────────────────────────────────────────────────────

  const s = {
    page: {
  color: '#111827',
} as React.CSSProperties,

    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 32,
    } as React.CSSProperties,

    title: { fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px' } as React.CSSProperties,

    tabs: {
      display: 'flex',
      gap: 0,
      borderBottom: '1.5px solid #E5E7EB',
      marginBottom: 28,
    } as React.CSSProperties,

    tab: (active: boolean): React.CSSProperties => ({
      padding: '9px 22px',
      background: 'none',
      border: 'none',
      borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
      marginBottom: -1.5,
      color: active ? '#2563EB' : '#6B7280',
      fontWeight: active ? 600 : 400,
      fontSize: 14,
      cursor: 'pointer',
      transition: 'color 0.15s',
    }),

    btnPrimary: {
      padding: '9px 18px',
      borderRadius: 8,
      border: 'none',
      background: '#2563EB',
      color: 'white',
      fontWeight: 600,
      fontSize: 14,
      cursor: 'pointer',
    } as React.CSSProperties,
    btnDelete: {
      padding: '4px 9px',
      borderRadius: 6,
      border: '1px solid #FECACA',
      background: '#FEF2F2',
      color: '#DC2626',
      fontSize: 13,
      cursor: 'pointer',
      lineHeight: 1,
    } as React.CSSProperties,

    btnGhost: {
      padding: '9px 18px',
      borderRadius: 8,
      border: '1px solid #E5E7EB',
      background: 'white',
      color: '#374151',
      fontWeight: 500,
      fontSize: 14,
      cursor: 'pointer',
    } as React.CSSProperties,

    card: {
      background: 'white',
      border: '1px solid #E5E7EB',
      borderRadius: 10,
      padding: '14px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 10,
    } as React.CSSProperties,

    cardName: { fontWeight: 600, fontSize: 15 } as React.CSSProperties,

    cardSub: {
      color: '#6B7280',
      fontSize: 13,
      marginTop: 2,
    } as React.CSSProperties,

    badge: (color: string): React.CSSProperties => ({
      background: color + '1a',
      color,
      padding: '3px 11px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }),

    empty: {
      color: '#9CA3AF',
      textAlign: 'center',
      marginTop: 64,
      fontSize: 14,
    } as React.CSSProperties,

    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    } as React.CSSProperties,

    modal: {
      background: 'white',
      borderRadius: 14,
      padding: 32,
      width: 460,
      maxHeight: '85vh',
      overflowY: 'auto',
      boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    } as React.CSSProperties,

    modalTitle: { fontSize: 20, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.3px' } as React.CSSProperties,

    label: {
      display: 'block',
      fontSize: 13,
      fontWeight: 500,
      color: '#374151',
      marginBottom: 6,
    } as React.CSSProperties,

    input: {
      width: '100%',
      padding: '9px 12px',
      borderRadius: 8,
      border: '1px solid #D1D5DB',
      fontSize: 14,
      marginBottom: 18,
      boxSizing: 'border-box',
      outline: 'none',
      fontFamily: 'Inter, sans-serif',
    } as React.CSSProperties,

    select: {
      width: '100%',
      padding: '9px 12px',
      borderRadius: 8,
      border: '1px solid #D1D5DB',
      fontSize: 14,
      marginBottom: 18,
      boxSizing: 'border-box',
      background: 'white',
      fontFamily: 'Inter, sans-serif',
    } as React.CSSProperties,

    chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 } as React.CSSProperties,

    chip: (active: boolean): React.CSSProperties => ({
      padding: '4px 13px',
      borderRadius: 20,
      fontSize: 13,
      cursor: 'pointer',
      border: active ? '1.5px solid #2563EB' : '1px solid #E5E7EB',
      background: active ? '#EFF6FF' : 'white',
      color: active ? '#2563EB' : '#6B7280',
      userSelect: 'none',
      transition: 'all 0.1s',
    }),

    errorMsg: {
      color: '#DC2626',
      fontSize: 13,
      marginBottom: 16,
      padding: '8px 12px',
      background: '#FEF2F2',
      borderRadius: 8,
    } as React.CSSProperties,

    modalFooter: {
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end',
      marginTop: 8,
    } as React.CSSProperties,
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile sidebar drawer toggle - see the comment on .scheduler-sidebar
          in styles/globals.css. */}
      <input type="checkbox" id="nav-toggle" className="nav-toggle-input" />
      <div className="mobile-topbar">
        <label htmlFor="nav-toggle" className="nav-toggle-btn" aria-label="Open menu">
          <span /><span /><span />
        </label>
        <span className="mobile-topbar-title">Summit Scheduler</span>
      </div>
      <label htmlFor="nav-toggle" className="nav-toggle-backdrop" aria-hidden="true" />
      <div className="scheduler-shell" style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-background-tertiary)', fontFamily: 'Inter, sans-serif', fontSize: 16 }}>
        <Sidebar view="admin" onNavigate={() => {}} appUser={appUser} bookings={bookings} calendars={calendars} />
        <main style={{ flex: 1, padding: '32px 36px', overflowY: 'auto' }}>
      <div style={s.page}>   {/* keep but remove padding/maxWidth since main handles it */}
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#111827', color: 'white',
          padding: '12px 20px', borderRadius: 10,
          fontSize: 14, zIndex: 2000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          ✓ {toast}
        </div>
      )}

      <div style={s.header}>
        <h1 style={s.title}>User Management</h1>
        <button style={s.btnPrimary} onClick={() => setShowModal(true)}>
          + New {tab === 'staff' ? 'Staff' : 'Client'}
        </button>
      </div>

     {error && editingId !== null && (
  <div style={s.errorMsg}>{error}</div>
)}

<div style={s.tabs}>
        <button style={s.tab(tab === 'staff')} onClick={() => setTab('staff')}>
          Staff ({staffList.length})
        </button>
        <button style={s.tab(tab === 'clients')} onClick={() => setTab('clients')}>
          Clients ({clientList.length})
        </button>
      </div>

      {appUser && (appUser.role === 'admin' || appUser.role === 'scheduler') ? (
        <InvitePanel role={appUser.role} clients={clientList} onDone={showToast} />
      ) : null}

      {loading ? (
        <p style={s.empty}>Loading...</p>
      ) : tab === 'staff' ? (
        staffList.length === 0
          ? <p style={s.empty}>No staff yet — add your first member.</p>
          : staffList.map(member => (
            <div key={member.id} style={s.card}>
  {editingId === member.id ? (
    <div style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <input style={{ ...s.input, marginBottom: 0, width: 160 }} value={editForm.name ?? member.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
      <select style={{ ...s.select, marginBottom: 0, width: 120 }} value={editForm.role ?? member.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
        {ROLES.map(r => <option key={r}>{r}</option>)}
      </select>
      <input style={{ ...s.input, marginBottom: 0, width: 80 }} type="number" value={editForm.capacity ?? member.capacity} onChange={e => setEditForm(f => ({ ...f, capacity: Number(e.target.value) }))} />
      <button style={s.btnPrimary} onClick={() => handleSave('staff', member.id)} disabled={saving}>Save</button>
      <button style={s.btnGhost} onClick={() => { setEditingId(null); setEditForm({}); }}>Cancel</button>
    </div>
  ) : (
    <>
      <div>
        <div style={s.cardName}>{member.name}</div>
        <div style={s.cardSub}>{member.booked ?? 0}/{member.capacity ?? '—'} sessions booked{member.specialties?.length ? ' · ' + member.specialties.join(', ') : ''}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={s.badge(roleColors[member.role] || '#6B7280')}>{member.role}</span>
        <button style={s.btnGhost} onClick={() => { setError(null); setEditingId(member.id); setEditForm({}); }}>Edit</button>
        <button aria-label={`Delete ${member.name}`} style={s.btnDelete} onClick={() => handleDelete('staff', member.id, member.name)}>✕</button>
      </div>
    </>
  )}
</div>
          ))
      ) : (
        clientList.length === 0
          ? <p style={s.empty}>No clients yet — add your first.</p>
          : clientList.map(client => (
            <div key={client.id} style={s.card}>
  {editingId === client.id ? (
    <div style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <input style={{ ...s.input, marginBottom: 0, width: 160 }} value={editForm.name ?? client.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
      <input style={{ ...s.input, marginBottom: 0, width: 180 }} type="email" value={editForm.email ?? client.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
      <select style={{ ...s.select, marginBottom: 0, width: 140 }} value={editForm.status ?? client.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
        {STATUSES.map(st => <option key={st}>{st}</option>)}
      </select>
      <input style={{ ...s.input, marginBottom: 0, width: 200 }} value={editForm.address ?? client.address ?? ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Address" />
      <button style={s.btnPrimary} onClick={() => handleSave('clients', client.id)} disabled={saving}>Save</button>
      <button style={s.btnGhost} onClick={() => { setEditingId(null); setEditForm({}); }}>Cancel</button>
    </div>
  ) : (
    <>
      <div>
        <div style={s.cardName}>{client.name}</div>
        <div style={s.cardSub}>{client.email || 'No email'} · {client.session_type}{client.address ? ` · ${client.address}` : ''}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={s.badge(statusColors[client.status] || '#6B7280')}>{client.status}</span>
        <button style={s.btnGhost} onClick={() => { setError(null); setEditingId(client.id); setEditForm({}); }}>Edit</button>
        <button aria-label={`Delete ${client.name}`} style={s.btnDelete} onClick={() => handleDelete('clients', client.id, client.name)}>✕</button>
      </div>
    </>
  )}
</div>
          ))
      )}

      {/* Modal */}
      {showModal && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && handleModalClose()}>
          <div ref={modalTrapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={tab === 'staff' ? 'Add Staff Member' : 'Add Client'} style={s.modal}>
            <h2 style={s.modalTitle}>
              {tab === 'staff' ? 'Add Staff Member' : 'Add Client'}
            </h2>

            {error && <div style={s.errorMsg}>{error}</div>}

            {tab === 'staff' ? (
              <>
                <label style={s.label}>Name *</label>
                <input
                  style={s.input}
                  value={staffForm.name}
                  onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  autoFocus
                />

                <label style={s.label}>Role</label>
                <select
                  style={s.select}
                  value={staffForm.role}
                  onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>

                <label style={s.label}>Weekly Session Capacity</label>
                <input
                  style={s.input}
                  type="number"
                  value={staffForm.capacity}
                  onChange={e => setStaffForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                  min={1}
                  max={60}
                />

                <label style={s.label}>Specialties</label>
                <div style={s.chipRow}>
                  {SPECIALTIES_OPTIONS.map(sp => (
                    <span key={sp} style={s.chip(staffForm.specialties.includes(sp))} onClick={() => toggleSpecialty(sp)}>
                      {sp}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label style={s.label}>Name *</label>
                <input
                  style={s.input}
                  value={clientForm.name}
                  onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  autoFocus
                />

                <label style={s.label}>Email</label>
                <input
                  style={s.input}
                  type="email"
                  value={clientForm.email}
                  onChange={e => setClientForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="client@email.com"
                />

                <label style={s.label}>Session Type</label>
                <select
                  style={s.select}
                  value={clientForm.session_type}
                  onChange={e => setClientForm(f => ({ ...f, session_type: e.target.value }))}
                >
                  {sessionTypeNames.map(t => <option key={t}>{t}</option>)}
                </select>

                <label style={s.label}>Status</label>
                <select
                  style={s.select}
                  value={clientForm.status}
                  onChange={e => setClientForm(f => ({ ...f, status: e.target.value }))}
                >
                  {STATUSES.map(st => <option key={st}>{st}</option>)}
                </select>

                <label style={s.label}>Address</label>
                <input
                  style={s.input}
                  value={clientForm.address}
                  onChange={e => setClientForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Used for home-visit sessions"
                />
              </>
            )}

            <div style={s.modalFooter}>
              <button style={s.btnGhost} onClick={handleModalClose}>Cancel</button>
              <button
                style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }}
                onClick={tab === 'staff' ? handleCreateStaff : handleCreateClient}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Create & Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </main>
    </div>
    </>
  );
}

/**
 * Portal access, not a scheduler record. `handleCreateStaff`/`handleCreateClient`
 * above create rows in this app's own `staff`/`clients` tables (the scheduling
 * data) - they create no login, exactly what "adding someone" used to
 * (falsely) claim in apps/employee's admin tab before 2026-08-28. This calls
 * the invite-teammate Supabase Edge Function (supabase/functions/), which
 * does the actual account creation with the service-role key - a key that,
 * per CLAUDE.md, must never sit in any app's env, which is why this can't be
 * a Next.js API route here either.
 *
 * Scheduler's own reach is this app only (@summit/portals' ACCESS map admits
 * scheduler here, not to apps/employee), so an admin/scheduler-role invite of
 * a client or clinician happens from here; a scheduler-role invite of
 * anything else, or setting a new clinician's supervisor, is admin's to do
 * from apps/employee's Staff & Teams tab instead.
 */
function InvitePanel({
  role, clients, onDone,
}: { role: 'admin' | 'scheduler'; clients: Client[]; onDone: (msg: string) => void }) {
  const roleOptions = role === 'admin'
    ? (['admin', 'supervisor', 'clinician', 'scheduler', 'client'] as const)
    : (['client', 'clinician'] as const);
  const unlinkedClients = clients.filter((c) => !c.user_id);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [inviteRole, setInviteRole] = useState<string>(roleOptions[roleOptions.length - 1]);
  const [clientId, setClientId] = useState<number | ''>('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!email.trim()) return;
    if (inviteRole === 'client' && clientId === '') {
      setError('Pick an existing client record to link.');
      return;
    }
    setSending(true);
    setError(null);
    const { data, error: fnErr } = await supabase.functions.invoke('invite-teammate', {
      body: {
        email: email.trim(),
        full_name: inviteRole !== 'client' && fullName.trim() ? fullName.trim() : undefined,
        role: inviteRole,
        client_id: inviteRole === 'client' ? clientId : undefined,
      },
    });
    setSending(false);
    if (fnErr || (data as { error?: string } | null)?.error) {
      setError((data as { error?: string } | null)?.error ?? fnErr?.message ?? 'Could not send the invite.');
      return;
    }
    setEmail('');
    setFullName('');
    setClientId('');
    onDone(`Invite sent to ${email.trim()}.`);
  }

  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #E5E7EB' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Invite portal access</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {inviteRole !== 'client' ? (
          <input
            type="text" placeholder="Full name" value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB', minWidth: 160 }}
          />
        ) : null}
        <input
          type="email" placeholder="Email address" value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB', minWidth: 220 }}
        />
        <select
          value={inviteRole} onChange={(e) => { setInviteRole(e.target.value); setClientId(''); }}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB' }}
        >
          {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {inviteRole === 'client' ? (
          <select
            value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB', minWidth: 200 }}
          >
            <option value="">Which client record?</option>
            {unlinkedClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : null}
        <button
          onClick={send} disabled={sending || !email.trim()}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1A3F5C', color: 'white', cursor: 'pointer', opacity: sending ? 0.7 : 1 }}
        >
          {sending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
      {inviteRole === 'client' && !unlinkedClients.length ? (
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>
          No unlinked client records in this clinic - add one under the Clients tab first.
        </p>
      ) : null}
      {error ? <p style={{ fontSize: 12, color: '#DC2626', marginTop: 8 }}>{error}</p> : null}
    </div>
  );
}
