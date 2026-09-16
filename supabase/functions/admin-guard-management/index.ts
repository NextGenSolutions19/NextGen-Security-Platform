import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import {
  mapGuardAccount,
  parseGuardAccountStatus,
  parseGuardManagementAction,
  parseGuardPassword,
  parseGuardProfileSave,
  parseGuardUserId,
  toGuardProfileUpdateRow,
  type GuardAccount,
} from "../_shared/admin-guard-management.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { hashPassword } from "../_shared/password.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const GUARD_SAFE_SELECT =
  "id, login_id, role, society_id, status, must_change_password, admin_name, mobile_number";

function rejectClientSociety(body: Record<string, unknown>) {
  if ("society_id" in body || "societyId" in body) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Society is taken from the authenticated session.",
      400,
    );
  }
  return null;
}

type GuardUserRow = {
  id: string;
  login_id: string;
  role: string;
  society_id: string;
  status: string;
  must_change_password: boolean;
  admin_name?: string | null;
  mobile_number?: string | null;
};

async function loadSocietyGuard(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  guardId: string,
) {
  const { data, error } = await supabase
    .from("app_users")
    .select(GUARD_SAFE_SELECT)
    .eq("id", guardId)
    .eq("society_id", societyId)
    .eq("role", "guard")
    .maybeSingle();

  if (error) {
    console.error("admin-guard-management load guard error", error);
    return { error: errorResponse("INTERNAL_ERROR", "Unable to load guard account.", 500) };
  }
  if (!data) {
    return { error: errorResponse("NOT_FOUND", "Guard account not found.", 404) };
  }
  return { row: data as GuardUserRow };
}

async function revokeSessions(
  supabase: ReturnType<typeof createServiceClient>,
  appUserId: string,
) {
  const { error } = await supabase
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("app_user_id", appUserId)
    .is("revoked_at", null);

  if (error) {
    console.error("admin-guard-management revoke sessions error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to update guard account.", 500);
  }
  return null;
}

