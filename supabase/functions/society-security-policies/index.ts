import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import {
  DEFAULT_SOCIETY_SECURITY_POLICY,
  mapSocietySecurityPolicyRow,
  parseSocietySecurityPolicySaveInput,
  type SocietySecurityPolicy,
} from "../_shared/society-security-policies.ts";
import { authenticateSocietyMemberRequest } from "../_shared/society-member-auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";

interface PolicyRow {
  society_id: string;
  otp_required: boolean;
  resident_selection_required: boolean;
}

function mapPolicyResponse(
  policy: SocietySecurityPolicy,
  source: "stored" | "defaults",
) {
  return {
    policy,
    source,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(
      "VALIDATION_ERROR",
      "Request body must be valid JSON.",
      400,
    );
  }

  const action = String(body.action ?? "").trim();
  if (action !== "get" && action !== "save") {
    return errorResponse("VALIDATION_ERROR", "action must be get or save.", 400);
  }

  if (action === "get") {
    const auth = await authenticateSocietyMemberRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { society } = auth.context;
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("society_security_policies")
      .select("society_id, otp_required, resident_selection_required")
      .eq("society_id", society.id)
      .maybeSingle();

    if (error) {
      console.error("society-security-policies get error", error);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to load security policies.",
        500,
      );
    }

    const row = data as PolicyRow | null;
    if (!row) {
      return jsonResponse(mapPolicyResponse(DEFAULT_SOCIETY_SECURITY_POLICY, "defaults"));
    }

    return jsonResponse(
      mapPolicyResponse(mapSocietySecurityPolicyRow(row), "stored"),
    );
  }

  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = parseSocietySecurityPolicySaveInput(body);
  if (!parsed.ok) {
    return errorResponse(parsed.code, parsed.message, parsed.status);
  }

  const { user, society } = auth.context;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("society_security_policies")
    .upsert(
      {
        society_id: society.id,
        otp_required: parsed.value.otpRequired,
        resident_selection_required: parsed.value.residentSelectionRequired,
      },
      { onConflict: "society_id" },
    )
    .select("society_id, otp_required, resident_selection_required")
    .single();

  if (error || !data) {
    console.error("society-security-policies save error", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to save security policies.",
      500,
    );
  }

  await supabase.rpc("write_audit_log", {
    p_society_id: society.id,
    p_actor_id: user.id,
    p_actor_role: user.role,
    p_action: "security_policy.updated",
    p_entity_type: "society_security_policy",
    p_entity_id: society.id,
    p_metadata: {
      otp_required: parsed.value.otpRequired,
      resident_selection_required: parsed.value.residentSelectionRequired,
    },
  });

  return jsonResponse(
    mapPolicyResponse(mapSocietySecurityPolicyRow(data as PolicyRow), "stored"),
  );
});
