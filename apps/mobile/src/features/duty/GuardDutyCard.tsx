import { useCallback, useState } from "react";

import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useFocusEffect } from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import {

  DUTY_ALREADY_OFF_MESSAGE,

  DUTY_ALREADY_ON_MESSAGE,

  DUTY_END_ACTION_LABEL,

  DUTY_LOAD_FAILED_MESSAGE,

  DUTY_START_ACTION_LABEL,

  DUTY_STATUS_OFF,

  DUTY_STATUS_ON,

  formatDutyStartedAt,

  isActiveDutySession,

  type GuardDutySession,

} from "@nextgen/shared";

import { Button } from "@/components/ui/Button";

import { ErrorBanner } from "@/components/ui/ErrorBanner";

import { StatusBadge } from "@/components/ui/StatusBadge";

import {

  DutyError,

  endGuardDuty,

  loadActiveDutySession,

  startGuardDuty,

} from "@/features/duty/dutyService";

import { colors, radius, spacing, typography } from "@/constants/theme";



interface GuardDutyCardProps {

  accessToken: string;

}



export function GuardDutyCard({ accessToken }: GuardDutyCardProps) {

  const [session, setSession] = useState<GuardDutySession | null>(null);

  const [hasLoaded, setHasLoaded] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);



  const refreshDuty = useCallback(async () => {

    if (!accessToken) {

      setHasLoaded(false);

      setErrorMessage("Your session has expired. Please login again.");

      return;

    }



    setIsLoading(true);

    setErrorMessage(null);



    try {

      const active = await loadActiveDutySession(accessToken);

      setSession(active);

      setHasLoaded(true);

    } catch (error) {

      setHasLoaded(false);

      setErrorMessage(

        error instanceof DutyError ? error.message : DUTY_LOAD_FAILED_MESSAGE,

      );

    } finally {

      setIsLoading(false);

    }

  }, [accessToken]);



  useFocusEffect(

    useCallback(() => {

      void refreshDuty();

    }, [refreshDuty]),

  );



  const handleGoOnDuty = async () => {

    if (isSubmitting) {

      return;

    }



    setIsSubmitting(true);

    setErrorMessage(null);



    try {

      const started = await startGuardDuty(accessToken);

      setSession(started);

      setHasLoaded(true);

    } catch (error) {

      const message =

        error instanceof DutyError ? error.message : DUTY_LOAD_FAILED_MESSAGE;

      setErrorMessage(message);



      if (message === DUTY_ALREADY_ON_MESSAGE) {

        try {

          const active = await loadActiveDutySession(accessToken);

          setSession(active);

          setHasLoaded(true);

        } catch {

          // Keep previous known status.

        }

      }

    } finally {

      setIsSubmitting(false);

    }

  };



  const handleGoOffDuty = async () => {

    if (isSubmitting) {

      return;

    }



    setIsSubmitting(true);

    setErrorMessage(null);



    try {

      await endGuardDuty(accessToken);

      setSession(null);

      setHasLoaded(true);

    } catch (error) {

      const message =

        error instanceof DutyError ? error.message : DUTY_LOAD_FAILED_MESSAGE;

      setErrorMessage(message);



      if (message === DUTY_ALREADY_OFF_MESSAGE) {

        try {

          const active = await loadActiveDutySession(accessToken);

          setSession(active);

          setHasLoaded(true);

        } catch {

          // Keep previous known status.

        }

      }

    } finally {

      setIsSubmitting(false);

    }

  };



  const isOnDuty = isActiveDutySession(session);



  return (

    <View

      style={[

        styles.card,

        isOnDuty ? styles.cardOnDuty : styles.cardOffDuty,

      ]}

    >

      <View style={styles.headerRow}>

        <View style={styles.titleRow}>

          <View

            style={[

              styles.iconWrap,

              { backgroundColor: isOnDuty ? colors.successBackground : colors.background },

            ]}

          >

            <Ionicons

              name="shield-checkmark-outline"

              size={24}

              color={isOnDuty ? colors.success : colors.slate}

            />

          </View>

          <View style={styles.titleText}>

            <Text style={styles.title}>Duty Session</Text>

            <Text style={styles.subtitle}>Track your on-duty status for this society</Text>

          </View>

        </View>

        {hasLoaded && !isLoading ? (

          <StatusBadge

            label={isOnDuty ? DUTY_STATUS_ON : DUTY_STATUS_OFF}

            tone={isOnDuty ? "success" : "neutral"}

          />

        ) : null}

      </View>



      {isLoading && !hasLoaded ? (

        <View style={styles.loadingRow}>

          <ActivityIndicator color={colors.primaryBlue} />

          <Text style={styles.hint}>Loading duty status...</Text>

        </View>

      ) : hasLoaded ? (

        <>

          {isOnDuty && session ? (

            <Text style={styles.shiftText}>

              Shift started: {formatDutyStartedAt(session.startedAt)}

            </Text>

          ) : (

            <Text style={styles.hint}>

              Go on duty when your shift begins at the gate.

            </Text>

          )}

        </>

      ) : (

        <Text style={styles.hint}>Duty status is unavailable.</Text>

      )}



      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}



      <View style={styles.actionRow}>

        {hasLoaded ? (

          isOnDuty ? (

            <Button

              label={DUTY_END_ACTION_LABEL}

              variant="secondary"

              loading={isSubmitting}

              disabled={isSubmitting}

              onPress={() => void handleGoOffDuty()}

              style={styles.actionButton}

            />

          ) : (

            <Button

              label={DUTY_START_ACTION_LABEL}

              loading={isSubmitting}

              disabled={isSubmitting}

              onPress={() => void handleGoOnDuty()}

              style={styles.actionButton}

            />

          )

        ) : (

          <Button

            label="Retry"

            variant="secondary"

            disabled={isLoading || isSubmitting}

            onPress={() => void refreshDuty()}

            style={styles.actionButton}

          />

        )}

      </View>

    </View>

  );

}



const styles = StyleSheet.create({

  card: {

    borderRadius: radius.lg,

    borderWidth: 1,

    padding: spacing.lg,

    gap: spacing.md,

  },

  cardOnDuty: {

    backgroundColor: colors.successBackground,

    borderColor: "#BBF7D0",

  },

  cardOffDuty: {

    backgroundColor: colors.surface,

    borderColor: colors.border,

  },

  headerRow: {

    flexDirection: "row",

    alignItems: "flex-start",

    justifyContent: "space-between",

    gap: spacing.md,

  },

  titleRow: {

    flex: 1,

    flexDirection: "row",

    alignItems: "center",

    gap: spacing.md,

  },

  iconWrap: {

    width: 44,

    height: 44,

    borderRadius: radius.md,

    alignItems: "center",

    justifyContent: "center",

  },

  titleText: {

    flex: 1,

    gap: spacing.xs,

  },

  title: {

    ...typography.subtitle,

    fontSize: 17,

    color: colors.navy,

  },

  subtitle: {

    ...typography.caption,

  },

  shiftText: {

    ...typography.body,

    fontWeight: "600",

    color: colors.success,

  },

  hint: {

    ...typography.caption,

    fontSize: 14,

  },

  loadingRow: {

    flexDirection: "row",

    alignItems: "center",

    gap: spacing.sm,

  },

  actionRow: {

    paddingTop: spacing.xs,

  },

  actionButton: {

    alignSelf: "flex-start",

    minWidth: 180,

  },

});


