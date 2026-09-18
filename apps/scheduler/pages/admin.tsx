import { useState, useEffect } from 'react';
import { supabase } from '@summit/db';
import { fetchAllRows } from '../lib/fetch-all-rows';
import { useContext } from 'react';
import { toast } from '@summit/toast';
import { UserContext } from '../lib/UserContext';
import Sidebar from '../components/Sidebar';
import { useFocusTrap } from '../lib/useFocusTrap';
import { carriesSessions } from '../lib/staff-roles';

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
// A clinic that has configured no session_types row gets an empty picker and
// a line of copy saying so, rather than four hardcoded names it never chose.
// There used to be a DEFAULT_SESSION_TYPES fallback here - identical for every
// clinic - and it could not survive migration 0086: a client's service is
// stored as `session_type_id` now, and a name with no row behind it has no id
// to write. Migration 0019 seeds every clinic a real set, so the empty case is
// a clinic mid-setup. See BLOCKED-scheduler.md.
// Descriptive only (2026-09-16) - staff-matching eligibility (pages/index.jsx's
// quickSlot/staff-step/AI-match filters) used to require a specialty chip
// whose text exactly matched a session type's name, which almost never
// happened (these two lists were never the same vocabulary - "Direct
// Therapy" the session type vs. "DTT" the specialty). Dropped from matching
// entirely rather than trying to reconcile the two taxonomies; eligibility
// is now location + capacity + availability only. Kept as a field since it's
// still useful staff metadata, just not a filter anymore.
const SPECIALTIES_OPTIONS = ['Autism', 'Behavioral Intervention', 'Parent Training', 'Social Skills', 'VB', 'DTT', 'NET'];
const STATUSES = ['active', 'inactive', 'waitlist'];

interface Staff {
  id: number;
  name: string;
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
  session_type: string | null;
  session_type_id: number | null;
  availability: string[];
  status: string;
  sessions: number;
  location_id: number | null;
  user_id: string | null;
  /** Home address - the scheduler calendar auto-fills this into a session's
   *  home_address when a clinician marks it as a home visit (still editable
   *  per session for a one-off). */
  address?: string | null;
  /** Waitlist triage fields (migration 0071). contact_phone/contact_email
   *  are deliberately separate from the pre-existing `email` field above
   *  (which writes to a column named `email` that, as far as this repo's
   *  migration history shows, was never actually added to `clients` -
   *  pre-existing, out of scope for this change, flagged in the PR
   *  description rather than fixed here). referral_source and
   *  waitlist_priority/waitlist_notes are settable from any client's
   *  lifecycle, not only while waitlisted - see this migration's header. */
  contact_phone?: string | null;
  contact_email?: string | null;
  referral_source?: string | null;
  waitlist_notes?: string | null;
  waitlist_priority?: string;
}

interface Location { id: number; name: string; }

