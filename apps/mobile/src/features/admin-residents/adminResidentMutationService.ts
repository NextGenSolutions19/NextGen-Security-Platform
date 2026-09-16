import {
  BUILDING_AWARE_FLAT_SAVE_BLOCKED_MESSAGE,
  type AdminResidentDirectoryItem,
  type AdminResidentMutationRequest,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

export class AdminResidentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminResidentError";
  }
}

interface FunctionErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
}

interface AdminResidentMutationResponse {
  resident:
    | AdminResidentDirectoryItem
    | {
        residentId: string;
        status: "active" | "disabled";
      };
}

async function readFunctionError(
  error: unknown,
): Promise<{ status?: number; code?: string; message?: string }> {
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    const status = error.context.status;
    try {
      const body = (await error.context.json()) as FunctionErrorBody;
      return {
        status,
        code: body.error?.code ?? body.code,
        message: body.error?.message ?? body.message,
      };
    } catch {
      return { status };
    }
  }

  return {};
}

function mapAdminResidentUserMessage(parsed: {
  status?: number;
  code?: string;
  message?: string;
}): string {
  if (parsed.status === 401 || parsed.code === "UNAUTHORIZED") {
    return "Your session has expired. Please login again.";
  }
  if (
    parsed.status === 403 ||
    parsed.code === "FORBIDDEN" ||
    parsed.code === "ACCOUNT_DISABLED"
  ) {
    return "You do not have permission to manage residents.";
  }
  if (parsed.code === "NOT_FOUND") {
    return "Resident not found.";
  }
  if (parsed.code === "BACKEND_FLAT_LIMITATION") {
    return parsed.message?.trim() || BUILDING_AWARE_FLAT_SAVE_BLOCKED_MESSAGE;
  }
  if (parsed.message?.trim()) {
    return parsed.message.trim();
  }
  return "Unable to save resident. Please try again.";
}

function assertConfiguredClient(accessToken: string) {
  if (!isSupabaseConfigured()) {
    throw new AdminResidentError("Backend is not configured.");
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new AdminResidentError("Unable to initialize backend client.");
  }

  return supabase;
}

export async function mutateAdminResident(
  accessToken: string,
  request: AdminResidentMutationRequest,
): Promise<AdminResidentMutationResponse["resident"]> {
  const supabase = assertConfiguredClient(accessToken);

  const { data, error } = await supabase.functions.invoke<
    AdminResidentMutationResponse & FunctionErrorBody
  >("admin-resident", {
    body: request,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    const parsed = await readFunctionError(error);
    throw new AdminResidentError(mapAdminResidentUserMessage(parsed));
  }

  if (data?.error?.code) {
    throw new AdminResidentError(
      mapAdminResidentUserMessage({
        code: data.error.code,
        message: data.error.message,
      }),
    );
  }

  if (!data?.resident) {
    throw new AdminResidentError("Unable to save resident.");
  }

  return data.resident;
}
