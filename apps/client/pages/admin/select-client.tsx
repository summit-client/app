import type { GetServerSideProps, InferGetServerSidePropsType, NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../lib/supabase-server";

type ClientRow = { id: string; name: string | null };

export default function SelectClient({
  clients,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>View as a client</h1>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 28 }}>
        Pick a family to see exactly what their dashboard shows - for diagnosing a reported issue.
        Read-only; nothing you do here is saved as them.
      </p>
      {clients.length === 0 ? (
        <p style={{ color: "#6B7280" }}>No clients in your clinic yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clients.map((c) => (
            <form key={c.id} method="POST" action="/api/admin/view-as">
              <input type="hidden" name="clientId" value={c.id} />
              <button
                type="submit"
                style={{
                  width: "100%", textAlign: "left", padding: "12px 16px",
                  border: "1px solid #E5E7EB", borderRadius: 10,
                  background: "white", cursor: "pointer", fontSize: 15,
                }}
              >
                {c.name || "Unnamed client"}
              </button>
            </form>
          ))}
        </div>
      )}
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<{ clients: ClientRow[] }> = async ({ req, res }) => {
  const supabase = createClient(req as NextApiRequest, res as NextApiResponse);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      redirect: {
        destination: process.env.NEXT_PUBLIC_LOGIN_URL || "https://summitclient.io/login",
        permanent: false,
      },
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, clinic_id")
    .eq("id", user.id)
    .maybeSingle();

  // Only admins get the picker - a real client account has nothing to pick
  // (they only ever see their own record) and lands on their own dashboard.
  if (profile?.role !== "admin" || !profile.clinic_id) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("clinic_id", profile.clinic_id)
    .order("name", { ascending: true });

  return { props: { clients: (clients ?? []) as ClientRow[] } };
};
