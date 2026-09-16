import LegalPage from '../components/LegalPage'

/**
 * The terms of service. Reviewed and accepted by the account owner
 * 2026-09-17; the "pending legal review" disclaimer it originally shipped
 * with was removed at that point, so treat changes here as changes to a
 * live published agreement, not to a draft. See privacy.tsx's own note.
 */
export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="September 16, 2026">
      <p>
        These terms govern access to and use of Summit (the &ldquo;Service&rdquo;),
        provided by Summit Client Inc. (&ldquo;Summit,&rdquo; &ldquo;we&rdquo;). By creating an
        account or using the Service, you agree to these terms on behalf of yourself
        and, if applicable, the organization you represent.
      </p>

      <h2>Accounts</h2>
      <p>
        You are responsible for the accuracy of information provided when creating an
        account, and for activity that occurs under your credentials. An organization
        administrator is responsible for the accounts and role assignments they create
        within their clinic.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Use the Service only for lawful purposes and in line with the regulatory
          obligations that apply to your organization.</li>
        <li>Do not attempt to access data belonging to another organization, or to
          circumvent the Service&rsquo;s access controls.</li>
        <li>Do not use the Service to store or transmit content you do not have the
          right to hold.</li>
      </ul>

      <h2>Subscriptions and billing</h2>
      <p>
        Paid use of the Service is subject to the subscription plan agreed with your
        organization. Fees, billing cycles and cancellation terms are as set out in
        your order form or account settings; absent a separate written agreement,
        these terms govern.
      </p>

      <h2>Your data</h2>
      <p>
        Your organization retains ownership of the data it enters into the Service.
        We process it on your organization&rsquo;s behalf to provide the Service, as
        described in our <a href="/privacy">Privacy Policy</a>. On termination, your
        organization may request export of its data within a reasonable period.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We aim to keep the Service available and reliable but do not guarantee
        uninterrupted access. We may update the Service, and may update these terms
        from time to time; continued use after an update constitutes acceptance of the
        revised terms.
      </p>

      <h2>Disclaimer and limitation of liability</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranties of any kind, to the
        extent permitted by law. To the maximum extent permitted by law, Summit is not
        liable for indirect, incidental or consequential damages arising from use of
        the Service.
      </p>

      <h2>Termination</h2>
      <p>
        Either party may terminate access to the Service as set out in the applicable
        order form or agreement, or with notice where none exists. We may suspend
        access where use of the Service violates these terms or poses a risk to other
        organizations&rsquo; data.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the Province of Ontario and the
        federal laws of Canada applicable therein.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can be sent to{' '}
        <a href="mailto:info@summitclient.io">info@summitclient.io</a>.
      </p>

    </LegalPage>
  )
}
