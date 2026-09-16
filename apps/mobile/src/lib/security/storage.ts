import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthSession, SocietyContext } from "@nextgen/shared";
import { STORAGE_KEYS } from "@/constants/storage";

export async function saveSocietyContext(context: SocietyContext): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.societyContext,
    JSON.stringify(context),
  );
}

export async function loadSocietyContext(): Promise<SocietyContext | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.societyContext);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SocietyContext;
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEYS.societyContext);
    return null;
  }
}

export async function clearSocietyContext(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.societyContext);
}

export async function saveSession(session: AuthSession): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}

export async function loadSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.session);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as AuthSession;
    if (session.expiresAt <= Date.now()) {
      await clearSession();
      return null;
    }
    return session;
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.session);
}

export async function clearAllAuthStorage(): Promise<void> {
  await Promise.all([clearSession(), clearSocietyContext()]);
}
