/**
 * Document center - the family's own copy of the "Documents" nav item
 * (Sidebar.tsx), stubbed "Soon" until now. Two things live on one screen:
 *
 *   - documents the clinic has shared (an intake form to fill out, a signed
 *     care plan) - read-only for the family, download via a short-lived
 *     signed URL resolved at render time.
 *   - an upload control so the family can send signed paperwork back.
 *
 * Backed by `client_documents` (migration 0035) for the metadata and a
 * Storage bucket for the file bytes - see that migration's own footer for
 * the bucket/policy setup a human still needs to do; until that's done,
 * uploads will fail and every download link resolves to null (handled
 * below, not a crash - see `storageUnavailable`).
 *
 * Upload is the one mutation this app has ever had (lib/admin-view-as.ts's
 * header used to note apps/client had none at all) and runs from the
 * browser directly against Supabase (lib/supabase-browser.ts), not through
 * a Next.js API route - RLS on both the table and the bucket is the actual
 * enforcement either way, so there is nothing a server-side relay would add
 * except another place for the direction/uploaded_by checks to drift from
 * what the database already requires. Deliberately never offered when
 * `isAdminViewingAs` - lib/admin-view-as.ts's header is explicit that an
 * admin "viewing as" a family is a read-only support session, and this is
 * the first mutation in this app that pattern could otherwise reach.
 */
import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { useRef, useState } from "react";
import { useRouter } from "next/router";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import { browserClient } from "../lib/supabase-browser";
import {
  buildDocumentPath,
  DOCUMENTS_BUCKET,
  MAX_UPLOAD_BYTES,
  type ClientDocument,
  type DocumentDirection,
} from "../lib/documents";
import { formatClinicDate } from "../lib/clinic-date";
import { AdminViewBanner } from "../components/admin-view-banner";
import { AccountProblemNotice } from "../components/account-problem-notice";
import { LoadErrorNotice } from "../components/load-error-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";

// 10 minutes: long enough to read the list and click every download once,
// short enough that a link copied out of this page stops working quickly -
// these are PHI-adjacent documents (intake forms, care plans), so a signed
// URL that could still be shared around days later would defeat the point
// of a private bucket.
const SIGNED_URL_TTL_SECONDS = 60 * 10;

type PageProps =
  | {
      mode: "documents";
      documents: ClientDocument[];
      documentsError: boolean;
      storageUnavailable: boolean;
      clientId: number;
      clinicId: string | null;
      clientName: string;
      isAdminViewingAs: boolean;
    }
  | { mode: "problem"; problem: AccountProblem }
  | { mode: "error" };

export default function Documents(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }
  if (props.mode === "error") {
    return <LoadErrorNotice />;
  }

  const {
    documents,
    documentsError,
    storageUnavailable,
    clientId,
    clinicId,
    clientName,
    isAdminViewingAs,
  } = props;

  const staffDocs = documents.filter((d) => d.direction === "staff_to_client");
  const familyDocs = documents.filter((d) => d.direction === "client_to_staff");

  return (
    <>
      {isAdminViewingAs ? <AdminViewBanner clientName={clientName} /> : null}
      <MobileNavChrome title="Documents" />
      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header style={{ marginBottom: 24 }}>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>
            <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>Documents</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Forms and paperwork shared with {clientName}&apos;s clinical team, in both directions.
            </p>
          </header>

          {storageUnavailable ? (
            <div className={styles.emptyBox} style={{ marginBottom: 16 }}>
              Downloads and uploads aren&apos;t turned on for this clinic yet. If you need one of
              the documents below, contact your clinic directly - they can also confirm your
              account is set up correctly.
            </div>
          ) : null}

          {!isAdminViewingAs ? (
            <UploadPanel
              clientId={clientId}
              clinicId={clinicId}
              disabled={storageUnavailable || !clinicId}
            />
          ) : (
            <div className={styles.emptyBox} style={{ marginBottom: 20 }}>
              Uploading is disabled while viewing as a family - this is a read-only support view.
            </div>
          )}

          {documentsError ? (
            <div className={styles.emptyBox}>
              Couldn&apos;t load {clientName}&apos;s documents. Try refreshing the page.
            </div>
          ) : documents.length === 0 ? null : (
            <>
              <DocumentSection
                heading="Shared with you"
                subheading="From your clinic - intake forms, care plans and other paperwork."
                docs={staffDocs}
              />
              <DocumentSection
                heading="Sent by you"
                subheading="Signed paperwork and other files you've sent back to your clinic."
                docs={familyDocs}
              />
            </>
          )}

          {documents.length === 0 && !documentsError ? (
            <div className={styles.emptyBox}>
              No documents yet. Anything your clinic shares, or that you upload above, will
              appear here.
            </div>
          ) : null}
        </main>
      </div>
    </>
  );
}

