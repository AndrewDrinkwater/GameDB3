import { Prisma, EntityFieldType, LocationFieldType } from "@prisma/client";
import type { FilterLogic, FilterRule } from "../types/filters";

export type FieldDefinition = {
  fieldKey: string;
  fieldType: EntityFieldType | LocationFieldType;
};

type RelationKey = "values" | "fieldValues";
type ValueWhereInput = Prisma.EntityFieldValueWhereInput | Prisma.LocationFieldValueWhereInput;

type FilterServiceOptions = {
  logic?: FilterLogic;
  relation?: RelationKey;
  numberValidator?: (value: number) => boolean;
};

const defaultNumberValidator = (value: number) => !Number.isNaN(value);

const isBooleanField = (fieldType: EntityFieldType | LocationFieldType) => fieldType === "BOOLEAN";
const isNumberField = (fieldType: EntityFieldType | LocationFieldType) => fieldType === "NUMBER";
const isChoiceField = (fieldType: EntityFieldType | LocationFieldType) => fieldType === "CHOICE";

export const buildWhereClause = (
  filters: FilterRule[],
  fieldDefinitions: FieldDefinition[],
  options: FilterServiceOptions = {}
): Prisma.EntityWhereInput | Prisma.LocationWhereInput | null => {
  const relation: RelationKey = options.relation ?? "values";
  const clauseKey = relation;
  const numberValidator = options.numberValidator ?? defaultNumberValidator;
  const logic: FilterLogic = options.logic ?? "AND";
  const fieldMap = new Map(fieldDefinitions.map((field) => [field.fieldKey, field.fieldType]));
  const clauses: Array<Record<string, unknown>> = [];

  filters.forEach((rule) => {
    const fieldKey = rule.fieldKey?.trim();
    if (!fieldKey || !rule.operator) return;

    if (fieldKey === "name" || fieldKey === "description") {
      const value = rule.value ? String(rule.value) : "";
      if (rule.operator === "is_set") {
        clauses.push({ [fieldKey]: { not: null } });
        return;
      }
      if (rule.operator === "is_not_set") {
        clauses.push({ OR: [{ [fieldKey]: null }, { [fieldKey]: "" }] });
        return;
      }
      if (!value) return;
      if (rule.operator === "equals") {
        clauses.push({ [fieldKey]: value });
        return;
      }
      if (rule.operator === "not_equals") {
        clauses.push({ [fieldKey]: { not: value } });
        return;
      }
      if (rule.operator === "contains") {
        clauses.push({ [fieldKey]: { contains: value, mode: "insensitive" } });
        return;
      }
      return;
    }

    const fieldType = fieldMap.get(fieldKey);
    if (!fieldType) return;
    const valueList = Array.isArray(rule.value)
      ? rule.value.map((entry) => String(entry))
      : rule.value !== undefined
        ? [String(rule.value)]
        : [];

    if (rule.operator === "is_set") {
      clauses.push({
        [clauseKey]: {
          some: {
            field: { fieldKey }
          }
        }
      });
      return;
    }

    if (rule.operator === "is_not_set") {
      clauses.push({
        [clauseKey]: {
          none: {
            field: { fieldKey }
          }
        }
      });
      return;
    }

    if (valueList.length === 0) return;
    const value = valueList[0];
    const valueFilter: ValueWhereInput = {
      field: { fieldKey }
    };

    if (isBooleanField(fieldType)) {
      const boolValue = value === "true" || value === "1";
      if (rule.operator === "not_equals") {
        valueFilter.valueBoolean = { not: boolValue };
      } else {
        valueFilter.valueBoolean = boolValue;
      }
    } else if (isNumberField(fieldType)) {
      const numericValue = Number(value);
      if (!numberValidator(numericValue)) {
        return;
      }
      if (rule.operator === "not_equals") {
        valueFilter.valueNumber = { not: numericValue };
      } else {
        valueFilter.valueNumber = numericValue;
      }
    } else {
      if (rule.operator === "contains") {
        valueFilter.valueString = { contains: value, mode: "insensitive" };
      } else if (rule.operator === "not_equals") {
        valueFilter.valueString = { not: value };
      } else if (rule.operator === "contains_any") {
        valueFilter.valueString = { in: valueList };
      } else {
        valueFilter.valueString = value;
      }
    }

    clauses.push({
      [clauseKey]: {
        some: valueFilter
      }
    });
  });

  if (clauses.length === 0) {
    return null;
  }

  if (logic === "OR") {
    return { OR: clauses };
  }

  return { AND: clauses };
};
