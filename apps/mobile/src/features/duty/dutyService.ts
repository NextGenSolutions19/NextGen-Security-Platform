import {
  DUTY_LOAD_FAILED_MESSAGE,
  DUTY_NETWORK_MESSAGE,
  DUTY_SESSION_EXPIRED_MESSAGE,
  mapDutyUserMessage,
  mapGuardDutySession,
  type GuardDutySession,
  type GuardDutySessionRow,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

export class DutyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DutyError";
  }
}

const DUTY_SESSION_SELECT = "id, started_at, ended_at";

function assertConfiguredClient(accessToken: string) {
  if (!accessToken) {
    throw new DutyError(DUTY_SESSION_EXPIRED_MESSAGE);
  }

  if (!isSupabaseConfigured()) {
    throw new DutyError(DUTY_NETWORK_MESSAGE);
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new DutyError(DUTY_NETWORK_MESSAGE);
  }

  return supabase;
}

export async function loadActiveDutySession(
  accessToken: string,
): Promise<GuardDutySession | null> {
  const supabase = assertConfiguredClient(accessToken);

  const { data, error } = await supabase
    .from("guard_duty_sessions")
    .select(DUTY_SESSION_SELECT)
    .is("ended_at", null)
    .maybeSingle();

  if (error) {
    throw new DutyError(mapDutyUserMessage(error, DUTY_LOAD_FAILED_MESSAGE));
  }

  if (!data) {
    return null;
  }

  return mapGuardDutySession(data as GuardDutySessionRow);
}

export async function startGuardDuty(
  accessToken: string,
): Promise<GuardDutySession> {
  const supabase = assertConfiguredClient(accessToken);

  const { data, error } = await supabase.rpc("start_guard_duty");

  if (error) {
    throw new DutyError(mapDutyUserMessage(error, DUTY_NETWORK_MESSAGE));
  }

  if (!data) {
    throw new DutyError(DUTY_NETWORK_MESSAGE);
  }

  return mapGuardDutySession(data as GuardDutySessionRow);
}

export async function endGuardDuty(
  accessToken: string,
): Promise<GuardDutySession> {
  const supabase = assertConfiguredClient(accessToken);

  const { data, error } = await supabase.rpc("end_guard_duty");

  if (error) {
    throw new DutyError(mapDutyUserMessage(error, DUTY_NETWORK_MESSAGE));
  }

  if (!data) {
    throw new DutyError(DUTY_NETWORK_MESSAGE);
  }

  return mapGuardDutySession(data as GuardDutySessionRow);
}
