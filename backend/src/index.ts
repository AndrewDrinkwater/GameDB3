import { app } from "./app";
import { backfillSeededViews } from "./lib/helpers";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

if (process.env.NODE_ENV !== "test") {
  void backfillSeededViews([
    "entity_field_choices.list",
    "entity_field_choices.form",
    "location_types.list",
    "location_types.form",
    "relationship_types.list",
    "relationship_types.form",
    "relationship_type_rules.list",
    "relationship_type_rules.form",
    "admin.packs.list",
    "admin.packs.form",
    "admin.entity_type_templates.list",
    "admin.entity_type_templates.form",
    "admin.entity_type_template_fields.list",
    "admin.entity_type_template_fields.form",
    "admin.location_type_templates.list",
    "admin.location_type_templates.form",
    "admin.location_type_template_fields.list",
    "admin.location_type_template_fields.form",
    "admin.location_type_rule_templates.list",
    "admin.location_type_rule_templates.form",
    "admin.relationship_type_templates.list",
    "admin.relationship_type_templates.form",
    "admin.relationship_type_template_roles.list",
    "admin.relationship_type_template_roles.form"
  ]);
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

export { app };
