import {
  ADMIN_RESIDENT_TYPES,
  type AdminResidentFormErrors,
  type AdminResidentType,
} from "@nextgen/shared";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

interface AdminResidentFormFieldsProps {
  flatNumber: string;
  residentName: string;
  mobile: string;
  wingBuilding: string;
  residentType: AdminResidentType | null;
  errors: AdminResidentFormErrors;
  onChangeFlatNumber: (value: string) => void;
  onChangeResidentName: (value: string) => void;
  onChangeMobile: (value: string) => void;
  onChangeWingBuilding: (value: string) => void;
  onChangeResidentType: (value: AdminResidentType) => void;
}

export function AdminResidentFormFields({
  flatNumber,
  residentName,
  mobile,
  wingBuilding,
  residentType,
  errors,
  onChangeFlatNumber,
  onChangeResidentName,
  onChangeMobile,
  onChangeWingBuilding,
  onChangeResidentType,
}: AdminResidentFormFieldsProps) {
  return (
    <>
      <TextField
        label="Flat Number *"
        value={flatNumber}
        onChangeText={onChangeFlatNumber}
        autoCapitalize="characters"
        autoCorrect={false}
        error={errors.flatNumber}
      />
      <TextField
        label="Resident Name *"
        value={residentName}
        onChangeText={onChangeResidentName}
        autoCapitalize="words"
        error={errors.residentName}
      />
      <TextField
        label="Mobile Number *"
        value={mobile}
        onChangeText={onChangeMobile}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoCorrect={false}
        error={errors.mobile}
      />
      <TextField
        label="Wing / Building"
        value={wingBuilding}
        onChangeText={onChangeWingBuilding}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <SelectField
        label="Resident Type"
        value={residentType}
        options={ADMIN_RESIDENT_TYPES}
        placeholder="Select resident type"
        error={errors.residentType}
        onChange={onChangeResidentType}
      />
    </>
  );
}
