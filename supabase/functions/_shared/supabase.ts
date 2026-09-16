import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

function resolveServiceRoleKey(): string {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacyKey) {
    return legacyKey;
  }

  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const secretKeys = JSON.parse(secretKeysRaw) as Record<string, string>;
      const defaultKey = secretKeys.default?.trim();
      if (defaultKey) {
        return defaultKey;
      }
    } catch {
      // Fall through to missing-config error below.
    }
  }

  throw new Error("Missing Supabase service configuration.");
}

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = resolveServiceRoleKey();

  if (!url) {
    throw new Error("Missing Supabase service configuration.");
  }

  const globalHeaders: Record<string, string> = {
    apikey: serviceRoleKey,
  };

  // New-format secret keys are not JWTs and must not be sent as Bearer tokens.
  if (!serviceRoleKey.startsWith("sb_secret_")) {
    globalHeaders.Authorization = `Bearer ${serviceRoleKey}`;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: globalHeaders,
    },
  });
}

export function createUserClient(accessToken: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    throw new Error("Missing Supabase client configuration.");
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
