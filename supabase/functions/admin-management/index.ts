import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import {
  getAdminDeactivateBlockReason,
  getAdminDemoteBlockReason,
  getAdminPromoteBlockReason,
  mapAdminAccount,
  mapAdminProfile,
  mapSocietyInformation,
  parseAccountStatus,
  parseAdminManagementAction,
  parseAdminProfileSave,
  parseAdminUserId,
  parseAuthorizedAdminFlag,
  parseNewPassword,
  parseSocietyInformationSave,
  toAdminProfileUpdateRow,
  toSocietyInformationUpdateRow,
  type AdminAccount,
} from "../_shared/admin-management.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { hashPassword } from "../_shared/password.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const ADMIN_SAFE_SELECT =
  "id, login_id, role, society_id, status, is_authorized_admin, must_change_password, admin_name, mobile_number, email";
const SOCIETY_INFORMATION_SELECT =
  "id, society_code, name, status, address, city, state, pin_code, contact_number, email";

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

function requireAuthorizedAdmin(
  isAuthorizedAdmin: boolean,
): Response | null {
  if (isAuthorizedAdmin !== true) {
    return errorResponse(
      "FORBIDDEN",
      "Only an authorized admin can manage admin accounts.",
      403,
    );
  }
  return null;
}

type AdminUserRow = {
  id: string;
  login_id: string;
  role: string;
  society_id: string;
  status: string;
  is_authorized_admin: boolean;
  must_change_password: boolean;
  admin_name?: string | null;
  mobile_number?: string | null;
  email?: string | null;
};

async function countActiveAuthorizedAdmins(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("society_id", societyId)
    .eq("role", "society_admin")
    .eq("is_authorized_admin", true)
    .eq("status", "active");

  if (error) {
    throw error;
  }
  return count ?? 0;
}

