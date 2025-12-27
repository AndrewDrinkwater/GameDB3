import bcrypt from "bcryptjs";
import {
  PrismaClient,
  RelatedListFieldSource,
  Role,
  SystemDictionary,
  SystemFieldType,
  SystemViewType
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("Admin123!", 10);
  const userPassword = await bcrypt.hash("User123!", 10);

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      name: "Admin User",
      role: Role.ADMIN,
      passwordHash: adminPassword
    },
    create: {
      email: "admin@example.com",
      name: "Admin User",
      role: Role.ADMIN,
      passwordHash: adminPassword
    }
  });

  await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {
      name: "Standard User",
      role: Role.USER,
      passwordHash: userPassword
    },
    create: {
      email: "user@example.com",
      name: "Standard User",
      role: Role.USER,
      passwordHash: userPassword
    }
  });

  const sysAdminRole = await prisma.systemRole.upsert({
    where: { key: "sys_admin" },
    update: {
      name: "System Administrator"
    },
    create: {
      key: "sys_admin",
      name: "System Administrator",
      description: "Full access to system configuration data."
    }
  });

  const manageControl = await prisma.systemControl.upsert({
    where: { key: "system.manage" },
    update: {
      description: "Manage system configuration data."
    },
    create: {
      key: "system.manage",
      description: "Manage system configuration data."
    }
  });

  await prisma.systemRoleControl.upsert({
    where: {
      roleId_controlId: {
        roleId: sysAdminRole.id,
        controlId: manageControl.id
      }
    },
    update: {},
    create: {
      roleId: sysAdminRole.id,
      controlId: manageControl.id
    }
  });

  const adminUser = await prisma.user.findUnique({
    where: { email: "admin@example.com" }
  });

  if (adminUser) {
    await prisma.systemUserRole.upsert({
      where: {
        userId_roleId: {
          userId: adminUser.id,
          roleId: sysAdminRole.id
        }
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: sysAdminRole.id
      }
    });
  }

  await prisma.systemUserPreferenceDefault.upsert({
    where: { key: "homepage" },
    update: {
      valueType: "STRING",
      value: "/home",
      description: "Default homepage route for users."
    },
    create: {
      key: "homepage",
      valueType: "STRING",
      value: "/home",
      description: "Default homepage route for users."
    }
  });

  await prisma.systemUserPreferenceDefault.upsert({
    where: { key: "theme" },
    update: {
      valueType: "STRING",
      value: "light",
      description: "Default theme preference."
    },
    create: {
      key: "theme",
      valueType: "STRING",
      value: "light",
      description: "Default theme preference."
    }
  });

  await prisma.systemUserPreferenceDefault.upsert({
    where: { key: "sidebarPinned" },
    update: {
      valueType: "BOOLEAN",
      value: "true",
      description: "Default sidebar pin status."
    },
    create: {
      key: "sidebarPinned",
      valueType: "BOOLEAN",
      value: "true",
      description: "Default sidebar pin status."
    }
  });

  await prisma.systemProperty.upsert({
    where: { key: "auth.access_token_ttl_minutes" },
    update: {
      valueType: "INTEGER",
      value: "30",
      description: "Access token lifetime in minutes."
    },
    create: {
      key: "auth.access_token_ttl_minutes",
      valueType: "INTEGER",
      value: "30",
      description: "Access token lifetime in minutes."
    }
  });

  await prisma.systemProperty.upsert({
    where: { key: "auth.refresh_token_ttl_days" },
    update: {
      valueType: "INTEGER",
      value: "30",
      description: "Refresh token lifetime in days."
    },
    create: {
      key: "auth.refresh_token_ttl_days",
      valueType: "INTEGER",
      value: "30",
      description: "Refresh token lifetime in days."
    }
  });

  const choiceData = [
    { listKey: "dm_label", value: "dungeon_master", label: "Dungeon Master", sortOrder: 1 },
    { listKey: "dm_label", value: "game_master", label: "Game Master", sortOrder: 2 },
    { listKey: "world_theme", value: "reality", label: "Reality", sortOrder: 1 },
    { listKey: "world_theme", value: "fantasy", label: "Fantasy", sortOrder: 2 },
    { listKey: "world_theme", value: "sci_fi", label: "Sci-Fi", sortOrder: 3 },
    { listKey: "character_status", value: "alive", label: "Alive", sortOrder: 1 },
    { listKey: "character_status", value: "dead", label: "Dead", sortOrder: 2 },
    { listKey: "user_role", value: "ADMIN", label: "Admin", sortOrder: 1 },
    { listKey: "user_role", value: "USER", label: "User", sortOrder: 2 },
    { listKey: "world_entity_permission", value: "ARCHITECT", label: "Architects only", sortOrder: 1 },
    { listKey: "world_entity_permission", value: "ARCHITECT_GM", label: "Architects and GMs", sortOrder: 2 },
    { listKey: "world_entity_permission", value: "ARCHITECT_GM_PLAYER", label: "Architects, GMs, and Players", sortOrder: 3 },
    { listKey: "location_status", value: "ACTIVE", label: "Active", sortOrder: 1 },
    { listKey: "location_status", value: "INACTIVE", label: "Inactive", sortOrder: 2 },
    { listKey: "entity_field_type", value: "TEXT", label: "Single line text", sortOrder: 1 },
    { listKey: "entity_field_type", value: "TEXTAREA", label: "Multi line text", sortOrder: 2 },
    { listKey: "entity_field_type", value: "BOOLEAN", label: "Boolean", sortOrder: 3 },
    { listKey: "entity_field_type", value: "CHOICE", label: "Choice", sortOrder: 4 },
    { listKey: "entity_field_type", value: "ENTITY_REFERENCE", label: "Reference (Entity)", sortOrder: 5 },
    { listKey: "entity_field_type", value: "LOCATION_REFERENCE", label: "Reference (Location)", sortOrder: 6 },
    { listKey: "location_field_type", value: "TEXT", label: "Single line text", sortOrder: 1 },
    { listKey: "location_field_type", value: "TEXTAREA", label: "Multi line text", sortOrder: 2 },
    { listKey: "location_field_type", value: "NUMBER", label: "Number", sortOrder: 3 },
    { listKey: "location_field_type", value: "BOOLEAN", label: "Boolean", sortOrder: 4 },
    { listKey: "location_field_type", value: "CHOICE", label: "Choice", sortOrder: 5 },
    { listKey: "location_field_type", value: "ENTITY_REFERENCE", label: "Reference (Entity)", sortOrder: 6 },
    { listKey: "location_field_type", value: "LOCATION_REFERENCE", label: "Reference (Location)", sortOrder: 7 }
  ];

  for (const choice of choiceData) {
    await prisma.systemChoice.upsert({
      where: { listKey_value: { listKey: choice.listKey, value: choice.value } },
      update: {
        label: choice.label,
        sortOrder: choice.sortOrder,
        isActive: true
      },
      create: {
        listKey: choice.listKey,
        value: choice.value,
        label: choice.label,
        sortOrder: choice.sortOrder,
        isActive: true
      }
    });
  }

  type ViewFieldSeed = {
    fieldKey: string;
    label: string;
    fieldType: SystemFieldType;
    listOrder: number;
    formOrder: number;
    required?: boolean;
    optionsListKey?: string;
    referenceEntityKey?: string;
    referenceScope?: string;
    allowMultiple?: boolean;
    readOnly?: boolean;
    listVisible?: boolean;
    formVisible?: boolean;
  };

  type ViewSeed = {
    key: string;
    title: string;
    entityKey: string;
    viewType: SystemViewType;
    endpoint: string;
    adminOnly: boolean;
    fields: ViewFieldSeed[];
  };

  const dictionaryData: Array<Omit<SystemDictionary, "id" | "createdAt" | "updatedAt">> = [
    { entityKey: "worlds", fieldKey: "name", label: "World Name", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "campaigns", fieldKey: "name", label: "Campaign Name", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "characters", fieldKey: "name", label: "Character Name", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "entities", fieldKey: "name", label: "Entity Name", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "locations", fieldKey: "name", label: "Location Name", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "location_types", fieldKey: "name", label: "Location Type Name", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "entity_types", fieldKey: "name", label: "Entity Type Name", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "entity_fields", fieldKey: "label", label: "Field Label", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "location_type_fields", fieldKey: "fieldLabel", label: "Field Label", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "location_type_field_choices", fieldKey: "label", label: "Field Choice Label", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "users", fieldKey: "name", label: "User Name", fieldType: SystemFieldType.TEXT, referenceEntityKey: null, isLabel: true },
    { entityKey: "users", fieldKey: "email", label: "Email", fieldType: SystemFieldType.EMAIL, referenceEntityKey: null, isLabel: false }
  ];

  for (const entry of dictionaryData) {
    await prisma.systemDictionary.upsert({
      where: { entityKey_fieldKey: { entityKey: entry.entityKey, fieldKey: entry.fieldKey } },
      update: {
        label: entry.label,
        fieldType: entry.fieldType,
        referenceEntityKey: entry.referenceEntityKey ?? null,
        isLabel: entry.isLabel ?? false
      },
      create: entry
    });
  }

  const viewData: ViewSeed[] = [
  {
    key: "worlds.list",
    title: "Worlds",
    entityKey: "worlds",
    viewType: SystemViewType.LIST,
    endpoint: "/api/worlds",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "dmLabelKey", label: "DM Label", fieldType: SystemFieldType.SELECT, listOrder: 2, formOrder: 3, optionsListKey: "dm_label" },
      { fieldKey: "themeKey", label: "Theme", fieldType: SystemFieldType.SELECT, listOrder: 3, formOrder: 4, optionsListKey: "world_theme" },
      { fieldKey: "entityPermissionScope", label: "Entity Permissions", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 5, optionsListKey: "world_entity_permission" },
      {
        fieldKey: "characterCreatorIds",
        label: "Character Creators",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 6,
        formOrder: 6,
        referenceEntityKey: "users",
        allowMultiple: true,
        listVisible: false,
        formVisible: false
      }
    ]
  },
  {
    key: "worlds.form",
    title: "World",
    entityKey: "worlds",
    viewType: SystemViewType.FORM,
    endpoint: "/api/worlds",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 4, formOrder: 2 },
      { fieldKey: "dmLabelKey", label: "DM Label", fieldType: SystemFieldType.SELECT, listOrder: 2, formOrder: 3, optionsListKey: "dm_label" },
      { fieldKey: "themeKey", label: "Theme", fieldType: SystemFieldType.SELECT, listOrder: 3, formOrder: 4, optionsListKey: "world_theme" },
      { fieldKey: "entityPermissionScope", label: "Entity Permissions", fieldType: SystemFieldType.SELECT, listOrder: 5, formOrder: 5, optionsListKey: "world_entity_permission" },
      {
        fieldKey: "characterCreatorIds",
        label: "Character Creators",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 6,
        formOrder: 6,
        referenceEntityKey: "users",
        allowMultiple: true,
        listVisible: false,
        formVisible: false
      }
    ]
  },
  {
    key: "campaigns.list",
    title: "Campaigns",
    entityKey: "campaigns",
    viewType: SystemViewType.LIST,
    endpoint: "/api/campaigns",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "worlds", referenceScope: "campaign_create" },
      { fieldKey: "gmUserId", label: "GM", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "users", referenceScope: "world_gm" }
    ]
  },
  {
    key: "campaigns.form",
    title: "Campaign",
    entityKey: "campaigns",
    viewType: SystemViewType.FORM,
    endpoint: "/api/campaigns",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "worlds", referenceScope: "campaign_create" },
      { fieldKey: "gmUserId", label: "GM", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "users", referenceScope: "world_gm" },
      {
        fieldKey: "characterIds",
        label: "Characters",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 5,
        formOrder: 5,
        referenceEntityKey: "characters",
        allowMultiple: true,
        listVisible: false,
        formVisible: false
      },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 4, formOrder: 4 }
    ]
  },
  {
    key: "characters.list",
    title: "Characters",
    entityKey: "characters",
    viewType: SystemViewType.LIST,
    endpoint: "/api/characters",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "worlds", referenceScope: "character_create" },
      { fieldKey: "playerId", label: "Owner", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "users" },
      { fieldKey: "statusKey", label: "Status", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "character_status" }
    ]
  },
  {
    key: "characters.form",
    title: "Character",
    entityKey: "characters",
    viewType: SystemViewType.FORM,
    endpoint: "/api/characters",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "worlds", referenceScope: "character_create" },
      { fieldKey: "playerId", label: "Owner", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "users" },
      { fieldKey: "statusKey", label: "Status", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "character_status" },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 5, formOrder: 5 }
    ]
  },
  {
    key: "entity_types.list",
    title: "Entity Types",
    entityKey: "entity_types",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entity-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "worlds" },
      { fieldKey: "isTemplate", label: "Template", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 }
    ]
  },
  {
    key: "entity_types.form",
    title: "Entity Type",
    entityKey: "entity_types",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entity-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "worlds" },
      { fieldKey: "isTemplate", label: "Template", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 },
      { fieldKey: "sourceTypeId", label: "Copy From", fieldType: SystemFieldType.REFERENCE, listOrder: 4, formOrder: 4, referenceEntityKey: "entity_types", referenceScope: "entity_type_source" },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 5, formOrder: 5 }
    ]
  },
  {
    key: "entity_fields.list",
    title: "Entity Fields",
    entityKey: "entity_fields",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entity-fields",
    adminOnly: false,
    fields: [
      { fieldKey: "entityTypeId", label: "Entity Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "entity_types", referenceScope: "entity_type" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "fieldType", label: "Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "entity_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 }
    ]
  },
  {
    key: "entity_fields.form",
    title: "Entity Field",
    entityKey: "entity_fields",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entity-fields",
    adminOnly: false,
    fields: [
      { fieldKey: "entityTypeId", label: "Entity Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "entity_types", referenceScope: "entity_type" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "fieldType", label: "Field Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, required: true, optionsListKey: "entity_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
      { fieldKey: "listOrder", label: "List Order", fieldType: SystemFieldType.NUMBER, listOrder: 6, formOrder: 6 },
      { fieldKey: "formOrder", label: "Form Order", fieldType: SystemFieldType.NUMBER, listOrder: 7, formOrder: 7 },
      { fieldKey: "referenceEntityTypeId", label: "Reference Entity Type", fieldType: SystemFieldType.REFERENCE, listOrder: 8, formOrder: 8, referenceEntityKey: "entity_types" },
      { fieldKey: "referenceLocationTypeKey", label: "Reference Location Type", fieldType: SystemFieldType.REFERENCE, listOrder: 9, formOrder: 9, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "conditions", label: "Visibility Conditions", fieldType: SystemFieldType.TEXTAREA, listOrder: 10, formOrder: 10 }
    ]
  },
  {
    key: "entity_field_choices.list",
    title: "Entity Field Choices",
    entityKey: "entity_field_choices",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entity-field-choices",
    adminOnly: false,
    fields: [
      { fieldKey: "entityFieldId", label: "Field", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "entity_fields" },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "sortOrder", label: "Sort", fieldType: SystemFieldType.NUMBER, listOrder: 4, formOrder: 4 }
    ]
  },
  {
    key: "entity_field_choices.form",
    title: "Entity Field Choice",
    entityKey: "entity_field_choices",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entity-field-choices",
    adminOnly: false,
    fields: [
      { fieldKey: "entityFieldId", label: "Field", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "entity_fields" },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "sortOrder", label: "Sort", fieldType: SystemFieldType.NUMBER, listOrder: 4, formOrder: 4 }
    ]
  },
  {
    key: "entities.list",
    title: "Entities",
    entityKey: "entities",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entities",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "entityTypeId", label: "Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "entity_types" },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "worlds" },
      { fieldKey: "currentLocationId", label: "Location", fieldType: SystemFieldType.REFERENCE, listOrder: 4, formOrder: 4, referenceEntityKey: "locations", referenceScope: "location_reference" }
    ]
  },
  {
    key: "entities.form",
    title: "Entity",
    entityKey: "entities",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entities",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "worlds" },
      { fieldKey: "entityTypeId", label: "Type", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, required: true, referenceEntityKey: "entity_types", referenceScope: "entity_type" },
      { fieldKey: "currentLocationId", label: "Location", fieldType: SystemFieldType.REFERENCE, listOrder: 4, formOrder: 4, required: true, referenceEntityKey: "locations", referenceScope: "location_reference" },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 5, formOrder: 5 }
    ]
  },
  {
    key: "location_types.list",
    title: "Location Types",
    entityKey: "location_types",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "worlds" },
      { fieldKey: "icon", label: "Icon", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "menu", label: "Menu", fieldType: SystemFieldType.BOOLEAN, listOrder: 4, formOrder: 4 }
    ]
  },
  {
    key: "location_types.form",
    title: "Location Type",
    entityKey: "location_types",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "worlds" },
      { fieldKey: "icon", label: "Icon", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "colour", label: "Colour", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4 },
      { fieldKey: "menu", label: "Menu", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 6, formOrder: 6 }
    ]
  },
  {
    key: "location_type_fields.list",
    title: "Location Type Fields",
    entityKey: "location_type_fields",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-type-fields",
    adminOnly: false,
    fields: [
      { fieldKey: "locationTypeId", label: "Location Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "fieldLabel", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "fieldType", label: "Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "location_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 }
    ]
  },
  {
    key: "location_type_fields.form",
    title: "Location Type Field",
    entityKey: "location_type_fields",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-type-fields",
    adminOnly: false,
    fields: [
      { fieldKey: "locationTypeId", label: "Location Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "fieldLabel", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "fieldType", label: "Field Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, required: true, optionsListKey: "location_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
      { fieldKey: "listOrder", label: "List Order", fieldType: SystemFieldType.NUMBER, listOrder: 6, formOrder: 6 },
      { fieldKey: "formOrder", label: "Form Order", fieldType: SystemFieldType.NUMBER, listOrder: 7, formOrder: 7 },
      { fieldKey: "defaultValue", label: "Default Value", fieldType: SystemFieldType.TEXTAREA, listOrder: 8, formOrder: 8 },
      { fieldKey: "validationRules", label: "Validation Rules", fieldType: SystemFieldType.TEXTAREA, listOrder: 9, formOrder: 9 }
    ]
  },
  {
    key: "location_type_field_choices.list",
    title: "Location Field Choices",
    entityKey: "location_type_field_choices",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-type-field-choices",
    adminOnly: false,
    fields: [
      { fieldKey: "locationTypeFieldId", label: "Field", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "location_type_fields" },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "sortOrder", label: "Sort", fieldType: SystemFieldType.NUMBER, listOrder: 4, formOrder: 4 }
    ]
  },
  {
    key: "location_type_field_choices.form",
    title: "Location Field Choice",
    entityKey: "location_type_field_choices",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-type-field-choices",
    adminOnly: false,
    fields: [
      { fieldKey: "locationTypeFieldId", label: "Field", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "location_type_fields" },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "sortOrder", label: "Sort", fieldType: SystemFieldType.NUMBER, listOrder: 4, formOrder: 4 }
    ]
  },
  {
    key: "location_type_rules.list",
    title: "Location Type Rules",
    entityKey: "location_type_rules",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-type-rules",
    adminOnly: false,
    fields: [
      { fieldKey: "parentTypeId", label: "Parent Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "childTypeId", label: "Child Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "allowed", label: "Allowed", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 }
    ]
  },
  {
    key: "location_type_rules.form",
    title: "Location Type Rule",
    entityKey: "location_type_rules",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-type-rules",
    adminOnly: false,
    fields: [
      { fieldKey: "parentTypeId", label: "Parent Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "childTypeId", label: "Child Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "allowed", label: "Allowed", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 }
    ]
  },
  {
    key: "locations.list",
    title: "Locations",
    entityKey: "locations",
    viewType: SystemViewType.LIST,
    endpoint: "/api/locations",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "locationTypeId", label: "Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "worlds" },
      { fieldKey: "status", label: "Status", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "location_status" }
    ]
  },
  {
    key: "locations.form",
    title: "Location",
    entityKey: "locations",
    viewType: SystemViewType.FORM,
    endpoint: "/api/locations",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "worlds" },
      { fieldKey: "locationTypeId", label: "Type", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, required: true, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "parentLocationId", label: "Parent Location", fieldType: SystemFieldType.REFERENCE, listOrder: 4, formOrder: 4, referenceEntityKey: "locations", referenceScope: "location_parent" },
      { fieldKey: "status", label: "Status", fieldType: SystemFieldType.SELECT, listOrder: 5, formOrder: 5, optionsListKey: "location_status" },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 6, formOrder: 6 }
    ]
  },
  {
    key: "admin.system_choices.list",
    title: "System Choices",
    entityKey: "system_choices",
    viewType: SystemViewType.LIST,
    endpoint: "/api/system/choices",
    adminOnly: true,
    fields: [
      { fieldKey: "listKey", label: "List", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "sortOrder", label: "Sort", fieldType: SystemFieldType.NUMBER, listOrder: 4, formOrder: 4 },
      { fieldKey: "isActive", label: "Active", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 }
    ]
  },
  {
    key: "admin.system_choices.form",
    title: "System Choice",
    entityKey: "system_choices",
    viewType: SystemViewType.FORM,
    endpoint: "/api/system/choices",
    adminOnly: true,
    fields: [
      { fieldKey: "listKey", label: "List", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "sortOrder", label: "Sort", fieldType: SystemFieldType.NUMBER, listOrder: 4, formOrder: 4 },
      { fieldKey: "isActive", label: "Active", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 }
    ]
  },
  {
    key: "admin.system_properties.list",
    title: "System Properties",
    entityKey: "system_properties",
    viewType: SystemViewType.LIST,
    endpoint: "/api/system/properties",
    adminOnly: true,
    fields: [
      { fieldKey: "key", label: "Key", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "valueType", label: "Type", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 }
    ]
  },
  {
    key: "admin.system_properties.form",
    title: "System Property",
    entityKey: "system_properties",
    viewType: SystemViewType.FORM,
    endpoint: "/api/system/properties",
    adminOnly: true,
    fields: [
      { fieldKey: "key", label: "Key", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "valueType", label: "Type", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 4, formOrder: 4 }
    ]
  },
  {
    key: "admin.user_preferences.list",
    title: "User Preferences",
    entityKey: "user_preferences",
    viewType: SystemViewType.LIST,
    endpoint: "/api/system/user-preferences",
    adminOnly: true,
    fields: [
      { fieldKey: "userId", label: "User", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "users" },
      { fieldKey: "key", label: "Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "valueType", label: "Type", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4 }
    ]
  },
  {
    key: "admin.user_preferences.form",
    title: "User Preference",
    entityKey: "user_preferences",
    viewType: SystemViewType.FORM,
    endpoint: "/api/system/user-preferences",
    adminOnly: true,
    fields: [
      { fieldKey: "userId", label: "User", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "users" },
      { fieldKey: "key", label: "Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "valueType", label: "Type", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4, required: true }
    ]
  },
  {
    key: "admin.system_controls.list",
    title: "System Controls",
    entityKey: "system_controls",
    viewType: SystemViewType.LIST,
    endpoint: "/api/system/controls",
    adminOnly: true,
    fields: [
      { fieldKey: "key", label: "Key", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 }
    ]
  },
  {
    key: "admin.system_controls.form",
    title: "System Control",
    entityKey: "system_controls",
    viewType: SystemViewType.FORM,
    endpoint: "/api/system/controls",
    adminOnly: true,
    fields: [
      { fieldKey: "key", label: "Key", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 2, formOrder: 2 }
    ]
  },
  {
    key: "admin.users.list",
    title: "Users",
    entityKey: "users",
    viewType: SystemViewType.LIST,
    endpoint: "/api/system/users",
    adminOnly: true,
    fields: [
      { fieldKey: "email", label: "Email", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "role", label: "Role", fieldType: SystemFieldType.SELECT, listOrder: 3, formOrder: 3, optionsListKey: "user_role" }
    ]
  },
  {
    key: "admin.users.form",
    title: "User",
    entityKey: "users",
    viewType: SystemViewType.FORM,
    endpoint: "/api/system/users",
    adminOnly: true,
    fields: [
      { fieldKey: "email", label: "Email", fieldType: SystemFieldType.EMAIL, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "role", label: "Role", fieldType: SystemFieldType.SELECT, listOrder: 3, formOrder: 3, required: true, optionsListKey: "user_role" },
      { fieldKey: "password", label: "Password", fieldType: SystemFieldType.PASSWORD, listOrder: 4, formOrder: 4 }
    ]
  },
  {
    key: "admin.system_related_lists.list",
    title: "Related Lists",
    entityKey: "system_related_lists",
    viewType: SystemViewType.LIST,
    endpoint: "/api/system/related-lists",
    adminOnly: true,
    fields: [
      { fieldKey: "key", label: "Key", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "title", label: "Title", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "parentEntityKey", label: "Parent Entity", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "relatedEntityKey", label: "Related Entity", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4 },
      { fieldKey: "joinEntityKey", label: "Join Entity", fieldType: SystemFieldType.TEXT, listOrder: 5, formOrder: 5 }
    ]
  },
  {
    key: "admin.system_related_lists.form",
    title: "Related List",
    entityKey: "system_related_lists",
    viewType: SystemViewType.FORM,
    endpoint: "/api/system/related-lists",
    adminOnly: true,
    fields: [
      { fieldKey: "key", label: "Key", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "title", label: "Title", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "parentEntityKey", label: "Parent Entity", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "relatedEntityKey", label: "Related Entity", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4, required: true },
      { fieldKey: "joinEntityKey", label: "Join Entity", fieldType: SystemFieldType.TEXT, listOrder: 5, formOrder: 5, required: true },
      { fieldKey: "parentFieldKey", label: "Parent Field", fieldType: SystemFieldType.TEXT, listOrder: 6, formOrder: 6, required: true },
      { fieldKey: "relatedFieldKey", label: "Related Field", fieldType: SystemFieldType.TEXT, listOrder: 7, formOrder: 7, required: true },
      { fieldKey: "listOrder", label: "Order", fieldType: SystemFieldType.NUMBER, listOrder: 8, formOrder: 8 },
      { fieldKey: "adminOnly", label: "Admin Only", fieldType: SystemFieldType.BOOLEAN, listOrder: 9, formOrder: 9 }
    ]
  },
  {
    key: "admin.system_related_list_fields.list",
    title: "Related List Fields",
    entityKey: "system_related_list_fields",
    viewType: SystemViewType.LIST,
    endpoint: "/api/system/related-list-fields",
    adminOnly: true,
    fields: [
      { fieldKey: "relatedListId", label: "Related List ID", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "fieldKey", label: "Field", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "source", label: "Source", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4 },
      { fieldKey: "listOrder", label: "Order", fieldType: SystemFieldType.NUMBER, listOrder: 5, formOrder: 5 }
    ]
  },
  {
    key: "admin.system_related_list_fields.form",
    title: "Related List Field",
    entityKey: "system_related_list_fields",
    viewType: SystemViewType.FORM,
    endpoint: "/api/system/related-list-fields",
    adminOnly: true,
    fields: [
      { fieldKey: "relatedListId", label: "Related List ID", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "fieldKey", label: "Field", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "source", label: "Source", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4, required: true },
      { fieldKey: "listOrder", label: "Order", fieldType: SystemFieldType.NUMBER, listOrder: 5, formOrder: 5, required: true }
    ]
  }
];

for (const view of viewData) {
  const savedView = await prisma.systemView.upsert({
    where: { key: view.key },
    update: {
      title: view.title,
      entityKey: view.entityKey,
      viewType: view.viewType,
      endpoint: view.endpoint,
      adminOnly: view.adminOnly
    },
    create: {
      key: view.key,
      title: view.title,
      entityKey: view.entityKey,
      viewType: view.viewType,
      endpoint: view.endpoint,
      adminOnly: view.adminOnly
    }
  });

  for (const field of view.fields) {
    await prisma.systemViewField.upsert({
      where: { viewId_fieldKey: { viewId: savedView.id, fieldKey: field.fieldKey } },
      update: {
        label: field.label,
        fieldType: field.fieldType,
        listOrder: field.listOrder,
        formOrder: field.formOrder,
        required: field.required ?? false,
        optionsListKey: field.optionsListKey,
        referenceEntityKey: field.referenceEntityKey ?? null,
        referenceScope: field.referenceScope ?? null,
        allowMultiple: field.allowMultiple ?? false,
        readOnly: field.readOnly ?? false,
        listVisible: field.listVisible ?? true,
        formVisible: field.formVisible ?? true
      },
      create: {
        viewId: savedView.id,
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        listOrder: field.listOrder,
        formOrder: field.formOrder,
        required: field.required ?? false,
        optionsListKey: field.optionsListKey,
        referenceEntityKey: field.referenceEntityKey ?? null,
        referenceScope: field.referenceScope ?? null,
        allowMultiple: field.allowMultiple ?? false,
        readOnly: field.readOnly ?? false,
        listVisible: field.listVisible ?? true,
        formVisible: field.formVisible ?? true
      }
    });
  }
}

  type RelatedListSeed = {
    key: string;
    title: string;
    parentEntityKey: string;
    relatedEntityKey: string;
    joinEntityKey: string;
    parentFieldKey: string;
    relatedFieldKey: string;
    listOrder?: number;
    adminOnly?: boolean;
    fields: Array<{
      fieldKey: string;
      label: string;
      source: RelatedListFieldSource;
      listOrder: number;
    }>;
  };

  const relatedListData: RelatedListSeed[] = [
    {
      key: "campaign.characters",
      title: "Characters",
      parentEntityKey: "campaigns",
      relatedEntityKey: "characters",
      joinEntityKey: "characterCampaign",
      parentFieldKey: "campaignId",
      relatedFieldKey: "characterId",
      listOrder: 1,
      adminOnly: false,
      fields: [
        { fieldKey: "name", label: "Name", source: RelatedListFieldSource.RELATED, listOrder: 1 },
        { fieldKey: "status", label: "Status", source: RelatedListFieldSource.JOIN, listOrder: 2 }
      ]
    },
    {
      key: "world.character_creators",
      title: "Character Creators",
      parentEntityKey: "worlds",
      relatedEntityKey: "users",
      joinEntityKey: "worldCharacterCreator",
      parentFieldKey: "worldId",
      relatedFieldKey: "userId",
      listOrder: 1,
      adminOnly: false,
      fields: [
        { fieldKey: "name", label: "Name", source: RelatedListFieldSource.RELATED, listOrder: 1 },
        { fieldKey: "email", label: "Email", source: RelatedListFieldSource.RELATED, listOrder: 2 }
      ]
    }
    ,
    {
      key: "world.game_masters",
      title: "Game Masters",
      parentEntityKey: "worlds",
      relatedEntityKey: "users",
      joinEntityKey: "worldGameMaster",
      parentFieldKey: "worldId",
      relatedFieldKey: "userId",
      listOrder: 2,
      adminOnly: false,
      fields: [
        { fieldKey: "name", label: "Name", source: RelatedListFieldSource.RELATED, listOrder: 1 },
        { fieldKey: "email", label: "Email", source: RelatedListFieldSource.RELATED, listOrder: 2 }
      ]
    }
  ];

  for (const relatedList of relatedListData) {
    const savedList = await prisma.systemRelatedList.upsert({
      where: { key: relatedList.key },
      update: {
        title: relatedList.title,
        parentEntityKey: relatedList.parentEntityKey,
        relatedEntityKey: relatedList.relatedEntityKey,
        joinEntityKey: relatedList.joinEntityKey,
        parentFieldKey: relatedList.parentFieldKey,
        relatedFieldKey: relatedList.relatedFieldKey,
        listOrder: relatedList.listOrder ?? 0,
        adminOnly: relatedList.adminOnly ?? false
      },
      create: {
        key: relatedList.key,
        title: relatedList.title,
        parentEntityKey: relatedList.parentEntityKey,
        relatedEntityKey: relatedList.relatedEntityKey,
        joinEntityKey: relatedList.joinEntityKey,
        parentFieldKey: relatedList.parentFieldKey,
        relatedFieldKey: relatedList.relatedFieldKey,
        listOrder: relatedList.listOrder ?? 0,
        adminOnly: relatedList.adminOnly ?? false
      }
    });

    for (const field of relatedList.fields) {
      await prisma.systemRelatedListField.upsert({
        where: {
          relatedListId_fieldKey_source: {
            relatedListId: savedList.id,
            fieldKey: field.fieldKey,
            source: field.source
          }
        },
        update: {
          label: field.label,
          listOrder: field.listOrder
        },
        create: {
          relatedListId: savedList.id,
          fieldKey: field.fieldKey,
          label: field.label,
          source: field.source,
          listOrder: field.listOrder
        }
      });
    }
  }

}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
