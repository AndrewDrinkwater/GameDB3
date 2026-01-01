import { EntityFieldType, LocationFieldType } from "@prisma/client";
import {
  validateEntityInput,
  validateLocationInput
} from "../src/services/validationService";

describe("validationService", () => {
  it("flags invalid choice values for entities", () => {
    const fields = [
      {
        fieldKey: "color",
        fieldType: EntityFieldType.CHOICE,
        choiceList: {
          options: [
            { value: "red", isActive: true },
            { value: "blue", isActive: false }
          ]
        }
      }
    ];

    const result = validateEntityInput({
      fields,
      fieldValues: { color: "green" },
      mode: "create"
    });

    expect(result.invalidChoices).toEqual(["color"]);
    expect(result.invalidNumbers).toEqual([]);
  });

  it("flags invalid numbers for entities", () => {
    const fields = [
      {
        fieldKey: "quantity",
        fieldType: EntityFieldType.NUMBER
      }
    ];

    const result = validateEntityInput({
      fields,
      fieldValues: { quantity: "abc" },
      mode: "create"
    });

    expect(result.invalidChoices).toEqual([]);
    expect(result.invalidNumbers).toEqual(["quantity"]);
  });

  it("flags invalid numbers for locations when infinity is provided", () => {
    const fields = [
      {
        fieldKey: "size",
        fieldType: LocationFieldType.NUMBER
      }
    ];

    const result = validateLocationInput({
      fields,
      fieldValues: { size: Infinity },
      mode: "create"
    });

    expect(result.invalidChoices).toEqual([]);
    expect(result.invalidNumbers).toEqual(["size"]);
  });

  it("allows valid location payloads", () => {
    const fields = [
      {
        fieldKey: "material",
        fieldType: LocationFieldType.CHOICE,
        choiceList: {
          options: [{ value: "stone", isActive: true }]
        }
      },
      {
        fieldKey: "depth",
        fieldType: LocationFieldType.NUMBER
      }
    ];

    const result = validateLocationInput({
      fields,
      fieldValues: { material: "stone", depth: 3 },
      mode: "update"
    });

    expect(result.invalidChoices).toEqual([]);
    expect(result.invalidNumbers).toEqual([]);
  });
});
