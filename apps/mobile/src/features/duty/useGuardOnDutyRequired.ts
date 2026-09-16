import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  GUARD_OFF_DUTY_CHECKIN_MESSAGE,
  isActiveDutySession,
} from "@nextgen/shared";
import { loadActiveDutySession } from "@/features/duty/dutyService";

export function useGuardOnDutyRequired(accessToken: string) {
  const [isOnDuty, setIsOnDuty] = useState<boolean | null>(null);
  const [isCheckingDuty, setIsCheckingDuty] = useState(true);

  const refreshDuty = useCallback(async () => {
    if (!accessToken) {
      setIsOnDuty(false);
      setIsCheckingDuty(false);
      return;
    }

    setIsCheckingDuty(true);
    try {
      const session = await loadActiveDutySession(accessToken);
      setIsOnDuty(isActiveDutySession(session));
    } catch {
      setIsOnDuty(false);
    } finally {
      setIsCheckingDuty(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      void refreshDuty();
    }, [refreshDuty]),
  );

  return {
    isOnDuty,
    isCheckingDuty,
    isOffDuty: isOnDuty === false,
    offDutyMessage: GUARD_OFF_DUTY_CHECKIN_MESSAGE,
  };
}