function DocumentSection({
  heading,
  subheading,
  docs,
}: {
  heading: string;
  subheading: string;
  docs: ClientDocument[];
}) {
  // Sections that have nothing don't render at all, rather than an empty
  // box per direction - a family with only outgoing uploads and nothing
  // shared yet doesn't need to be told that twice (the page-level
  // "No documents yet" box below already covers the fully-empty case).
  if (docs.length === 0) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 className={styles.domainHeading}>{heading}</h2>
      <p style={{ margin: "-8px 0 12px", color: "var(--muted)", fontSize: 12.5 }}>{subheading}</p>
      <div className={styles.updateList}>
        {docs.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} />
        ))}
      </div>
    </section>
  );
}

function DocumentCard({ doc }: { doc: ClientDocument }) {
  const badgeClass = doc.direction === "staff_to_client" ? styles.docBadgeFromClinic : styles.docBadgeFromYou;
  const badgeText = doc.direction === "staff_to_client" ? "From your clinic" : "Sent by you";

  return (
    <article className={styles.updateCard}>
      <div className={styles.updateCardHeader}>
        <span className={styles.updateDate}>{formatClinicDate(doc.createdAt)}</span>
        <span className={`${styles.noteBadge} ${badgeClass}`}>{badgeText}</span>
      </div>
      <p className={styles.updateBody} style={{ marginBottom: doc.downloadUrl ? 10 : 0 }}>
        {doc.title}
      </p>
      {doc.downloadUrl ? (
        // Signed URL, valid for SIGNED_URL_TTL_SECONDS from when this page
        // rendered - opens in a new tab rather than navigating the portal
        // away, same reasoning as statement.tsx's "Print / PDF" action.
        <a
          href={doc.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}
        >
          Download
        </a>
      ) : (
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Download link unavailable right now</span>
      )}
    </article>
  );
}

