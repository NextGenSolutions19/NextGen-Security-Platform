import {
  RECURRING_PASS_VISITOR_TYPE_LABEL_MAX_LENGTH,
  RECURRING_VISITOR_TYPES,
  requiresCustomRecurringVisitorType,
  type RecurringVisitorTypeCode,
} from "@nextgen/shared";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const VISITOR_TYPE_CODES = RECURRING_VISITOR_TYPES.map((type) => type.code);

export interface AdminRecurringVisitorTypeFieldErrors {
  visitorTypeCode?: string;
  customVisitorType?: string;
}

interface AdminRecurringVisitorTypeFieldsProps {
  visitorTypeCode: RecurringVisitorTypeCode | null;
  customVisitorType: string;
  errors: AdminRecurringVisitorTypeFieldErrors;
  onChangeVisitorTypeCode: (code: RecurringVisitorTypeCode) => void;
  onChangeCustomVisitorType: (value: string) => void;
}

export function AdminRecurringVisitorTypeFields({
  visitorTypeCode,
  customVisitorType,
  errors,
  onChangeVisitorTypeCode,
  onChangeCustomVisitorType,
}: AdminRecurringVisitorTypeFieldsProps) {
  return (
    <>
      <SelectField
        label="Visitor Type *"
        value={visitorTypeCode}
        options={VISITOR_TYPE_CODES}
        placeholder="Select visitor type"
        getOptionLabel={(code) =>
          RECURRING_VISITOR_TYPES.find((type) => type.code === code)?.label ??
          code
        }
        error={errors.visitorTypeCode}
        onChange={onChangeVisitorTypeCode}
      />
      {requiresCustomRecurringVisitorType(visitorTypeCode) ? (
        <TextField
          label="Specify Visitor Type *"
          value={customVisitorType}
          onChangeText={onChangeCustomVisitorType}
          placeholder="e.g. Gardener, Car Washer"
          autoCapitalize="words"
          maxLength={RECURRING_PASS_VISITOR_TYPE_LABEL_MAX_LENGTH}
          error={errors.customVisitorType}
        />
      ) : null}
    </>
  );
}
