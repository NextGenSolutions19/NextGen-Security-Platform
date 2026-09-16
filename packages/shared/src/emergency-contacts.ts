export interface NationalEmergencyContact {
  id: string;
  label: string;
  number: string;
}

export const NATIONAL_EMERGENCY_CONTACTS: readonly NationalEmergencyContact[] =
  [
    {
      id: "erss",
      label: "Emergency Response Support System",
      number: "112",
    },
    {
      id: "police",
      label: "Police",
      number: "100",
    },
    {
      id: "ambulance",
      label: "Ambulance",
      number: "102",
    },
    {
      id: "fire",
      label: "Fire Brigade",
      number: "101",
    },
  ] as const;

export const SOCIETY_EMERGENCY_CONTACTS_EMPTY_MESSAGE =
  "Society emergency contacts are not configured yet.";

export function buildEmergencyTelUrl(number: string): string {
  const normalized = number.trim();
  return `tel:${normalized}`;
}