const defaultStaffForm = { name: '', specialties: [] as string[], capacity: 20, location_id: null as number | null };
const defaultClientForm = {
  name: '', email: '', session_type_id: null as number | null, status: 'active', address: '',
  contact_phone: '', contact_email: '', referral_source: '', location_id: null as number | null,
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
  const [locations, setLocations] = useState<Location[]>([]);
  const [bookableTypes, setBookableTypes] = useState<{ id: number; name: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffForm, setStaffForm] = useState({ ...defaultStaffForm });
  const [clientForm, setClientForm] = useState({ ...defaultClientForm });
  const [error, setError] = useState<string | null>(null);
  // Set when fetchAll() came back with at least one failed query - see the
  // comment there for why `data || []` alone could not show this.
  const [loadFailed, setLoadFailed] = useState(false);
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
  // `is_client_optional` was not selected here - this query asked for `name`
  // alone, so the flag that says a type is a staff-only block was not
  // available to filter on below.
  const [staff, clients, bk, cal, types, locs] = await Promise.all([
    supabase.from('staff').select('*').order('name'),
    supabase.from('clients').select('*').order('name'),
    // Paged: this was the one unwindowed sessions read left in the portal,
    // so past PostgREST's 1000-row cap the sidebar's booked count silently
    // undercounted with nothing to say it had stopped. index.jsx wraps the
    // same read this way.
    fetchAllRows(() => supabase.from('sessions').select('*')),
    supabase.from('calendars').select('*'),
    supabase.from('session_types').select('id, name, is_client_optional').order('name'),
    supabase.from('locations').select('id, name').order('name'),
  ]);
  // Each of these used to be destructured as `{ data }` and stored as
  // `data || []`, which reads the success half and discards the failure
  // half. supabase-js resolves rather than rejecting on a failed query, so a
  // rejected read rendered as "No staff yet - add your first member" with
  // nothing logged and no way to tell the two apart.
  const queries: [string, { error: unknown }][] = [
    ['staff', staff], ['clients', clients], ['sessions', bk],
    ['calendars', cal], ['session_types', types], ['locations', locs],
  ];
  let anyFailed = false;
  for (const [table, res] of queries) {
    if (res.error) {
      anyFailed = true;
      console.error(`[scheduler/admin] fetchAll: ${table} query failed`, res.error);
    }
  }
  setLoadFailed(anyFailed);
  setStaffList(staff.data || []);
  setClientList(clients.data || []);
  setBookings(bk.data || []);
  setCalendars(cal.data || []);
  setLocations(locs.data || []);
  // This clinic's own configured session types (SessionTypeEditModal,
  // migration 0019), not the fixed four-item list every clinic used to be
  // stuck with here regardless of what it actually configured. Staff-only
  // blocks (Break, Lunch, Meeting - is_client_optional, 0019) are dropped:
  // this list backs a CLIENT record's own service, so "Lunch" was a
  // selectable service for a child.
  const bookable = (types.data || []).filter((t: { is_client_optional?: boolean }) => !t.is_client_optional);
  setBookableTypes(bookable.map((t: { id: number; name: string }) => ({ id: t.id, name: t.name })));
  setLoading(false);
}

  // Adapter onto @summit/toast. This page used to render its own toast -
  // bottom-right, dark, 3s - while pages/index.jsx rendered a different one
  // top-right, light, 5s. Two toasts in one app was the drift the shared
  // package exists to end; the call sites below are unchanged.
  function showToast(msg: string) {
    toast(msg);
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
        specialties: staffForm.specialties,
        capacity: staffForm.capacity,
        location_id: staffForm.location_id,
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
        // The pointer, not the label (migration 0086). `session_type` stays on
        // the row as the text it always was, for a record written before it.
        session_type_id: clientForm.session_type_id,
        status: clientForm.status,
        address: clientForm.address.trim() || null,
        contact_phone: clientForm.contact_phone.trim() || null,
        contact_email: clientForm.contact_email.trim() || null,
        referral_source: clientForm.referral_source.trim() || null,
        location_id: clientForm.location_id,
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
      backdropFilter: 'blur(2.8px)',
      WebkitBackdropFilter: 'blur(2.8px)',
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

  // This page has no gate of its own - it never needed one, because until
  // 2026-09-02 @summit/portals' ACCESS.scheduler admitted only admin and
  // scheduler, so _app.tsx's portal-wide `problem`/ROLE_EXCLUDED check
  // (see that file) already kept every other role out of the entire portal,
  // /admin included. Migration 0046 + that ACCESS.scheduler change gave
  // clinician a real reason to reach OTHER pages in this app (their own
  // booking), but not this one - staff/client/location/session-type/
  // calendar management stays admin/scheduler-only by design (this task's
  // explicit scope: booking parity, not administrative parity), and
  // clinician's `sessions`/`staff`/`clients` write policies (0046, all
  // scoped to their own linked staff row or read-only) don't cover any of
  // what this page writes. Without this check a clinician could navigate
  // here directly (Sidebar's "settings" item stays admin-only, but that
  // only hides the link, not the route) and see fully-enabled staff/client
  // forms whose Save would just fail against auth_is_scheduling_staff()'s
  // RLS - exactly the "don't offer an action that will just fail" trap this
  // whole change is otherwise careful about. Mirrors explainProblem's
  // ROLE_EXCLUDED tone; a local check because InvitePanel already has one
  // (line ~515) and neither reads through @summit/portals' admits().
  if (appUser && appUser.role !== 'admin' && appUser.role !== 'scheduler') {
    return (
      <>
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
          <div style={{ flex: 1, maxWidth: 640, margin: '48px auto', padding: '0 24px' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Admin is not for your role</h1>
            <p style={{ color: '#6B7280', fontSize: 15 }}>
              This screen manages staff, client, location and session-type records - admin and scheduler only.
              Your own schedule is under Dashboard, Calendar and Sessions in the sidebar.
            </p>
          </div>
        </div>
      </>
    );
  }

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
      {loadFailed && (
        <div role="alert" style={{ ...s.errorMsg, marginBottom: 20 }}>
          Some records couldn't be loaded, so these lists may be incomplete or empty. Reload the page — if it keeps happening, the browser console names which table failed.
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
      <input style={{ ...s.input, marginBottom: 0, width: 80 }} type="number" value={editForm.capacity ?? member.capacity} onChange={e => setEditForm(f => ({ ...f, capacity: Number(e.target.value) }))} />
      <select style={{ ...s.select, marginBottom: 0, width: 140 }} value={editForm.location_id ?? member.location_id ?? ''} onChange={e => setEditForm(f => ({ ...f, location_id: e.target.value ? Number(e.target.value) : null }))}>
        <option value="">No location set</option>
        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button style={s.btnPrimary} onClick={() => handleSave('staff', member.id)} disabled={saving}>Save</button>
      <button style={s.btnGhost} onClick={() => { setEditingId(null); setEditForm({}); }}>Cancel</button>
    </div>
  ) : (
    <>
      <div>
        <div style={s.cardName}>{member.name}</div>
        {/* Every staff row stays listed - this is the roster, and a hidden
            row is one nobody can configure or delete. Only the booked/capacity
            figure is scoped: every staff-shaped invite mints a row (an office
            manager included) with capacity 0, and "0/— sessions booked" on
            somebody who is never booked is noise. See ../lib/staff-roles. */}
        <div style={s.cardSub}>{carriesSessions(member) ? `${member.booked ?? 0}/${member.capacity ?? 0} sessions booked` : 'No capacity set - cannot be booked'}{member.specialties?.length ? ' · ' + member.specialties.join(', ') : ''} · {locations.find(l => l.id === member.location_id)?.name ?? 'No location set'}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* The credential badge that stood here read `staff.role`, retired by
            migration 0086. A person's credential lives in MySummitHR now,
            with its number and the supervisor who confirmed it. */}
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
      <input style={{ ...s.input, marginBottom: 0, width: 150 }} type="tel" value={editForm.contact_phone ?? client.contact_phone ?? ''} onChange={e => setEditForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="Phone" />
      <input style={{ ...s.input, marginBottom: 0, width: 180 }} type="email" value={editForm.contact_email ?? client.contact_email ?? ''} onChange={e => setEditForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="Contact email" />
      <input style={{ ...s.input, marginBottom: 0, width: 180 }} value={editForm.referral_source ?? client.referral_source ?? ''} onChange={e => setEditForm(f => ({ ...f, referral_source: e.target.value }))} placeholder="Referral source" />
      <select style={{ ...s.select, marginBottom: 0, width: 140 }} value={editForm.location_id ?? client.location_id ?? ''} onChange={e => setEditForm(f => ({ ...f, location_id: e.target.value ? Number(e.target.value) : null }))}>
        <option value="">No location set</option>
        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button style={s.btnPrimary} onClick={() => handleSave('clients', client.id)} disabled={saving}>Save</button>
      <button style={s.btnGhost} onClick={() => { setEditingId(null); setEditForm({}); }}>Cancel</button>
    </div>
  ) : (
    <>
      <div>
        <div style={s.cardName}>{client.name}</div>
        <div style={s.cardSub}>{client.email || 'No email'} · {bookableTypes.find(t => t.id === client.session_type_id)?.name ?? client.session_type ?? 'No service set'}{client.address ? ` · ${client.address}` : ''} · {locations.find(l => l.id === client.location_id)?.name ?? 'No location set'}</div>
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

                {/* No credential field. A clinical credential is not something
                    typed into a scheduling screen: migration 0086 moved it to
                    `employee_credentials`, where it carries an issuer and a
                    number and is confirmed by a named supervisor or admin
                    against the issuer's register. This screen sets capacity,
                    which is what decides whether somebody can be booked. */}
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

                <label style={s.label}>Location</label>
                <select
                  style={s.select}
                  value={staffForm.location_id ?? ''}
                  onChange={e => setStaffForm(f => ({ ...f, location_id: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">No location set</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
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

                <label style={s.label}>Contact Phone</label>
                <input
                  style={s.input}
                  type="tel"
                  value={clientForm.contact_phone}
                  onChange={e => setClientForm(f => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="(555) 555-5555"
                />

                <label style={s.label}>Contact Email</label>
                <input
                  style={s.input}
                  type="email"
                  value={clientForm.contact_email}
                  onChange={e => setClientForm(f => ({ ...f, contact_email: e.target.value }))}
                  placeholder="Best email to reach the family"
                />

                <label style={s.label}>Referral Source</label>
                <input
                  style={s.input}
                  value={clientForm.referral_source}
                  onChange={e => setClientForm(f => ({ ...f, referral_source: e.target.value }))}
                  placeholder="e.g. pediatrician referral, word of mouth"
                />

                <label style={s.label}>Session Type</label>
                <select
                  style={s.select}
                  value={clientForm.session_type_id ?? ''}
                  onChange={e => setClientForm(f => ({ ...f, session_type_id: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">{bookableTypes.length ? 'Select a service' : 'No session types configured yet'}</option>
                  {bookableTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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

                <label style={s.label}>Location</label>
                <select
                  style={s.select}
                  value={clientForm.location_id ?? ''}
                  onChange={e => setClientForm(f => ({ ...f, location_id: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">No location set</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
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

// InvitePanel removed (2026-09-16) - portal-access invites are now
// centralized in MySummitHR's Admin console (apps/employee/app/admin/
// page.tsx), one flow instead of two with independently-drifting role
// lists. handleCreateStaff/handleCreateClient above are untouched: they
// create scheduling records with no login at all, a different action from
// inviting someone, and stay here since this is where that data lives.
