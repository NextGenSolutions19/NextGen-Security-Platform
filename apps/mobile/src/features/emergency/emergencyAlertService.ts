import {
  RAISE_EMERGENCY_NETWORK_MESSAGE,
  buildRaiseEmergencyRequest,
  mapRaiseEmergencyUserMessage,
  type RaisedEmergencyEvent,
  type SocietyEmergencyType,
} from "@nextgen/shared";
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
  emergencyEvent?: RaisedEmergencyEvent;
}

interface RaiseEmergencyResponse {
  emergencyEvent: RaisedEmergencyEvent;
}

export class EmergencyAlertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmergencyAlertError";
  }
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

function assertConfiguredClient(accessToken: string) {
  if (!isSupabaseConfigured()) {
    throw new EmergencyAlertError(RAISE_EMERGENCY_NETWORK_MESSAGE);
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new EmergencyAlertError(RAISE_EMERGENCY_NETWORK_MESSAGE);
  }

  return supabase;
}

export async function raiseEmergencyAlert(
  accessToken: string,
  emergencyType: SocietyEmergencyType,
  notes?: string,
): Promise<RaisedEmergencyEvent> {
  const supabase = assertConfiguredClient(accessToken);
  const body = buildRaiseEmergencyRequest(emergencyType, notes);

  const { data, error } = await supabase.functions.invoke<RaiseEmergencyResponse>(
    "raise-emergency",
    {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    const parsed = await readFunctionError(error);
    throw new EmergencyAlertError(mapRaiseEmergencyUserMessage(parsed));
  }

  const responseBody = data as FunctionErrorBody & RaiseEmergencyResponse;
  if (responseBody?.error?.code) {
    throw new EmergencyAlertError(
      mapRaiseEmergencyUserMessage({
        code: responseBody.error.code,
        message: responseBody.error.message,
      }),
    );
  }

  const event = responseBody?.emergencyEvent;
  if (
    !event?.id ||
    !event.emergencyType ||
    !event.raisedAt ||
    !event.status
  ) {
    throw new EmergencyAlertError(RAISE_EMERGENCY_NETWORK_MESSAGE);
  }

  return {
    id: event.id,
    emergencyType: event.emergencyType,
    raisedAt: event.raisedAt,
    status: event.status,
  };
}
