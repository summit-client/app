import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";
import {
  answerProblems, fieldsFrom, pruneAnswers, signatureProblem,
} from "../../../lib/forms";

/**
 * Submit a completed form, or record a consent.
 *
 * The template is re-read here rather than trusted from the request. A page
 * can be open for an hour, and the fields it rendered are not necessarily the
 * fields the assignment names any more — so validation runs against what the
 * database says the form is, not against what the browser says it rendered.
 *
 * Answers are pruned to the template's own fields before the insert. Without
 * that, a crafted request writes arbitrary keys into a jsonb column that staff
 * later read as though a clinician had defined them.
 *
 * RLS is the boundary throughout: form_submissions_family_write requires
 * complete_forms for that child and an assignment that is live and unanswered.
 * This route exists so a valid request is easy to make and an invalid one gets
 * a sentence instead of a constraint name.
 */
async function refuseIfNotFamily(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  res: NextApiResponse,
): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) {
    console.error("forms/submit: profile lookup failed:", error.message);
    res.status(500).json({ error: "Could not verify your account." });
    return true;
  }
  if (profile?.role !== "client") {
    // Admin "view as" is read-only. Signing something on a family's behalf is
    // the clearest possible case of an action that must come from their own
    // account.
    res.status(403).json({
      error: "Forms and consents can only be completed from the family's own account.",
    });
    return true;
  }
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "POST only" });
    return;
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  if (await refuseIfNotFamily(supabase, user.id, res)) return;

  const assignmentId = typeof req.body?.assignmentId === "string" ? req.body.assignmentId : "";
  const signedName = typeof req.body?.signedName === "string" ? req.body.signedName : "";
  const answers =
    req.body?.answers && typeof req.body.answers === "object" && !Array.isArray(req.body.answers)
      ? (req.body.answers as Record<string, unknown>)
      : {};

  if (!assignmentId) {
    res.status(400).json({ error: "Which form?" });
    return;
  }
  const nameIssue = signatureProblem(signedName);
  if (nameIssue) {
    res.status(400).json({ error: nameIssue });
    return;
  }

  // Read through the caller's own session, so RLS decides whether this form
  // exists for them. One that does not comes back as "not available" rather
  // than "forbidden".
  const { data: form, error: formError } = await supabase
    .from("my_forms")
    .select("assignment_id, client_id, template_id, kind, fields, completed_at")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (formError) {
    console.error("forms/submit: form lookup failed:", formError.message);
    res.status(500).json({ error: "Something went wrong. Try again shortly." });
    return;
  }
  if (!form) {
    res.status(404).json({ error: "That form is not available." });
    return;
  }
  if (form.completed_at) {
    // Said plainly rather than as a unique-violation. A double submit is
    // usually a slow connection and a second tap, not an attack.
    res.status(409).json({ error: "This form has already been sent." });
    return;
  }

  // Against the template as it is now, not as the page rendered it.
  const fields = fieldsFrom(form.fields);
  const problems = answerProblems(fields, answers);
  if (Object.keys(problems).length > 0) {
    res.status(400).json({
      error: "Some answers still need attention.",
      // Per field, so the page can put each message beside its own question.
      problems,
    });
    return;
  }

  const { data: profile } = await supabase
    .from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
  if (!profile?.clinic_id) {
    res.status(500).json({ error: "Couldn't resolve your clinic. Try again." });
    return;
  }

  const { error: insertError } = await supabase.from("form_submissions").insert({
    clinic_id: profile.clinic_id,
    assignment_id: form.assignment_id,
    template_id: form.template_id,
    client_id: form.client_id,
    answers: pruneAnswers(fields, answers),
    submitted_by: user.id,
    signed_name: signedName.trim(),
  });

  if (insertError) {
    console.error("forms/submit: insert failed:", insertError.message);
    res.status(500).json({ error: "Your form was not sent. Try again shortly." });
    return;
  }

  // A consent template also records a consent, which is the thing with a
  // withdrawal window. The submission is the answer; the consent is the state.
  if (form.kind === "consent") {
    const { error: consentError } = await supabase.from("consent_records").insert({
      clinic_id: profile.clinic_id,
      client_id: form.client_id,
      template_id: form.template_id,
      granted_by: user.id,
      signed_name: signedName.trim(),
    });
    if (consentError) {
      // The answer is filed; only the consent state failed. Saying so is more
      // useful than a generic error, because the family should not re-sign a
      // form that already went through.
      console.error("forms/submit: consent insert failed:", consentError.message);
      res.status(500).json({
        error: "Your answers were saved, but the consent was not recorded. Contact the clinic.",
      });
      return;
    }
  }

  res.status(200).json({ ok: true });
}
