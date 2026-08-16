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

type PageProps = {
  familyName: string;
  clientName: string;
  sessions: DashboardSession[];
};

export default function ClientDashboard(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  return <DesignB {...props} />;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("user_id", user.id)
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
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  if (sessionsError) {
    console.error(
      "Failed to load dashboard sessions:",
      sessionsError.message
    );
  }

  const clientLastName = client?.name
    ? client.name.trim().split(/\s+/).pop()
    : null;

  const familyName = clientLastName
    ? `${clientLastName} Family`
    : profile?.full_name || "Family";

  return {
    props: {
      familyName,
      clientName: client?.name || "Client",
      sessions: (sessions ?? []) as DashboardSession[],
    },
  };
};
