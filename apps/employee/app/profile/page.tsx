"use client";

import Link from "next/link";
import { HubGate } from "@/components/hub-provider";
import { HrGate } from "@/components/hr-provider";
import { credentialLine, primaryCredential } from "@/lib/hr-store";
import { SignaturePad } from "@/components/signature-pad";
import { AvailabilityGrid } from "@summit/availability";
import { getSetting } from "@summit/settings";
import {
  getMyStaffAvailability, getMyStaffRecord, saveMyStaffAvailability, saveMyStaffContact,
  type MyStaffRecord,
} from "@/lib/hr-backend";

import * as React from "react";
import { getProfile, saveProfile } from "@/lib/hub";
import { IS_PREVIEW, setPreviewRole, type HubRole } from "@/lib/session";
import { SessionGate, useIdentity, useSession } from "@/components/session-provider";

/** My Profile: the fields that drive the hub. The start date sets every
 * onboarding and training deadline; role controls what the Admin page shows. */
export default function ProfilePage() {
  return (
    <HubGate>
      {/* HrGate too: the credential number below comes from the HR snapshot,
          and reading it before that store has loaded would render an empty
          field that looks like "you have no credential recorded". */}
      <HrGate>
        <Profile />
      </HrGate>
    </HubGate>
  );
}

