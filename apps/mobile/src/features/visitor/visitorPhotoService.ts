import { VisitorError, type VisitorErrorCode } from "@nextgen/shared";
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

export interface VisitorPhotoSignedUrlResult {
  visitorEntryId: string;
  signedUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
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

function mapPhotoErrorCode(code?: string): VisitorErrorCode {
  switch (code) {
    case "VALIDATION_ERROR":
      return "VALIDATION_ERROR";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "VISITOR_NOT_FOUND":
    case "PHOTO_NOT_FOUND":
    case "PHOTO_NOT_READY":
      return "NOT_FOUND";
    case "PHOTO_URL_FAILED":
    case "PHOTO_UPLOAD_FAILED":
      return "PHOTO_ERROR";
    case "BACKEND_NOT_CONFIGURED":
      return "BACKEND_NOT_CONFIGURED";
    default:
      return "UNKNOWN";
  }
}

export async function getVisitorPhotoSignedUrl(
  accessToken: string,
  visitorEntryId: string,
): Promise<VisitorPhotoSignedUrlResult> {
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

  const { data, error } = await supabase.functions.invoke<
    VisitorPhotoSignedUrlResult & FunctionErrorBody
  >("get-visitor-photo", {
    body: { visitor_entry_id: visitorEntryId },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

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
            mapPhotoErrorCode(body.error?.code ?? body.code),
          );
        }
      } catch (parseError) {
        if (parseError instanceof VisitorError) {
          throw parseError;
        }
      }
    }

    throw new VisitorError("Unable to load visitor photo.", "NETWORK_ERROR");
  }

  const responseBody = data as FunctionErrorBody & VisitorPhotoSignedUrlResult;
  const responseErrorMessage = formatFunctionErrorMessage(responseBody);
  if (responseErrorMessage) {
    throw new VisitorError(
      responseErrorMessage,
      mapPhotoErrorCode(responseBody.error?.code ?? responseBody.code),
    );
  }

  if (!responseBody?.signedUrl) {
    throw new VisitorError("Unable to load visitor photo.", "PHOTO_ERROR");
  }

  return {
    visitorEntryId: responseBody.visitorEntryId,
    signedUrl: responseBody.signedUrl,
    expiresAt: responseBody.expiresAt,
    expiresInSeconds: responseBody.expiresInSeconds,
  };
}
