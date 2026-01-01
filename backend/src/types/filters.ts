export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "contains_any"
  | "is_set"
  | "is_not_set";

export type FilterRule = {
  fieldKey?: string;
  operator?: FilterOperator;
  value?: unknown;
};

export type FilterLogic = "AND" | "OR";

export type FilterRequest = {
  rules: FilterRule[];
  logic?: FilterLogic;
  search?: string;
  sort?: {
    key: string;
    direction: "asc" | "desc";
  };
};
