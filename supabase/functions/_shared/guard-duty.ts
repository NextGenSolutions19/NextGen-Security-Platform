import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { errorResponse } from "./http.ts";

export const GUARD_OFF_DUTY_CHECKIN_MESSAGE =
  "You are currently off duty. Please go On Duty before registering or checking in visitors.";

export async function requireActiveGuardDuty(
  supabase: SupabaseClient,
  input: { guardUserId: string; societyId: string },
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { data, error } = await supabase
    .from("guard_duty_sessions")
    .select("id")
    .eq("app_user_id", input.guardUserId)
    .eq("society_id", input.societyId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) {
    console.error("guard duty lookup error", error);
    return {
      ok: false,
      response: errorResponse(
        "DUTY_UNAVAILABLE",
        "Duty status could not be verified. Please try again.",
        503,
      ),
    };
  }

  if (!data) {
    return {
      ok: false,
      response: errorResponse(
        "GUARD_OFF_DUTY",
        GUARD_OFF_DUTY_CHECKIN_MESSAGE,
        403,
      ),
    };
  }

  return { ok: true };
}
