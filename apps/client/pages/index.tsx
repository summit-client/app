import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import DesignB, {
  type DashboardSession,
} from "../components/design-b";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import { AdminViewBanner } from "../components/admin-view-banner";
import { homeUrlFor } from "@summit/portals";

type PageProps = {
  familyName: string;
  clientName: string;
  sessions: DashboardSession[];
  isAdminViewingAs: boolean;
};

export default function ClientDashboard(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  return (
    <>
      {props.isAdminViewingAs ? <AdminViewBanner clientName={props.clientName} /> : null}
      <DesignB {...props} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({
  req,
  res,
}) => {
  const supabase = createClient(
    req as NextApiRequest,
    res as NextApiResponse
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      redirect: {
        destination:
          process.env.NEXT_PUBLIC_LOGIN_URL ||
          "https://summitclient.io/login",
        permanent: false,
      },
    };
  }

  const resolved = await resolveViewedClient(supabase, req as NextApiRequest, user.id);

  if (resolved.kind === "needs-selection") {
    return { redirect: { destination: "/admin/select-client", permanent: false } };
  }
  if (resolved.kind === "not-permitted") {
    // Some other staff role (scheduler, clinician, ...) reached this app -
    // proxy.ts only checks that *some* session exists, not which role. Send
    // them home instead of rendering anyone's PHI.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return { redirect: { destination: homeUrlFor(profile?.role), permanent: false } };
  }

  const { viewed } = resolved;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select(`
      id,
      hour,
      minute,
      type,
      session_date,
      status
    `)
    .eq("client_id", viewed.clientId)
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  if (sessionsError) {
    console.error(
      "Failed to load dashboard sessions:",
      sessionsError.message
    );
  }

  const clientLastName = viewed.clientName
    ? viewed.clientName.trim().split(/\s+/).pop()
    : null;

  const familyName = clientLastName
    ? `${clientLastName} Family`
    : profile?.full_name || "Family";

  return {
    props: {
      familyName,
      clientName: viewed.clientName || "Client",
      sessions: (sessions ?? []) as DashboardSession[],
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};
