import LegalPage from '../components/LegalPage'

/**
 * The privacy policy. Reviewed and accepted by the account owner
 * 2026-09-17; the "pending legal review" disclaimer it originally shipped
 * with was removed at that point, so treat changes here as changes to a
 * live published policy, not to a draft. PHIPA/PIPEDA are the binding
 * regimes (see CLAUDE.md's compliance section), not HIPAA.
 */
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="September 16, 2026">
      <p>
        This policy explains what information Summit Client Inc. (&ldquo;Summit,&rdquo;
        &ldquo;we&rdquo;) collects through summitclient.io and its connected portals, how
        it is used, and the choices available to you. It applies to visitors to our
        marketing site and to clinics, staff and families who use the product.
      </p>

      <h2>Who this covers</h2>
      <p>
        Summit is built for healthcare practices operating in Canada. Client and staff
        health information handled inside the product is governed by the Personal
        Health Information Protection Act (Ontario) and the Personal Information
        Protection and Electronic Documents Act (federal), and is processed on behalf
        of the clinic that is our customer - the clinic remains the data controller for
        the records its staff and families create in the product.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>Account information you provide: name, email, role, and organization.</li>
        <li>Information a clinic enters or generates in the product on behalf of its
          staff and the families it serves, including scheduling, clinical and billing
          records.</li>
        <li>Usage information: pages visited, actions taken, device and browser
          information, collected to operate and secure the service.</li>
        <li>Communications you send us, such as support requests or a demo inquiry.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To provide, maintain and secure the product for the clinics that use it.</li>
        <li>To communicate with you about your account, a request, or the service.</li>
        <li>To improve the product, using aggregated or de-identified information
          wherever possible.</li>
        <li>To meet legal, regulatory and contractual obligations.</li>
      </ul>

      <h2>How it is stored and protected</h2>
      <p>
        Client, staff and clinical data are isolated per organization at the database
        level, and access within an organization is scoped by role and action rather
        than granted broadly. Any use of a third-party AI model on clinical data is
        routed through a vendor under a signed agreement covering that data; no
        identifiable clinical data is sent to a third-party model without one.
      </p>

      <h2>Who we share it with</h2>
      <p>
        We do not sell personal information. We share information with service
        providers who help us operate the product (such as hosting and infrastructure
        providers) under agreements that limit their use of it, and where required by
        law.
      </p>

      <h2>Your choices</h2>
      <p>
        If you are a client, family member or staff member of a clinic using Summit,
        your primary relationship for privacy requests is with that clinic, as the
        holder of your record. You may also contact us directly using the details
        below, and we will route your request appropriately.
      </p>

      <h2>Retention</h2>
      <p>
        We retain information for as long as needed to provide the service to the
        clinic that is our customer, and afterward as required by law or a clinic&rsquo;s
        own record-retention obligations.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy can be sent to{' '}
        <a href="mailto:info@summitclient.io">info@summitclient.io</a>.
      </p>

    </LegalPage>
  )
}
