import {
  RESIDENT_IMPORT_DB_VERIFY_VERSION,
  type ResidentImportDatabaseVerificationResult,
  type ResidentImportVerifyProposedRow,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

export class ResidentImportVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResidentImportVerifyError";
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

type VerifyFunctionResponse = Omit<
  ResidentImportDatabaseVerificationResult,
  "planFingerprint"
> &
  FunctionErrorBody;

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

function mapVerifyUserMessage(parsed: {
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
    return "You do not have permission to verify residents.";
  }
  if (parsed.message?.trim()) {
    return parsed.message.trim();
  }
  return "Unable to verify against existing residents. Please try again.";
}

export async function verifyResidentImportAgainstDatabase(
  accessToken: string,
  request: { rows: ResidentImportVerifyProposedRow[] },
): Promise<Omit<ResidentImportDatabaseVerificationResult, "planFingerprint">> {
  if (!isSupabaseConfigured()) {
    throw new ResidentImportVerifyError("Backend is not configured.");
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new ResidentImportVerifyError("Unable to initialize backend client.");
  }

  const { data, error } = await supabase.functions.invoke<VerifyFunctionResponse>(
    "admin-resident-import-verify",
    {
      body: request,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    const parsed = await readFunctionError(error);
    throw new ResidentImportVerifyError(mapVerifyUserMessage(parsed));
  }

  if (data?.error?.code) {
    throw new ResidentImportVerifyError(
      mapVerifyUserMessage({
        code: data.error.code,
        message: data.error.message,
      }),
    );
  }

  if (!data?.summary || !Array.isArray(data.rows) || data.readOnly !== true) {
    throw new ResidentImportVerifyError(
      "Unable to verify against existing residents.",
    );
  }

  return {
    version: RESIDENT_IMPORT_DB_VERIFY_VERSION,
    readOnly: true,
    summary: data.summary,
    rows: data.rows,
  };
}
