import { EntityFieldType } from "@prisma/client";
import { buildWhereClause, FieldDefinition } from "../src/services/filterService";
import type { FilterRule } from "../src/types/filters";

describe("filterService", () => {
  it("builds clauses for name + field filters using AND", () => {
    const filters: FilterRule[] = [
      { fieldKey: "name", operator: "contains", value: "Hero" },
      { fieldKey: "status", operator: "equals", value: "active" },
      { fieldKey: "flag", operator: "not_equals", value: "1" }
    ];
    const fieldDefinitions: FieldDefinition[] = [
      { fieldKey: "status", fieldType: EntityFieldType.TEXT },
      { fieldKey: "flag", fieldType: EntityFieldType.BOOLEAN }
    ];

    const clause = buildWhereClause(filters, fieldDefinitions, {
      relation: "values",
      logic: "AND",
      numberValidator: (value) => !Number.isNaN(value)
    });

    expect(clause).toEqual({
      AND: [
        { name: { contains: "Hero", mode: "insensitive" } },
        { values: { some: { field: { fieldKey: "status" }, valueString: "active" } } },
        { values: { some: { field: { fieldKey: "flag" }, valueBoolean: { not: true } } } }
      ]
    });
  });

  it("ignores unknown fields and invalid numbers", () => {
    const filters: FilterRule[] = [
      { fieldKey: "count", operator: "equals", value: "NaN" },
      { fieldKey: "missing", operator: "equals", value: "x" }
    ];
    const fieldDefinitions: FieldDefinition[] = [
      { fieldKey: "count", fieldType: EntityFieldType.NUMBER }
    ];

    const clause = buildWhereClause(filters, fieldDefinitions, {
      relation: "values",
      numberValidator: (value) => Number.isFinite(value)
    });

    expect(clause).toBeNull();
  });

  it("honors OR logic for mixed rules", () => {
    const filters: FilterRule[] = [
      { fieldKey: "name", operator: "equals", value: "First" },
      { fieldKey: "category", operator: "contains_any", value: ["a", "b"] }
    ];
    const fieldDefinitions: FieldDefinition[] = [
      { fieldKey: "category", fieldType: EntityFieldType.TEXT }
    ];

    const clause = buildWhereClause(filters, fieldDefinitions, {
      relation: "values",
      logic: "OR",
      numberValidator: (value) => !Number.isNaN(value)
    });

    expect(clause).toEqual({
      OR: [
        { name: "First" },
        { values: { some: { field: { fieldKey: "category" }, valueString: { in: ["a", "b"] } } } }
      ]
    });
  });
});
