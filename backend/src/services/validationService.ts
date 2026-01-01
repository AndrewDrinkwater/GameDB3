import { EntityFieldType, LocationFieldType } from "@prisma/client";

type ChoiceOption = {
  value: string;
  isActive: boolean;
};

type ChoiceList = {
  options?: ChoiceOption[];
};

export type ValidationMode = "create" | "update";

export type FieldValidationResult = {
  invalidChoices: string[];
  invalidNumbers: string[];
};

type EntityFieldValidationTarget = {
  fieldKey: string;
  fieldType: EntityFieldType;
  choiceList?: ChoiceList | null;
};

type LocationFieldValidationTarget = {
  fieldKey: string;
  fieldType: LocationFieldType;
  choiceList?: ChoiceList | null;
};

const isValueProvided = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

const buildChoiceSet = (choices?: ChoiceOption[]) => {
  if (!choices) return new Set<string>();
  return new Set(choices.filter((option) => option.isActive).map((option) => option.value));
};

export const validateEntityInput = ({
  fields,
  fieldValues,
  mode
}: {
  fields: EntityFieldValidationTarget[];
  fieldValues?: Record<string, unknown>;
  mode: ValidationMode;
}): FieldValidationResult => {
  const invalidChoices: string[] = [];
  const invalidNumbers: string[] = [];
  if (!fieldValues) {
    return { invalidChoices, invalidNumbers };
  }

  const fieldMap = new Map(fields.map((field) => [field.fieldKey, field]));

  for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
    const field = fieldMap.get(fieldKey);
    if (!field) continue;
    if (!isValueProvided(rawValue)) continue;

    if (field.fieldType === EntityFieldType.CHOICE) {
      const allowed = buildChoiceSet(field.choiceList?.options);
      if (!field.choiceList || !allowed.has(String(rawValue))) {
        invalidChoices.push(fieldKey);
      }
    }

    if (field.fieldType === EntityFieldType.NUMBER) {
      const numericValue = Number(rawValue);
      if (Number.isNaN(numericValue)) {
        invalidNumbers.push(fieldKey);
      }
    }
  }

  return { invalidChoices, invalidNumbers };
};

export const validateLocationInput = ({
  fields,
  fieldValues,
  mode
}: {
  fields: LocationFieldValidationTarget[];
  fieldValues?: Record<string, unknown>;
  mode: ValidationMode;
}): FieldValidationResult => {
  const invalidChoices: string[] = [];
  const invalidNumbers: string[] = [];
  if (!fieldValues) {
    return { invalidChoices, invalidNumbers };
  }

  const fieldMap = new Map(fields.map((field) => [field.fieldKey, field]));

  for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
    const field = fieldMap.get(fieldKey);
    if (!field) continue;
    if (!isValueProvided(rawValue)) continue;

    if (field.fieldType === LocationFieldType.CHOICE) {
      const allowed = buildChoiceSet(field.choiceList?.options);
      if (!field.choiceList || !allowed.has(String(rawValue))) {
        invalidChoices.push(fieldKey);
      }
    }

    if (field.fieldType === LocationFieldType.NUMBER) {
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        invalidNumbers.push(fieldKey);
      }
    }
  }

  return { invalidChoices, invalidNumbers };
};
