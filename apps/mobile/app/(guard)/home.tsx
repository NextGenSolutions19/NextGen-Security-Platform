import {

  ScrollView,

  StyleSheet,

  Text,

  View,

  useWindowDimensions,

  type ViewStyle,

} from "react-native";

import { useRouter } from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/features/auth/AuthProvider";

import { GuardDutyCard } from "@/features/duty/GuardDutyCard";

import { GUARD_DASHBOARD_ACTIONS } from "@/features/guard-dashboard/guardDashboardModules";

import { ActionCard } from "@/components/ui/ActionCard";

import { Button } from "@/components/ui/Button";

import { Screen } from "@/components/ui/Screen";

import {

  cardShadow,

  colors,

  radius,

  spacing,

  typography,

} from "@/constants/theme";



function getActionItemStyle(index: number, screenWidth: number): ViewStyle {

  if (screenWidth >= 1080) {

    if (index >= 8) {

      return { width: "48%", minWidth: 280 };

    }

    return { width: "23.5%", minWidth: 220 };

  }



  if (screenWidth >= 768) {

    return { width: "31%", minWidth: 210 };

  }



  return { width: "48%", minWidth: 160 };

}



export default function GuardHomeScreen() {

  const router = useRouter();

  const { session, signOut } = useAuth();

  const user = session?.user;

  const { width } = useWindowDimensions();



  return (

    <Screen contentWidth="wide">

      <ScrollView

        style={styles.scroll}

        contentContainerStyle={styles.scrollContent}

        keyboardShouldPersistTaps="handled"

        showsVerticalScrollIndicator

      >

        <View style={[styles.headerCard, cardShadow()]}>

          <View style={styles.headerAccent} />

          <View style={styles.headerBody}>

            <View style={styles.headerTop}>

              <View style={styles.brandMark}>

                <Ionicons name="shield-checkmark" size={28} color={colors.teal} />

              </View>

              <View style={styles.headerText}>

                <Text style={styles.headerEyebrow}>Guard Dashboard</Text>

                {user ? (

                  <>

                    <Text style={styles.guardIdentity}>{user.loginId}</Text>

                    <Text style={styles.societyLine} numberOfLines={2}>

                      {user.societyName} • {user.societyCode}

                    </Text>

                  </>

                ) : (

                  <Text style={styles.headerSubtitle}>

                    Security operations for your assigned society

                  </Text>

                )}

              </View>

            </View>



            {session?.accessToken ? (

              <GuardDutyCard accessToken={session.accessToken} />

            ) : null}

          </View>

        </View>



        <View style={styles.sectionHeader}>

          <Text style={styles.sectionTitle}>Operational modules</Text>

          <Text style={styles.sectionCaption}>

            Touch-friendly shortcuts for daily guard workflows

          </Text>

        </View>



        <View style={styles.actionGrid}>

          {GUARD_DASHBOARD_ACTIONS.map((action, index) => (

            <View

              key={action.title}

              style={[styles.actionItem, getActionItemStyle(index, width)]}

            >

              <ActionCard

                title={action.title}

                hint={action.hint}

                icon={action.icon}

                accent={action.accent}

                prominent

                emphasis={action.emphasis}

                onPress={() => router.push(action.route)}

              />

            </View>

          ))}

        </View>



        <View style={styles.footer}>

          <Button

            label="Sign Out"

            variant="secondary"

            onPress={() => void signOut()}

          />

        </View>

      </ScrollView>

    </Screen>

  );

}



const styles = StyleSheet.create({

  scroll: {

    flex: 1,

  },

  scrollContent: {

    paddingBottom: spacing.xl,

    gap: spacing.lg,

  },

  headerCard: {

    backgroundColor: colors.surface,

    borderRadius: radius.xl,

    borderWidth: 1,

    borderColor: colors.border,

    overflow: "hidden",

  },

  headerAccent: {

    height: 4,

    backgroundColor: colors.teal,

  },

  headerBody: {

    padding: spacing.lg,

    gap: spacing.lg,

  },

  headerTop: {

    flexDirection: "row",

    alignItems: "flex-start",

    gap: spacing.md,

  },

  brandMark: {

    width: 52,

    height: 52,

    borderRadius: radius.lg,

    backgroundColor: colors.lightBlue,

    alignItems: "center",

    justifyContent: "center",

  },

  headerText: {

    flex: 1,

    gap: spacing.xs,

    paddingTop: 2,

  },

  headerEyebrow: {

    ...typography.caption,

    textTransform: "uppercase",

    letterSpacing: 0.6,

    fontWeight: "700",

    color: colors.primaryBlue,

  },

  guardIdentity: {

    ...typography.title,

    fontSize: 26,

    color: colors.navy,

    letterSpacing: -0.4,

  },

  societyLine: {

    ...typography.body,

    fontSize: 16,

    color: colors.textSecondary,

    marginTop: spacing.xs,

  },

  headerSubtitle: {

    ...typography.caption,

    fontSize: 15,

  },

  sectionHeader: {

    gap: spacing.xs,

  },

  sectionTitle: {

    ...typography.subtitle,

    fontSize: 18,

    color: colors.navy,

  },

  sectionCaption: {

    ...typography.caption,

    fontSize: 14,

  },

  actionGrid: {

    flexDirection: "row",

    flexWrap: "wrap",

    gap: spacing.lg,

  },

  actionItem: {

    flexGrow: 1,

  },

  footer: {

    marginTop: spacing.sm,

    paddingTop: spacing.lg,

    borderTopWidth: 1,

    borderTopColor: colors.border,

  },

});


