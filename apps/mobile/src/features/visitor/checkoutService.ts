import type { VisitorEntry } from "@nextgen/shared";
import { VisitorError } from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

interface FunctionErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
}

interface CheckoutVisitorResponse {
  visitorEntry: VisitorEntry;
  alreadyCheckedOut?: boolean;
}

function formatFunctionErrorMessage(body: FunctionErrorBody): string | null {
  const code = body.error?.code ?? body.code;
  const message = body.error?.message ?? body.message;
  if (!message) {
    return null;
  }

  if (code && code !== "INTERNAL_ERROR") {
    return `${message} (${code})`;
  }

  return message;
}

function mapCheckoutErrorCode(code?: string) {
  switch (code) {
    case "VALIDATION_ERROR":
      return "VALIDATION_ERROR" as const;
    case "FORBIDDEN":
      return "FORBIDDEN" as const;
    case "VISITOR_NOT_FOUND":
    case "VISITOR_NOT_CHECKED_IN":
      return "NOT_FOUND" as const;
    case "VISITOR_ALREADY_CHECKED_OUT":
      return "NOT_FOUND" as const;
    default:
      return "UNKNOWN" as const;
  }
}

export interface CheckoutVisitorResult {
  visitorEntry: VisitorEntry;
  alreadyCheckedOut: boolean;
}

export async function checkoutVisitor(
  accessToken: string,
  visitorEntryId: string,
): Promise<CheckoutVisitorResult> {
  if (!isSupabaseConfigured()) {
    throw new VisitorError(
      "Backend is not configured.",
      "BACKEND_NOT_CONFIGURED",
    );
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new VisitorError("Unable to initialize backend client.", "UNKNOWN");
  }

  const { data, error } = await supabase.functions.invoke<CheckoutVisitorResponse>(
    "checkout-visitor",
    {
      body: { visitor_entry_id: visitorEntryId },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    if (
      error &&
      typeof error === "object" &&
      "context" in error &&
      error.context instanceof Response
    ) {
      try {
        const body = (await error.context.json()) as FunctionErrorBody;
        const message = formatFunctionErrorMessage(body);
        if (message) {
          throw new VisitorError(
            message,
            mapCheckoutErrorCode(body.error?.code ?? body.code),
          );
        }
      } catch (parseError) {
        if (parseError instanceof VisitorError) {
          throw parseError;
        }
      }
    }

    throw new VisitorError("Unable to check out visitor.", "NETWORK_ERROR");
  }

  const responseBody = data as FunctionErrorBody & CheckoutVisitorResponse;
  const responseErrorMessage = formatFunctionErrorMessage(responseBody);
  if (responseErrorMessage) {
    throw new VisitorError(
      responseErrorMessage,
      mapCheckoutErrorCode(responseBody.error?.code ?? responseBody.code),
    );
  }

  if (!responseBody?.visitorEntry) {
    throw new VisitorError("Unable to check out visitor.", "UNKNOWN");
  }

  return {
    visitorEntry: responseBody.visitorEntry,
    alreadyCheckedOut: Boolean(responseBody.alreadyCheckedOut),
  };
}