async function loadSocietyAdmin(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  adminId: string,
) {
  const { data, error } = await supabase
    .from("app_users")
    .select(ADMIN_SAFE_SELECT)
    .eq("id", adminId)
    .eq("society_id", societyId)
    .eq("role", "society_admin")
    .maybeSingle();

  if (error) {
    console.error("admin-management load admin error", error);
    return { error: errorResponse("INTERNAL_ERROR", "Unable to load admin account.", 500) };
  }

  if (!data) {
    return { error: errorResponse("NOT_FOUND", "Admin account not found.", 404) };
  }

  return { row: data as AdminUserRow };
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
    console.error("admin-management revoke sessions error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to update admin account.", 500);
  }
  return null;
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

  const parsed = parseAdminManagementAction(body);
  if (!parsed.ok) {
    return errorResponse(parsed.code, parsed.message, parsed.status);
  }

  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { user, society } = auth.context;
  const supabase = createServiceClient();

  if (parsed.action === "get_society") {
    const { data, error } = await supabase
      .from("societies")
      .select(SOCIETY_INFORMATION_SELECT)
      .eq("id", society.id)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-management get society error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to load society information.", 500);
    }

    const mapped = mapSocietyInformation(data as {
      id: string;
      society_code: string;
      name: string;
      status: string;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      pin_code?: string | null;
      contact_number?: string | null;
      email?: string | null;
    });
    if (!mapped) {
      return errorResponse("INTERNAL_ERROR", "Unable to load society information.", 500);
    }
    return jsonResponse({ society: mapped });
  }

  if (parsed.action === "save_society") {
    const saveParsed = parseSocietyInformationSave(body);
    if (!saveParsed.ok) {
      return errorResponse("VALIDATION_ERROR", saveParsed.message, 400);
    }

    const updateRow = toSocietyInformationUpdateRow(saveParsed.value);

    const { data, error } = await supabase
      .from("societies")
      .update(updateRow)
      .eq("id", society.id)
      .select(SOCIETY_INFORMATION_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-management save society error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to save society information.", 500);
    }

    const mapped = mapSocietyInformation(data as {
      id: string;
      society_code: string;
      name: string;
      status: string;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      pin_code?: string | null;
      contact_number?: string | null;
      email?: string | null;
    });
    if (!mapped) {
      return errorResponse("INTERNAL_ERROR", "Unable to save society information.", 500);
    }

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: user.id,
      p_actor_role: user.role,
      p_action: "society.information.updated",
      p_entity_type: "society",
      p_entity_id: society.id,
      p_metadata: {
        name: mapped.name,
        city: mapped.city,
        state: mapped.state,
        pin_code: mapped.pinCode,
      },
    });

    return jsonResponse({ society: mapped });
  }

  if (parsed.action === "get_profile") {
    const { data, error } = await supabase
      .from("app_users")
      .select(ADMIN_SAFE_SELECT)
      .eq("id", user.id)
      .eq("society_id", society.id)
      .eq("role", "society_admin")
      .maybeSingle();

    if (error || !data) {
      console.error("admin-management get profile error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to load admin profile.", 500);
    }

    const profile = mapAdminProfile(data as AdminUserRow, society);
    if (!profile) {
      return errorResponse("INTERNAL_ERROR", "Unable to load admin profile.", 500);
    }
    return jsonResponse({ profile });
  }

  if (parsed.action === "save_profile") {
    const saveParsed = parseAdminProfileSave(body);
    if (!saveParsed.ok) {
      return errorResponse("VALIDATION_ERROR", saveParsed.message, 400);
    }

    const { data, error } = await supabase
      .from("app_users")
      .update(toAdminProfileUpdateRow(saveParsed.value))
      .eq("id", user.id)
      .eq("society_id", society.id)
      .eq("role", "society_admin")
      .select(ADMIN_SAFE_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-management save profile error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to save admin profile.", 500);
    }

    const profile = mapAdminProfile(data as AdminUserRow, society);
    if (!profile) {
      return errorResponse("INTERNAL_ERROR", "Unable to save admin profile.", 500);
    }

    await writeAudit(supabase, {
      societyId: society.id,
      actorId: user.id,
      actorRole: user.role,
      action: "admin.profile.updated",
      entityId: user.id,
      metadata: { admin_name: profile.adminName },
    });

    return jsonResponse({ profile });
  }

  const forbidden = requireAuthorizedAdmin(user.is_authorized_admin);
  if (forbidden) {
    return forbidden;
  }

  if (parsed.action === "list_admins") {
    const { data, error } = await supabase
      .from("app_users")
      .select(ADMIN_SAFE_SELECT)
      .eq("society_id", society.id)
      .eq("role", "society_admin")
      .order("login_id", { ascending: true });

    if (error) {
      console.error("admin-management list admins error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to load admin accounts.", 500);
    }

    const admins: AdminAccount[] = [];
    for (const row of data ?? []) {
      const mapped = mapAdminAccount(row as AdminUserRow);
      if (mapped) {
        admins.push(mapped);
      }
    }

    return jsonResponse({ admins });
  }

  if (parsed.action === "create_admin") {
    const saveParsed = parseAdminProfileSave(body);
    if (!saveParsed.ok) {
      return errorResponse("VALIDATION_ERROR", saveParsed.message, 400);
    }
    const passwordParsed = parseNewPassword(body.password);
    if (!passwordParsed.ok) {
      return errorResponse("VALIDATION_ERROR", passwordParsed.message, 400);
    }

    const { data: loginId, error: loginError } = await supabase.rpc(
      "next_society_admin_login_id",
      { p_society_id: society.id },
    );

    if (loginError || typeof loginId !== "string" || !loginId) {
      console.error("admin-management allocate login id error", loginError);
      return errorResponse("INTERNAL_ERROR", "Unable to create admin account.", 500);
    }

    const passwordHash = await hashPassword(passwordParsed.password);
    const profileRow = toAdminProfileUpdateRow(saveParsed.value);
    const { data, error } = await supabase
      .from("app_users")
      .insert({
        login_id: loginId,
        password_hash: passwordHash,
        role: "society_admin",
        society_id: society.id,
        status: "active",
        must_change_password: true,
        is_authorized_admin: false,
        failed_login_attempts: 0,
        admin_name: profileRow.admin_name,
        mobile_number: profileRow.mobile_number,
        email: profileRow.email,
      })
      .select(ADMIN_SAFE_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-management create admin error", error);
      if (error?.code === "23505") {
        return errorResponse("LOGIN_ID_TAKEN", "This login ID is already in use.", 409);
      }
      return errorResponse("INTERNAL_ERROR", "Unable to create admin account.", 500);
    }

    const mapped = mapAdminAccount(data as AdminUserRow);
    if (!mapped) {
      return errorResponse("INTERNAL_ERROR", "Unable to create admin account.", 500);
    }

    await writeAudit(supabase, {
      societyId: society.id,
      actorId: user.id,
      actorRole: user.role,
      action: "admin.account.created",
      entityId: mapped.id,
      metadata: { login_id: mapped.loginId },
    });

    return jsonResponse({ admin: mapped });
  }

  if (parsed.action === "update_admin") {
    const idParsed = parseAdminUserId(body.adminId ?? body.admin_id);
    if (!idParsed.ok) {
      return errorResponse("VALIDATION_ERROR", idParsed.message, 400);
    }
    const saveParsed = parseAdminProfileSave(body);
    if (!saveParsed.ok) {
      return errorResponse("VALIDATION_ERROR", saveParsed.message, 400);
    }

    const loaded = await loadSocietyAdmin(supabase, society.id, idParsed.adminId);
    if (loaded.error) {
      return loaded.error;
    }

    if (loaded.row.is_authorized_admin === true && loaded.row.id !== user.id) {
      return errorResponse(
        "FORBIDDEN",
        "Authorized Admin accounts cannot be edited here.",
        403,
      );
    }

    const { data, error } = await supabase
      .from("app_users")
      .update(toAdminProfileUpdateRow(saveParsed.value))
      .eq("id", loaded.row.id)
      .eq("society_id", society.id)
      .eq("role", "society_admin")
      .select(ADMIN_SAFE_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-management update admin error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to update admin account.", 500);
    }

    const mapped = mapAdminAccount(data as AdminUserRow);
    await writeAudit(supabase, {
      societyId: society.id,
      actorId: user.id,
      actorRole: user.role,
      action: "admin.account.updated",
      entityId: loaded.row.id,
      metadata: { login_id: loaded.row.login_id },
    });

    return jsonResponse({ admin: mapped });
  }

  if (parsed.action === "set_admin_status") {
    const idParsed = parseAdminUserId(body.adminId ?? body.admin_id);
    if (!idParsed.ok) {
      return errorResponse("VALIDATION_ERROR", idParsed.message, 400);
    }
    const statusParsed = parseAccountStatus(body.status);
    if (!statusParsed.ok) {
      return errorResponse("VALIDATION_ERROR", statusParsed.message, 400);
    }

    const loaded = await loadSocietyAdmin(supabase, society.id, idParsed.adminId);
    if (loaded.error) {
      return loaded.error;
    }

    let activeAuthorizedCount = 0;
    try {
      activeAuthorizedCount = await countActiveAuthorizedAdmins(supabase, society.id);
    } catch (error) {
      console.error("admin-management count authorized error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to update admin account.", 500);
    }

    const blockReason = getAdminDeactivateBlockReason({
      actorId: user.id,
      targetId: loaded.row.id,
      targetIsAuthorizedAdmin: loaded.row.is_authorized_admin === true,
      targetStatus: loaded.row.status,
      newStatus: statusParsed.status,
      activeAuthorizedAdminCount: activeAuthorizedCount,
    });
    if (blockReason) {
      return errorResponse("VALIDATION_ERROR", blockReason, 400);
    }

    if (loaded.row.status === statusParsed.status) {
      const mapped = mapAdminAccount(loaded.row);
      return jsonResponse({ admin: mapped });
    }

    const { data, error } = await supabase
      .from("app_users")
      .update({ status: statusParsed.status })
      .eq("id", loaded.row.id)
      .eq("society_id", society.id)
      .eq("role", "society_admin")
      .select(ADMIN_SAFE_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-management set status error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to update admin account.", 500);
    }

    if (statusParsed.status === "disabled") {
      const revokeError = await revokeSessions(supabase, loaded.row.id);
      if (revokeError) {
        return revokeError;
      }
    }

    const mapped = mapAdminAccount(data as {
      id: string;
      login_id: string;
      role: string;
      status: string;
      is_authorized_admin: boolean;
    });

    await writeAudit(supabase, {
      societyId: society.id,
      actorId: user.id,
      actorRole: user.role,
      action: "admin.account.status_changed",
      entityId: loaded.row.id,
      metadata: { status: statusParsed.status, login_id: loaded.row.login_id },
    });

    return jsonResponse({ admin: mapped });
  }

  if (parsed.action === "set_authorized_admin") {
    const idParsed = parseAdminUserId(body.adminId ?? body.admin_id);
    if (!idParsed.ok) {
      return errorResponse("VALIDATION_ERROR", idParsed.message, 400);
    }
    const flagParsed = parseAuthorizedAdminFlag(
      body.isAuthorizedAdmin ?? body.is_authorized_admin,
    );
    if (!flagParsed.ok) {
      return errorResponse("VALIDATION_ERROR", flagParsed.message, 400);
    }

    const loaded = await loadSocietyAdmin(supabase, society.id, idParsed.adminId);
    if (loaded.error) {
      return loaded.error;
    }

    const currentlyAuthorized = loaded.row.is_authorized_admin === true;
    if (currentlyAuthorized === flagParsed.isAuthorizedAdmin) {
      const mapped = mapAdminAccount(loaded.row);
      return jsonResponse({ admin: mapped });
    }

    if (flagParsed.isAuthorizedAdmin) {
      const promoteBlock = getAdminPromoteBlockReason({
        targetIsAuthorizedAdmin: currentlyAuthorized,
        targetStatus: loaded.row.status,
      });
      if (promoteBlock) {
        return errorResponse("VALIDATION_ERROR", promoteBlock, 400);
      }
    } else {
      let activeAuthorizedCount = 0;
      try {
        activeAuthorizedCount = await countActiveAuthorizedAdmins(
          supabase,
          society.id,
        );
      } catch (error) {
        console.error("admin-management count authorized error", error);
        return errorResponse("INTERNAL_ERROR", "Unable to update admin account.", 500);
      }

      const demoteBlock = getAdminDemoteBlockReason({
        targetIsAuthorizedAdmin: currentlyAuthorized,
        targetStatus: loaded.row.status,
        activeAuthorizedAdminCount: activeAuthorizedCount,
      });
      if (demoteBlock) {
        return errorResponse("VALIDATION_ERROR", demoteBlock, 400);
      }
    }

    const { data, error } = await supabase
      .from("app_users")
      .update({ is_authorized_admin: flagParsed.isAuthorizedAdmin })
      .eq("id", loaded.row.id)
      .eq("society_id", society.id)
      .eq("role", "society_admin")
      .select(ADMIN_SAFE_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-management set authorized error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to update admin account.", 500);
    }

    const mapped = mapAdminAccount(data as AdminUserRow);
    await writeAudit(supabase, {
      societyId: society.id,
      actorId: user.id,
      actorRole: user.role,
      action: flagParsed.isAuthorizedAdmin
        ? "admin.account.promoted"
        : "admin.account.demoted",
      entityId: loaded.row.id,
      metadata: {
        login_id: loaded.row.login_id,
        is_authorized_admin: flagParsed.isAuthorizedAdmin,
      },
    });

    return jsonResponse({ admin: mapped });
  }

  if (parsed.action === "reset_admin_password") {
    const idParsed = parseAdminUserId(body.adminId ?? body.admin_id);
    if (!idParsed.ok) {
      return errorResponse("VALIDATION_ERROR", idParsed.message, 400);
    }
    const passwordParsed = parseNewPassword(body.password);
    if (!passwordParsed.ok) {
      return errorResponse("VALIDATION_ERROR", passwordParsed.message, 400);
    }

    const loaded = await loadSocietyAdmin(supabase, society.id, idParsed.adminId);
    if (loaded.error) {
      return loaded.error;
    }

    if (loaded.row.id === user.id) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Use Admin Profile to change your own password.",
        400,
      );
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
      .eq("role", "society_admin");

    if (error) {
      console.error("admin-management reset password error", error);
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
      action: "admin.account.password_reset",
      entityId: loaded.row.id,
      metadata: { login_id: loaded.row.login_id },
    });

    const mapped = mapAdminAccount(loaded.row);
    return jsonResponse({ admin: mapped, passwordReset: true });
  }

  return errorResponse("VALIDATION_ERROR", "action is invalid.", 400);
});
