import { Redirect, Stack, type Href } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";

export default function GuardLayout() {
  const { session } = useAuth();

  if (!session || session.user.role !== "guard") {
    return <Redirect href={"/(auth)/login" as Href} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
