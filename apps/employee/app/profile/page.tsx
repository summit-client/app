"use client";

import * as React from "react";
import { getProfile, saveProfile } from "@/lib/hub";
import { IS_PREVIEW, setPreviewRole, type HubRole } from "@/lib/session";
import { SessionGate, useIdentity, useSession } from "@/components/session-provider";

/** My Profile: the fields that drive the hub. The start date sets every
 * onboarding and training deadline; role controls what the Admin page shows. */
export default function ProfilePage() {
  return (
    <SessionGate>
      <Profile />
    </SessionGate>
  );
}

function Profile() {
  const identity = useIdentity();
  const { reload } = useSession();
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading profile…</p>;

  const p = getProfile();
  const patch = (k: string, v: string) => void saveProfile({ [k]: v } as never).then(force);

  return (
    <div>
      <h1 className="h-page">My Profile</h1>
      <p className="sub">Your start date drives every onboarding and training deadline.</p>

      <div className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="field"><label htmlFor="pr-name">Name</label>
          <input id="pr-name" className="input" defaultValue={p.name} onBlur={(e) => patch("name", e.target.value)} /></div>
        <div className="field"><label htmlFor="pr-num">Employee number</label>
          <input id="pr-num" className="input" defaultValue={p.employeeNumber} onBlur={(e) => patch("employeeNumber", e.target.value)} /></div>
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
    </div>
  );
}
