UPDATE "SystemViewField" AS f
SET "fieldType" = 'REFERENCE',
    "referenceEntityKey" = 'users',
    "label" = 'User'
FROM "SystemView" AS v
WHERE v."id" = f."viewId"
  AND v."key" IN ('admin.user_preferences.list', 'admin.user_preferences.form')
  AND f."fieldKey" = 'userId';
