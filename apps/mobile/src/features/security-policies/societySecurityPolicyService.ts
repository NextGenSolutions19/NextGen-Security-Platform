import {
  SECURITY_POLICY_LOAD_FAILED_MESSAGE,
  parseSocietySecurityPolicy,
  type SocietySecurityPolicy,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

export type SocietySecurityPolicySource = "stored" | "defaults";

export interface SocietySecurityPolicyResult {
  policy: SocietySecurityPolicy;
  source: SocietySecurityPolicySource;
}

export class SocietySecurityPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocietySecurityPolicyError";
  }
}

interface FunctionErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
  policy?: SocietySecurityPolicy;
  source?: SocietySecurityPolicySource;
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

function mapPolicyUserMessage(parsed: {
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
    return "You do not have permission to manage security policies.";
  }
  return parsed.message ?? SECURITY_POLICY_LOAD_FAILED_MESSAGE;
}

function assertConfiguredClient(accessToken: string) {
  if (!isSupabaseConfigured()) {
    throw new SocietySecurityPolicyError(SECURITY_POLICY_LOAD_FAILED_MESSAGE);
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new SocietySecurityPolicyError(SECURITY_POLICY_LOAD_FAILED_MESSAGE);
  }

  return supabase;
}

function parsePolicyResponse(data: FunctionErrorBody | null): SocietySecurityPolicyResult {
  if (data?.error?.code) {
    throw new SocietySecurityPolicyError(
      mapPolicyUserMessage({
        code: data.error.code,
        message: data.error.message,
      }),
    );
  }

  return {
    policy: parseSocietySecurityPolicy(data?.policy),
    source: data?.source === "stored" ? "stored" : "defaults",
  };
}

export async function getSocietySecurityPolicies(
  accessToken: string,
): Promise<SocietySecurityPolicyResult> {
  const supabase = assertConfiguredClient(accessToken);
  const { data, error } = await supabase.functions.invoke<FunctionErrorBody>(
    "society-security-policies",
    {
      body: { action: "get" },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    const parsed = await readFunctionError(error);
    throw new SocietySecurityPolicyError(mapPolicyUserMessage(parsed));
  }

  return parsePolicyResponse(data);
}

export async function saveSocietySecurityPolicies(
  accessToken: string,
  policy: SocietySecurityPolicy,
): Promise<SocietySecurityPolicyResult> {
  const supabase = assertConfiguredClient(accessToken);
  const { data, error } = await supabase.functions.invoke<FunctionErrorBody>(
    "society-security-policies",
    {
      body: {
        action: "save",
        otpRequired: policy.otpRequired,
        residentSelectionRequired: policy.residentSelectionRequired,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    const parsed = await readFunctionError(error);
    throw new SocietySecurityPolicyError(mapPolicyUserMessage(parsed));
  }

  return parsePolicyResponse(data);
}
