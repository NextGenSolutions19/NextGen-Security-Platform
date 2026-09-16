import {
  RESIDENT_IMPORT_CONFIRM_FUNCTION_NAME,
  RESIDENT_IMPORT_CONFIRM_REQUEST_FAILED_MESSAGE,
  parseResidentImportConfirmClientResponse,
  type ResidentImportConfirmClientRequest,
  type ResidentImportConfirmHttpSuccess,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

export class ResidentImportConfirmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResidentImportConfirmError";
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

function mapConfirmUserMessage(parsed: {
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
    return "You do not have permission to import residents.";
  }
  if (parsed.message?.trim()) {
    return parsed.message.trim();
  }
  return RESIDENT_IMPORT_CONFIRM_REQUEST_FAILED_MESSAGE;
}

export async function confirmResidentImportRows(
  accessToken: string,
  request: ResidentImportConfirmClientRequest,
): Promise<ResidentImportConfirmHttpSuccess> {
  if (!isSupabaseConfigured()) {
    throw new ResidentImportConfirmError("Backend is not configured.");
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new ResidentImportConfirmError("Unable to initialize backend client.");
  }

  const { data, error } = await supabase.functions.invoke(
    RESIDENT_IMPORT_CONFIRM_FUNCTION_NAME,
    {
      body: request,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    const parsed = await readFunctionError(error);
    throw new ResidentImportConfirmError(mapConfirmUserMessage(parsed));
  }

  const body = data as FunctionErrorBody | ResidentImportConfirmHttpSuccess | null;
  if (body && "error" in body && body.error?.code) {
    throw new ResidentImportConfirmError(
      mapConfirmUserMessage({
        code: body.error.code,
        message: body.error.message,
      }),
    );
  }

  const parsed = parseResidentImportConfirmClientResponse(data);
  if (!parsed) {
    throw new ResidentImportConfirmError(
      RESIDENT_IMPORT_CONFIRM_REQUEST_FAILED_MESSAGE,
    );
  }

  return parsed;
}
