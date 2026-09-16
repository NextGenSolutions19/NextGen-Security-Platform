import { useEffect } from "react";
import { type Href, useRouter, useSegments } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";

const ROUTES = {
  splash: "/(splash)" as Href,
  societyCode: "/(society-code)" as Href,
  login: "/(auth)/login" as Href,
  changePassword: "/(auth)/change-password" as Href,
  guardHome: "/(guard)/home" as Href,
  adminDashboard: "/(admin)/dashboard" as Href,
} as const;

export function useAuthNavigationGuard(): void {
  const { status, isInitializing, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === "(auth)";
    const inSocietyCodeGroup = segments[0] === "(society-code)";
    const inSplashGroup = segments[0] === "(splash)";
    const inGuardGroup = segments[0] === "(guard)";
    const inAdminGroup = segments[0] === "(admin)";
    const onChangePassword = segments.join("/") === "(auth)/change-password";

    if (isInitializing) {
      if (!inSplashGroup) {
        router.replace(ROUTES.splash);
      }
      return;
    }

    if (status === "needs_society_code") {
      if (!inSocietyCodeGroup) {
        router.replace(ROUTES.societyCode);
      }
      return;
    }

    if (status === "needs_login") {
      if (!inAuthGroup || onChangePassword) {
        router.replace(ROUTES.login);
      }
      return;
    }

    if (status === "needs_password_change") {
      if (!onChangePassword) {
        router.replace(ROUTES.changePassword);
      }
      return;
    }

    if (status === "authenticated" && session) {
      if (inAuthGroup || inSocietyCodeGroup || inSplashGroup) {
        router.replace(
          session.user.role === "guard"
            ? ROUTES.guardHome
            : ROUTES.adminDashboard,
        );
        return;
      }

      if (session.user.role === "guard" && !inGuardGroup) {
        router.replace(ROUTES.guardHome);
        return;
      }

      if (session.user.role === "society_admin" && !inAdminGroup) {
        router.replace(ROUTES.adminDashboard);
      }
    }
  }, [status, isInitializing, session, segments, router]);
}

