import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, recordAudit, serviceClient, verifyCaller } from "../_shared/auth.ts";

/**
 * Creating a brand-new clinic and its first admin is deliberately NOT gated
 * on any profiles.role - no role in the current vocabulary has (or should
 * have) cross-clinic authority. platform_operators is the only place this
 * concept exists, checked here and nowhere else. No UI calls this in v1:
 * it's rare (once per new paying clinic) and the highest-consequence action
 * in this whole feature, so it stays a runbook step invoked directly
 * (`supabase functions invoke` / curl with the operator's own JWT) until
 * there's a second real paying clinic to justify building one.
 */
const MAX_PER_HOUR = 5;

interface ProvisionRequest {
  clinic_name?: string;
  clinic_slug?: string;
  admin_email?: string;
  admin_full_name?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const callerId = await verifyCaller(req);
  if (!callerId) return json(401, { error: "Not signed in" });

  const admin = serviceClient();

  const { data: operator } = await admin
    .from("platform_operators")
    .select("user_id")
    .eq("user_id", callerId)
    .maybeSingle();
  if (!operator) return json(403, { error: "Not authorized to provision a new clinic" });

  let body: ProvisionRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const clinicName = body.clinic_name?.trim();
  const clinicSlug = body.clinic_slug?.trim();
  const adminEmail = body.admin_email?.trim().toLowerCase();
  if (!clinicName || !clinicSlug || !adminEmail) {
    return json(400, { error: "clinic_name, clinic_slug and admin_email are required" });
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("provisioning_audit")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", callerId)
    .eq("action", "provision_clinic")
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return json(429, { error: "Too many clinics provisioned recently. Try again in a bit." });
  }

  const { data: clinic, error: clinicErr } = await admin
    .from("clinics")
    .insert({ name: clinicName, slug: clinicSlug })
    .select("id")
    .single();
  if (clinicErr || !clinic) return json(500, { error: clinicErr?.message ?? "Could not create clinic" });

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(adminEmail);
  if (inviteErr || !invited?.user) {
    return json(500, { error: `Clinic created (id ${clinic.id}) but the admin invite failed: ${inviteErr?.message ?? "unknown error"}` });
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: invited.user.id,
    email: invited.user.email,
    full_name: body.admin_full_name?.trim() || null,
    role: "admin",
    clinic_id: clinic.id,
  });
  if (profileErr) {
    return json(500, {
      error: `Clinic created (id ${clinic.id}) and invite sent to user id ${invited.user.id} (email on the invited auth user: ${invited.user.email}), but creating the admin profile failed: ${profileErr.message}`,
    });
  }

  await recordAudit(admin, {
    actor_id: callerId,
    actor_clinic_id: null,
    action: "provision_clinic",
    target_user_id: invited.user.id,
    target_clinic_id: clinic.id,
    detail: { clinic_name: clinicName, clinic_slug: clinicSlug, admin_email: adminEmail },
  });

  return json(200, { ok: true, clinic_id: clinic.id, admin_user_id: invited.user.id });
});