async function loadOnDutyGuardIds(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  guardIds: string[],
): Promise<Set<string>> {
  if (guardIds.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase
    .from("guard_duty_sessions")
    .select("app_user_id")
    .eq("society_id", societyId)
    .in("app_user_id", guardIds)
    .is("ended_at", null);

  if (error) {
    console.error("admin-guard-management duty lookup error", error);
    return new Set();
  }
  return new Set((data ?? []).map((row) => String(row.app_user_id)));
}

function mapWithDuty(row: GuardUserRow, onDutyIds: Set<string>): GuardAccount | null {
  return mapGuardAccount({
    id: row.id,
    login_id: row.login_id,
    role: row.role,
    status: row.status,
    must_change_password: row.must_change_password,
    admin_name: row.admin_name,
    mobile_number: row.mobile_number,
    on_duty: onDutyIds.has(row.id),
  });
}

async function writeAudit(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    societyId: string;
    actorId: string;
    actorRole: string;
    action: string;
    entityId: string;
    metadata: Record<string, unknown>;
  },
) {
  await supabase.rpc("write_audit_log", {
    p_society_id: input.societyId,
    p_actor_id: input.actorId,
    p_actor_role: input.actorRole,
    p_action: input.action,
    p_entity_type: "app_user",
    p_entity_id: input.entityId,
    p_metadata: input.metadata,
  });
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

  const spoof = rejectClientSociety(body);
  if (spoof) {
    return spoof;
  }

  const parsed = parseGuardManagementAction(body);
  if (!parsed.ok) {
    return errorResponse(parsed.code, parsed.message, parsed.status);
  }

  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { user, society } = auth.context;
  const supabase = createServiceClient();

  if (parsed.action === "list_guards") {
    const { data, error } = await supabase
      .from("app_users")
      .select(GUARD_SAFE_SELECT)
      .eq("society_id", society.id)
      .eq("role", "guard")
      .order("login_id", { ascending: true });

    if (error) {
      console.error("admin-guard-management list error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to load guard accounts.", 500);
    }

    const rows = (data ?? []) as GuardUserRow[];
    const onDutyIds = await loadOnDutyGuardIds(
      supabase,
      society.id,
      rows.map((row) => row.id),
    );
    const guards: GuardAccount[] = [];
    for (const row of rows) {
      const mapped = mapWithDuty(row, onDutyIds);
      if (mapped) {
        guards.push(mapped);
      }
    }
    return jsonResponse({ guards });
  }

  if (parsed.action === "create_guard") {
    const saveParsed = parseGuardProfileSave(body);
    if (!saveParsed.ok) {
      return errorResponse("VALIDATION_ERROR", saveParsed.message, 400);
    }
    const passwordParsed = parseGuardPassword(body.password);
    if (!passwordParsed.ok) {
      return errorResponse("VALIDATION_ERROR", passwordParsed.message, 400);
    }

    const { data: loginId, error: loginError } = await supabase.rpc(
      "next_society_guard_login_id",
      { p_society_id: society.id },
    );

    if (loginError || typeof loginId !== "string" || !loginId) {
      console.error("admin-guard-management allocate login id error", loginError);
      return errorResponse("INTERNAL_ERROR", "Unable to create guard account.", 500);
    }

    const passwordHash = await hashPassword(passwordParsed.password);
    const profileRow = toGuardProfileUpdateRow(saveParsed.value);
    const { data, error } = await supabase
      .from("app_users")
      .insert({
        login_id: loginId,
        password_hash: passwordHash,
        role: "guard",
        society_id: society.id,
        status: "active",
        must_change_password: true,
        is_authorized_admin: false,
        failed_login_attempts: 0,
        admin_name: profileRow.admin_name,
        mobile_number: profileRow.mobile_number,
      })
      .select(GUARD_SAFE_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-guard-management create error", error);
      if (error?.code === "23505") {
        return errorResponse("LOGIN_ID_TAKEN", "This login ID is already in use.", 409);
      }
      return errorResponse("INTERNAL_ERROR", "Unable to create guard account.", 500);
    }

    const mapped = mapWithDuty(data as GuardUserRow, new Set());
    if (!mapped) {
      return errorResponse("INTERNAL_ERROR", "Unable to create guard account.", 500);
    }

    await writeAudit(supabase, {
      societyId: society.id,
      actorId: user.id,
      actorRole: user.role,
      action: "guard.account.created",
      entityId: mapped.id,
      metadata: { login_id: mapped.loginId },
    });

    return jsonResponse({ guard: mapped });
  }

  if (parsed.action === "update_guard") {
    const idParsed = parseGuardUserId(body.guardId ?? body.guard_id);
    if (!idParsed.ok) {
      return errorResponse("VALIDATION_ERROR", idParsed.message, 400);
    }
    const saveParsed = parseGuardProfileSave(body);
    if (!saveParsed.ok) {
      return errorResponse("VALIDATION_ERROR", saveParsed.message, 400);
    }

    const loaded = await loadSocietyGuard(supabase, society.id, idParsed.guardId);
    if (loaded.error) {
      return loaded.error;
    }

    const { data, error } = await supabase
      .from("app_users")
      .update(toGuardProfileUpdateRow(saveParsed.value))
      .eq("id", loaded.row.id)
      .eq("society_id", society.id)
      .eq("role", "guard")
      .select(GUARD_SAFE_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-guard-management update error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to update guard account.", 500);
    }

    const onDutyIds = await loadOnDutyGuardIds(supabase, society.id, [loaded.row.id]);
    const mapped = mapWithDuty(data as GuardUserRow, onDutyIds);
    await writeAudit(supabase, {
      societyId: society.id,
      actorId: user.id,
      actorRole: user.role,
      action: "guard.account.updated",
      entityId: loaded.row.id,
      metadata: { login_id: loaded.row.login_id },
    });
    return jsonResponse({ guard: mapped });
  }

  if (parsed.action === "set_guard_status") {
    const idParsed = parseGuardUserId(body.guardId ?? body.guard_id);
    if (!idParsed.ok) {
      return errorResponse("VALIDATION_ERROR", idParsed.message, 400);
    }
    const statusParsed = parseGuardAccountStatus(body.status);
    if (!statusParsed.ok) {
      return errorResponse("VALIDATION_ERROR", statusParsed.message, 400);
    }

    const loaded = await loadSocietyGuard(supabase, society.id, idParsed.guardId);
    if (loaded.error) {
      return loaded.error;
    }

    if (loaded.row.status === statusParsed.status) {
      const onDutyIds = await loadOnDutyGuardIds(supabase, society.id, [loaded.row.id]);
      return jsonResponse({ guard: mapWithDuty(loaded.row, onDutyIds) });
    }

    const { data, error } = await supabase
      .from("app_users")
      .update({ status: statusParsed.status })
      .eq("id", loaded.row.id)
      .eq("society_id", society.id)
      .eq("role", "guard")
      .select(GUARD_SAFE_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-guard-management set status error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to update guard account.", 500);
    }

    if (statusParsed.status === "disabled") {
      const revokeError = await revokeSessions(supabase, loaded.row.id);
      if (revokeError) {
        return revokeError;
      }
    }

    const onDutyIds = await loadOnDutyGuardIds(supabase, society.id, [loaded.row.id]);
    await writeAudit(supabase, {
      societyId: society.id,
      actorId: user.id,
      actorRole: user.role,
      action: "guard.account.status_changed",
      entityId: loaded.row.id,
      metadata: { status: statusParsed.status, login_id: loaded.row.login_id },
    });
    return jsonResponse({ guard: mapWithDuty(data as GuardUserRow, onDutyIds) });
  }

  if (parsed.action === "reset_guard_password") {
    const idParsed = parseGuardUserId(body.guardId ?? body.guard_id);
    if (!idParsed.ok) {
      return errorResponse("VALIDATION_ERROR", idParsed.message, 400);
    }
    const passwordParsed = parseGuardPassword(body.password);
    if (!passwordParsed.ok) {
      return errorResponse("VALIDATION_ERROR", passwordParsed.message, 400);
    }

    const loaded = await loadSocietyGuard(supabase, society.id, idParsed.guardId);
    if (loaded.error) {
      return loaded.error;
    }

    const passwordHash = await hashPassword(passwordParsed.password);
    const { error } = await supabase
      .from("app_users")
      .update({
        password_hash: passwordHash,
        must_change_password: true,
        failed_login_attempts: 0,
        locked_until: null,
      })
      .eq("id", loaded.row.id)
      .eq("society_id", society.id)
      .eq("role", "guard");

    if (error) {
      console.error("admin-guard-management reset password error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to reset password.", 500);
    }

    const revokeError = await revokeSessions(supabase, loaded.row.id);
    if (revokeError) {
      return revokeError;
    }

    await writeAudit(supabase, {
      societyId: society.id,
      actorId: user.id,
      actorRole: user.role,
      action: "guard.account.password_reset",
      entityId: loaded.row.id,
      metadata: { login_id: loaded.row.login_id },
    });

    const onDutyIds = await loadOnDutyGuardIds(supabase, society.id, [loaded.row.id]);
    return jsonResponse({
      guard: mapWithDuty(loaded.row, onDutyIds),
      passwordReset: true,
    });
  }

  return errorResponse("VALIDATION_ERROR", "action is invalid.", 400);
});
