import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import DesignB from "./design-b";
import { createClient } from "../lib/supabase-server";

type PageProps = {
  familyName: string;
  clientName: string;
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
        destination: "https://summitclient.io/login",
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

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  const clientLastName = client?.name
    ? client.name.trim().split(/\s+/).pop()
    : null;

  const familyName =
    profile?.full_name ||
    metadataName ||
    (clientLastName ? `${clientLastName} Family` : "Family");

  return {
    props: {
      familyName,
      clientName: client?.name || "Client",
    },
  };
};