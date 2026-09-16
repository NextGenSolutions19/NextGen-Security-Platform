import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useState,

  type PropsWithChildren,

} from "react";

import type {

  AuthSession,

  ChangeCredentialsInput,

  LoginCredentials,

  SocietyContext,

} from "@nextgen/shared";

import { AuthError } from "@nextgen/shared";

import * as authService from "@/features/auth/authService";

import { setSupabaseAccessToken } from "@/lib/supabase/client";

import {

  clearAllAuthStorage,

  clearSession,

  loadSession,

  loadSocietyContext,

  saveSession,

  saveSocietyContext,

} from "@/lib/security/storage";



export type AuthStatus =

  | "loading"

  | "unauthenticated"

  | "needs_society_code"

  | "needs_login"

  | "needs_password_change"

  | "authenticated";



interface AuthContextValue {

  status: AuthStatus;

  session: AuthSession | null;

  societyContext: SocietyContext | null;

  isInitializing: boolean;

  errorMessage: string | null;

  clearError: () => void;

  bootstrap: () => Promise<void>;

  setSocietyCode: (societyCode: string) => Promise<void>;

  signIn: (credentials: Omit<LoginCredentials, "societyCode">) => Promise<void>;

  changeCredentials: (input: ChangeCredentialsInput) => Promise<void>;

  signOut: () => Promise<void>;

  changeSociety: () => Promise<void>;

}



const AuthContext = createContext<AuthContextValue | null>(null);



const SESSION_REFRESH_BUFFER_MS = 1000 * 60 * 5;



function resolveStatus(

  session: AuthSession | null,

  societyContext: SocietyContext | null,

): AuthStatus {

  if (session?.user.mustChangePassword) {

    return "needs_password_change";

  }



  if (session) {

    return "authenticated";

  }



  if (societyContext) {

    return "needs_login";

  }



  return "needs_society_code";

}



async function restoreSession(): Promise<AuthSession | null> {

  const storedSession = await loadSession();

  if (!storedSession) {

    setSupabaseAccessToken(null);

    return null;

  }



  setSupabaseAccessToken(storedSession.accessToken);



  const shouldRefresh =

    storedSession.expiresAt - Date.now() <= SESSION_REFRESH_BUFFER_MS;



  if (!shouldRefresh || !storedSession.refreshToken) {

    return storedSession;

  }



  try {

    const refreshed = await authService.refreshSession(storedSession.refreshToken);

    await saveSession(refreshed.session);

    return refreshed.session;

  } catch {

    await clearSession();

    setSupabaseAccessToken(null);

    return null;

  }

}



export function AuthProvider({ children }: PropsWithChildren) {

  const [status, setStatus] = useState<AuthStatus>("loading");

  const [session, setSession] = useState<AuthSession | null>(null);

  const [societyContext, setSocietyContext] = useState<SocietyContext | null>(

    null,

  );

  const [isInitializing, setIsInitializing] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);



  const bootstrap = useCallback(async () => {

    setIsInitializing(true);



    try {

      const [restoredSession, storedSociety] = await Promise.all([

        restoreSession(),

        loadSocietyContext(),

      ]);



      setSession(restoredSession);

      setSocietyContext(storedSociety);

      setStatus(resolveStatus(restoredSession, storedSociety));

    } finally {

      setIsInitializing(false);

    }

  }, []);



  useEffect(() => {

    void bootstrap();

  }, [bootstrap]);



  const clearError = useCallback(() => {

    setErrorMessage(null);

  }, []);



  const setSocietyCode = useCallback(async (societyCode: string) => {

    setErrorMessage(null);



    try {

      const society = await authService.validateSocietyCode(societyCode);

      await saveSocietyContext(society);

      setSocietyContext(society);

      setStatus("needs_login");

    } catch (error) {

      const message =

        error instanceof AuthError

          ? error.message

          : "Unable to validate society code.";

      setErrorMessage(message);

      throw error;

    }

  }, []);



  const signIn = useCallback(

    async (credentials: Omit<LoginCredentials, "societyCode">) => {

      if (!societyContext) {

        throw new AuthError(

          "Society code is required before login.",

          "UNKNOWN",

        );

      }



      setErrorMessage(null);



      try {

        const result = await authService.login({

          societyCode: societyContext.societyCode,

          loginId: credentials.loginId,

          password: credentials.password,

        });



        await saveSession(result.session);

        setSession(result.session);

        setStatus(resolveStatus(result.session, societyContext));

      } catch (error) {

        const message =

          error instanceof AuthError

            ? error.message

            : "Unable to sign in.";

        setErrorMessage(message);

        throw error;

      }

    },

    [societyContext],

  );



  const changeCredentials = useCallback(

    async (input: ChangeCredentialsInput) => {

      if (!session) {

        throw new AuthError("You must be signed in.", "UNKNOWN");

      }



      setErrorMessage(null);



      try {

        const result = await authService.changeCredentials(

          input,

          session.accessToken,

        );

        await saveSession(result.session);

        setSession(result.session);

        setStatus(resolveStatus(result.session, societyContext));

      } catch (error) {

        const message =

          error instanceof AuthError

            ? error.message

            : "Unable to update credentials.";

        setErrorMessage(message);

        throw error;

      }

    },

    [session, societyContext],

  );



  const signOut = useCallback(async () => {

    setErrorMessage(null);



    try {

      await authService.logout(session);

    } catch {

      // Local sign-out must still succeed if network logout fails.

    } finally {

      await clearSession();

      setSession(null);

      setStatus(resolveStatus(null, societyContext));

    }

  }, [session, societyContext]);



  const changeSociety = useCallback(async () => {

    setErrorMessage(null);

    await authService.logout(session);

    await clearAllAuthStorage();

    setSession(null);

    setSocietyContext(null);

    setStatus("needs_society_code");

  }, [session]);



  const value = useMemo<AuthContextValue>(

    () => ({

      status,

      session,

      societyContext,

      isInitializing,

      errorMessage,

      clearError,

      bootstrap,

      setSocietyCode,

      signIn,

      changeCredentials,

      signOut,

      changeSociety,

    }),

    [

      status,

      session,

      societyContext,

      isInitializing,

      errorMessage,

      clearError,

      bootstrap,

      setSocietyCode,

      signIn,

      changeCredentials,

      signOut,

      changeSociety,

    ],

  );



  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

}



export function useAuth(): AuthContextValue {

  const context = useContext(AuthContext);

  if (!context) {

    throw new Error("useAuth must be used within AuthProvider");

  }

  return context;

}


