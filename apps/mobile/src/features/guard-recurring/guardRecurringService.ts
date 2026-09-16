import {
  GUARD_OFF_DUTY_CHECKIN_MESSAGE,
  VisitorError,
  isGuardRecurringEntrySource,
  mapGuardRecurringValidationMessage,
  type GuardRecurringEntrySource,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";
import type { GuardRecurringPassPreview } from "./pendingRecurringCheckinStore";

interface FunctionErrorBody {
  error?: { code?: string; message?: string };
  code?: string;
  message?: string;
}

function formatFunctionErrorMessage(body: FunctionErrorBody): string | null {
  const code = body.error?.code ?? body.code;
  const message = body.error?.message ?? body.message;
  if (!message) {
    return null;
  }
  if (code === "GUARD_OFF_DUTY") {
    return message;
  }
  if (code && code !== "INTERNAL_ERROR") {
    return mapGuardRecurringValidationMessage(code);
  }
  return message;
}

async function readFunctionError(
  error: unknown,
): Promise<{ code?: string; message: string | null }> {
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.json()) as FunctionErrorBody;
      return {
        code: body.error?.code ?? body.code,
        message: formatFunctionErrorMessage(body) ?? body.error?.message ?? null,
      };
    } catch {
      return { message: null };
    }
  }
  return { message: null };
}

function assertSupabaseClient(accessToken: string) {
  if (!isSupabaseConfigured()) {
    throw new VisitorError("Backend is not configured.", "BACKEND_NOT_CONFIGURED");
  }
  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new VisitorError("Unable to initialize backend client.", "UNKNOWN");
  }
  return supabase;
}

function mapGuardError(
  parsed: { code?: string; message: string | null },
  fallback: string,
): string {
  if (parsed.code === "UNAUTHORIZED") {
    return "Your session has expired. Please login again.";
  }
  if (parsed.code === "GUARD_OFF_DUTY") {
    return parsed.message ?? GUARD_OFF_DUTY_CHECKIN_MESSAGE;
  }
  if (parsed.code === "FORBIDDEN" || parsed.code === "ACCOUNT_DISABLED") {
    return parsed.message ?? "You do not have permission to perform this action.";
  }
  if (parsed.code && parsed.code !== "INTERNAL_ERROR") {
    return mapGuardRecurringValidationMessage(parsed.code);
  }
  return parsed.message ?? fallback;
}

async function invokeGuardRecurring<T>(
  accessToken: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase.functions.invoke<T & FunctionErrorBody>(
    "guard-recurring-visitor",
    {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    throw new VisitorError(
      mapGuardError(await readFunctionError(error), fallback),
      "UNKNOWN",
    );
  }

  const responseError = formatFunctionErrorMessage(data as FunctionErrorBody);
  if (responseError) {
    throw new VisitorError(
      mapGuardError(
        { code: (data as FunctionErrorBody)?.error?.code, message: responseError },
        fallback,
      ),
      "UNKNOWN",
    );
  }

  return data as T;
}

export interface GuardRecurringValidateResult {
  pass: GuardRecurringPassPreview;
  source: GuardRecurringEntrySource;
}

export interface GuardRecurringSearchItem extends GuardRecurringPassPreview {
  effectiveStatus: string;
}

export async function validateGuardRecurringQr(
  accessToken: string,
  token: string,
  source: "CAMERA_QR" | "IMPORTED_QR",
): Promise<GuardRecurringValidateResult> {
  const result = await invokeGuardRecurring<GuardRecurringValidateResult>(
    accessToken,
    { action: "validate_qr", source, token },
    "This QR is not a valid recurring visitor pass.",
  );
  if (!result?.pass || !isGuardRecurringEntrySource(result.source)) {
    throw new VisitorError(
      "This QR is not a valid recurring visitor pass.",
      "UNKNOWN",
    );
  }
  return result;
}

export async function validateGuardRecurringFallback(
  accessToken: string,
  passId: string,
): Promise<GuardRecurringValidateResult> {
  return invokeGuardRecurring<GuardRecurringValidateResult>(
    accessToken,
    { action: "validate_fallback", pass_id: passId },
    "Unable to validate this recurring visitor.",
  );
}

export async function searchGuardRecurringVisitors(
  accessToken: string,
  query: string,
): Promise<GuardRecurringSearchItem[]> {
  const result = await invokeGuardRecurring<{ items: GuardRecurringSearchItem[] }>(
    accessToken,
    { action: "search", query },
    "Unable to search recurring visitors.",
  );
  return result.items ?? [];
}

export async function checkinGuardRecurringVisitor(
  accessToken: string,
  input:
    | { source: "CAMERA_QR" | "IMPORTED_QR"; token: string }
    | { source: "FALLBACK_SEARCH"; passId: string; fallbackReason: string },
): Promise<{ visitorEntryId: string }> {
  const body =
    input.source === "FALLBACK_SEARCH"
      ? {
          action: "checkin",
          source: input.source,
          pass_id: input.passId,
          fallback_reason: input.fallbackReason,
        }
      : {
          action: "checkin",
          source: input.source,
          token: input.token,
        };

  const result = await invokeGuardRecurring<{ visitorEntryId: string }>(
    accessToken,
    body,
    "Unable to check in this recurring visitor.",
  );
  if (!result?.visitorEntryId) {
    throw new VisitorError("Unable to check in this recurring visitor.", "UNKNOWN");
  }
  return result;
}
