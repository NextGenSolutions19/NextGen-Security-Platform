import { Redirect, Stack, type Href } from "expo-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAuth } from "@/features/auth/AuthProvider";

export default function AdminLayout() {
  const { session } = useAuth();

  if (!session || session.user.role !== "society_admin") {
    return <Redirect href={"/(auth)/login" as Href} />;
  }

  return (
    <AdminShell>
      <Stack screenOptions={{ headerShown: false }} />
    </AdminShell>
  );
}