function Profile() {
  const identity = useIdentity();
  const { reload } = useSession();
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => setReady(true), []);

  // The caller's own `staff` row (0075/0076) - phone, emergency contact and
  // availability live there, not on the hub_employee_profiles snapshot the
  // rest of this screen reads. `undefined` while loading, `null` means no
  // staff row exists yet (true for anyone invited before invite-teammate's
  // auto-provisioning existed).
  const [myStaff, setMyStaff] = React.useState<MyStaffRecord | null | undefined>(undefined);
  const [myAvailability, setMyAvailability] = React.useState<{ day: string; start_time: string; end_time: string }[]>([]);
  const [editingAvailability, setEditingAvailability] = React.useState(false);
  const [contactSaving, setContactSaving] = React.useState(false);

  const loadStaff = React.useCallback(() => {
    getMyStaffRecord(identity.userId).then((rec) => {
      setMyStaff(rec);
      if (rec) getMyStaffAvailability(rec.id).then(setMyAvailability);
    });
  }, [identity.userId]);
  React.useEffect(() => { if (ready) loadStaff(); }, [ready, loadStaff]);

  if (!ready) return <p className="sub">Loading profile…</p>;

  const p = getProfile();
  const patch = (k: string, v: string) => void saveProfile({ [k]: v } as never).then(force);

  async function patchContact(field: "phone" | "emergencyContactName" | "emergencyContactPhone", value: string) {
    if (!myStaff) return;
    setContactSaving(true);
    try {
      await saveMyStaffContact(myStaff.id, { [field]: value || null });
      setMyStaff({ ...myStaff, [field]: value || null });
    } finally {
      setContactSaving(false);
    }
  }

  return (
    <div>
      <h1 className="h-page">My Profile</h1>
      <p className="sub">Your start date drives every onboarding and training deadline.</p>

      <div className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="field"><label htmlFor="pr-name">Name</label>
          <input id="pr-name" className="input" defaultValue={p.name} onBlur={(e) => patch("name", e.target.value)} /></div>
        <div className="field"><label htmlFor="pr-num">Employee number</label>
          <input id="pr-num" className="input" defaultValue={p.employeeNumber} onBlur={(e) => patch("employeeNumber", e.target.value)} /></div>
        {/* Read-only on purpose. The number is recorded once on My Credentials
            and read here; a second place to type it is a second place for it to
            be wrong, and this is the field an insurer or a College checks. */}
        <div className="field">
          <label htmlFor="pr-cred">Professional credential</label>
          <input id="pr-cred" className="input" readOnly disabled
            value={credentialLine() ?? "None recorded"} />
          <p className="sub" style={{ fontSize: 11, marginTop: 4 }}>
            {primaryCredential()
              ? <>Recorded on <Link href="/credentials">My Credentials</Link>. Used on certificates and client receipts.</>
              : <>Add it on <Link href="/credentials">My Credentials</Link> so it can appear on certificates and client receipts.</>}
          </p>
        </div>
        <div className="field"><label htmlFor="pr-title">Job title</label>
          <input id="pr-title" className="input" defaultValue={p.jobTitle ?? ""} onBlur={(e) => patch("jobTitle", e.target.value)} /></div>
        <div className="field"><label htmlFor="pr-loc">Location</label>
          <select id="pr-loc" className="input" value={p.location ?? ""} onChange={(e) => patch("location", e.target.value)}>
            <option>Main Clinic</option><option>Community / In-Home</option><option>Virtual</option>
          </select></div>
        <div className="field"><label htmlFor="pr-start">Start date</label>
          <input id="pr-start" type="date" className="input" defaultValue={p.startDate ?? ""} onBlur={(e) => patch("startDate", e.target.value)} /></div>
        {IS_PREVIEW ? (
          <div className="field"><label htmlFor="pr-role">Role (preview switcher)</label>
            <select id="pr-role" className="input" value={identity.role}
              onChange={(e) => { setPreviewRole(e.target.value as HubRole); reload(); }}>
              <option value="EMPLOYEE">Employee</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ADMIN">Admin</option>
            </select></div>
        ) : (
          <div className="field"><label htmlFor="pr-role">Role</label>
            <input id="pr-role" className="input" value={identity.role} readOnly disabled /></div>
        )}
      </div>
      <p className="sub" style={{ marginTop: 10 }}>
        {IS_PREVIEW
          ? "Preview mode: the role switcher demos the supervisor and admin views. Signed in, your role comes from your Summit account and cannot be changed here."
          : "Your role comes from your Summit account. An administrator changes it."}
      </p>

      <h2 className="section-title">Contact &amp; emergency contact</h2>
      {myStaff === undefined ? (
        <p className="sub">Loading…</p>
      ) : myStaff === null ? (
        <div className="card card-pad">
          <p className="sub">
            Your account isn't linked to a staff record yet, so there's nowhere to save this. Ask your administrator to link one.
          </p>
        </div>
      ) : (
        <div className="card card-pad" style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div className="field"><label htmlFor="pr-phone">Phone</label>
            <input id="pr-phone" type="tel" className="input" disabled={contactSaving}
              defaultValue={myStaff.phone ?? ""} onBlur={(e) => patchContact("phone", e.target.value)} /></div>
          <div className="field"><label htmlFor="pr-ec-name">Emergency contact name</label>
            <input id="pr-ec-name" className="input" disabled={contactSaving}
              defaultValue={myStaff.emergencyContactName ?? ""} onBlur={(e) => patchContact("emergencyContactName", e.target.value)} /></div>
          <div className="field"><label htmlFor="pr-ec-phone">Emergency contact phone</label>
            <input id="pr-ec-phone" type="tel" className="input" disabled={contactSaving}
              defaultValue={myStaff.emergencyContactPhone ?? ""} onBlur={(e) => patchContact("emergencyContactPhone", e.target.value)} /></div>
        </div>
      )}

      {myStaff ? (
        <>
          <h2 className="section-title">Availability</h2>
          <div className="card card-pad">
            {editingAvailability ? (
              <AvailabilityGrid
                entityId={myStaff.id}
                entityType="staff"
                existingAvailability={myAvailability}
                workStart={Math.floor(Number(String(getSetting("calendar.workStart") || "08:00").split(":")[0]))}
                workEnd={Math.floor(Number(String(getSetting("calendar.workEnd") || "17:00").split(":")[0]))}
                workDays={String(getSetting("calendar.workDays") || "Mon,Tue,Wed,Thu,Fri").split(",").map((d) => d.trim())}
                incrementMinutes={Number(getSetting("calendar.gridIncrementMinutes")) || 30}
                onSave={async (ranges) => {
                  await saveMyStaffAvailability(myStaff.id, ranges.map((r) => ({
                    day: r.day, start_time: r.start_time, end_time: r.end_time, clinic_id: identity.clinicId!,
                  })));
                  setMyAvailability(ranges.map((r) => ({ day: r.day, start_time: r.start_time, end_time: r.end_time })));
                  setEditingAvailability(false);
                }}
                onCancel={() => setEditingAvailability(false)}
              />
            ) : (
              <>
                <p className="sub">
                  {myAvailability.length === 0 ? "Not set yet." : `${new Set(myAvailability.map((a) => a.day)).size} day(s) with availability set.`}
                </p>
                <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setEditingAvailability(true)}>
                  {myAvailability.length === 0 ? "Set availability" : "Edit availability"}
                </button>
              </>
            )}
          </div>
        </>
      ) : null}

      <SignaturePad />
    </div>
  );
}
