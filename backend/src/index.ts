import { app } from "./app";
import { backfillSeededViews } from "./lib/helpers";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

if (process.env.NODE_ENV !== "test") {
  void backfillSeededViews([
    "entity_field_choices.list",
    "entity_field_choices.form",
    "location_types.list",
    "location_types.form"
  ]);
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

export { app };