function UploadPanel({
  clientId,
  clinicId,
  disabled,
}: {
  clientId: number;
  clinicId: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (!clinicId) {
      setError("Your account isn't fully set up yet - contact your clinic before uploading.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is too large (max ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).`);
      return;
    }

    setBusy(true);
    try {
      const supabase = browserClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Your session has expired. Refresh the page and sign in again.");
        return;
      }

      const path = buildDocumentPath(clinicId, clientId, file.name);
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });

      if (uploadError) {
        setError(
          `Upload failed: ${uploadError.message}. If this keeps happening, contact your clinic.`
        );
        return;
      }

      const direction: DocumentDirection = "client_to_staff";
      const { error: insertError } = await supabase.from("client_documents").insert({
        clinic_id: clinicId,
        client_id: clientId,
        file_path: path,
        title: title.trim() || file.name,
        direction,
        uploaded_by: user.id,
      });

      if (insertError) {
        // The file itself uploaded fine at this point; only the metadata
        // row failed. Not cleaned up automatically (no delete policy is
        // granted on the bucket either - see migration 0035's footer) -
        // surfaced instead so the family knows to try again or ask for help,
        // rather than silently leaving an orphaned, unlisted file behind.
        setError(
          `The file uploaded, but saving it failed: ${insertError.message}. Contact your clinic.`
        );
        return;
      }

      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      // Re-runs getServerSideProps so the new row (and a freshly signed
      // download URL for it) shows up, rather than hand-maintaining a
      // second client-side copy of the list this page otherwise never needs.
      router.replace(router.asPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        padding: 20,
        marginBottom: 24,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        boxShadow: "var(--shadow-md)",
      }}
    >
      <h2 className={styles.domainHeading} style={{ marginBottom: 4 }}>
        Send a document
      </h2>
      <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 12.5 }}>
        Upload signed paperwork or another file for your clinic to see.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}
      >
        <label style={{ display: "grid", gap: 6, flex: "1 1 220px" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Title (optional)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Signed intake form"
            disabled={disabled || busy}
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--line-strong)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 14,
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>File</span>
          <input ref={fileRef} type="file" disabled={disabled || busy} style={{ fontSize: 13 }} />
        </label>

        <button
          type="submit"
          disabled={disabled || busy}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            border: "1px solid var(--accent)",
            background: busy || disabled ? "var(--line-strong)" : "var(--accent)",
            color: busy || disabled ? "var(--muted)" : "var(--accent-ink)",
            fontWeight: 700,
            cursor: busy || disabled ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Uploading..." : "Upload"}
        </button>
      </form>

      {error ? (
        <p style={{ margin: "12px 0 0", color: "var(--warn)", fontSize: 13 }} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res }) => {
  const supabase = createClient(req as NextApiRequest, res as NextApiResponse);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      redirect: {
        destination: process.env.NEXT_PUBLIC_LOGIN_URL || "https://summitclient.io/login",
        permanent: false,
      },
    };
  }

  const resolved = await resolveViewedClient(supabase, req as NextApiRequest, user.id);

  if (resolved.kind === "error") {
    return { props: { mode: "error" } };
  }
  if (resolved.kind === "needs-selection") {
    return { redirect: { destination: "/", permanent: false } };
  }
  if (resolved.kind === "account-problem") {
    return { props: { mode: "problem", problem: resolved.problem } };
  }
  if (resolved.kind === "not-permitted") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return { redirect: { destination: homeUrlFor(profile?.role), permanent: false } };
  }

  const { viewed } = resolved;

  // Needed to build the upload path (buildDocumentPath) client-side; not
  // used for reading the list below, which is scoped by client_id alone
  // (RLS on client_documents enforces the clinic boundary regardless). Read
  // from `profiles`, not `clients` - a real client-role account has no
  // select policy on `clients` at all (only admin/scheduler/clinical staff
  // do; see migrations 0013/0014), but always has profiles_self_read on
  // their own row (migration 0032).
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("clinic_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: docRows, error: documentsError } = await supabase
    .from("client_documents")
    .select("id, title, direction, file_path, created_at")
    .eq("client_id", viewed.clientId)
    .order("created_at", { ascending: false });

  if (documentsError) {
    console.error("Failed to load documents page rows:", documentsError.message);
  }

  // A signed URL, not a stored/public one, resolved fresh on every render -
  // matches how private-bucket downloads are meant to work, and means an
  // old URL copied out of this page stops working once SIGNED_URL_TTL_SECONDS
  // passes. Before migration 0035's Storage bucket exists, every one of
  // these calls fails the same way (bucket not found) - detected once via
  // `storageUnavailable` rather than repeating the same broken-download
  // notice next to every single row.
  let storageUnavailable = false;
  const documents: ClientDocument[] = await Promise.all(
    (docRows ?? []).map(async (row) => {
      let downloadUrl: string | null = null;
      try {
        const { data, error } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .createSignedUrl(row.file_path as string, SIGNED_URL_TTL_SECONDS);
        if (error) {
          storageUnavailable = true;
        } else {
          downloadUrl = data?.signedUrl ?? null;
        }
      } catch {
        storageUnavailable = true;
      }

      return {
        id: row.id as string,
        title: row.title as string,
        direction: row.direction as ClientDocument["direction"],
        createdAt: row.created_at as string,
        downloadUrl,
      };
    })
  );

  return {
    props: {
      mode: "documents",
      documents,
      documentsError: Boolean(documentsError),
      storageUnavailable,
      clientId: Number(viewed.clientId),
      clinicId: profileRow?.clinic_id ?? null,
      clientName: viewed.clientName || "your child",
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};
