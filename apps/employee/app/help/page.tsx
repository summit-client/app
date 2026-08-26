export default function HelpPage() {
  return (
    <div>
      <h1 className="h-page">Help</h1>
      <p className="sub" style={{ maxWidth: "64ch" }}>
        Questions about onboarding, training or time off go to your supervisor or the HR Lead. Anything in this hub
        that looks wrong, whether a task that should not apply to you, a missing certificate or a balance that seems off,
        flag it to the office and an administrator can correct it; every change is recorded in the audit log.
      </p>
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <b style={{ fontSize: "var(--text-sm)" }}>Quick answers</b>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--text-sm)", color: "var(--muted)" }}>
          <li>Your whole onboarding is due <b>14 days from your start date</b>; the board shows each item&rsquo;s deadline.</li>
          <li>Tasks marked <i>Supervisor sign-off</i> move to &ldquo;Ready for sign-off&rdquo; when you finish them, and your supervisor completes them from the Manager &amp; Admin page.</li>
          <li>On-site client observation starts only once your <b>Vulnerable Sector Check is cleared</b>; until then use the sample-video playlist.</li>
          <li>Completing every required onboarding item issues your <b>Module 00 certificate</b> automatically.</li>
          <li>Do not enter banking details anywhere in this portal. Payroll lives in Wagepoint.</li>
        </ul>
      </div>
    </div>
  );
}
