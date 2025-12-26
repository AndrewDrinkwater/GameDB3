const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const testWorldNamePrefixes = ["Test World "];
const testCampaignNames = ["Viewer Campaign", "GM Campaign"];
const testCampaignPrefix = "Test Campaign ";
const testCharacterPrefix = "Test Character ";
const testViewerCharacterPrefix = "Viewer Character ";
const testEntityTypeNames = [
  "Test Entity Type",
  "Admin Type",
  "Architect Type",
  "Architect Type Second",
  "Viewer Type"
];
const testEntityNames = ["Goblin Scout", "Forest Sprite"];
const testEntityDescriptions = ["Test entry one", "Goblin ally"];
const testFieldKeys = ["test_field", "choice_field", "viewer_field"];
const testFieldLabels = ["Test Field", "Choice Field", "Viewer Field"];

const buildStartsWithOr = (field, prefixes) =>
  prefixes.map((prefix) => ({ [field]: { startsWith: prefix } }));

const main = async () => {
  const testWorlds = await prisma.world.findMany({
    where: {
      OR: [
        ...buildStartsWithOr("name", testWorldNamePrefixes),
        { name: "Test World" },
        { description: "Test world" }
      ]
    },
    select: { id: true, name: true }
  });
  const testWorldIds = testWorlds.map((world) => world.id);

  const testCampaigns = await prisma.campaign.findMany({
    where: {
      OR: [
        { name: { startsWith: testCampaignPrefix } },
        { name: { in: testCampaignNames } },
        ...(testWorldIds.length > 0 ? [{ worldId: { in: testWorldIds } }] : [])
      ]
    },
    select: { id: true, name: true }
  });
  const testCampaignIds = testCampaigns.map((campaign) => campaign.id);

  const testCharacters = await prisma.character.findMany({
    where: {
      OR: [
        { name: { startsWith: testCharacterPrefix } },
        { name: { startsWith: testViewerCharacterPrefix } },
        ...(testWorldIds.length > 0 ? [{ worldId: { in: testWorldIds } }] : [])
      ]
    },
    select: { id: true, name: true }
  });
  const testCharacterIds = testCharacters.map((character) => character.id);

  const testEntityTypes = await prisma.entityType.findMany({
    where: {
      OR: [
        { name: { in: testEntityTypeNames } },
        ...(testWorldIds.length > 0 ? [{ worldId: { in: testWorldIds } }] : [])
      ]
    },
    select: { id: true, name: true }
  });
  const testEntityTypeIds = testEntityTypes.map((type) => type.id);

  const testEntities = await prisma.entity.findMany({
    where: {
      OR: [
        { name: { in: testEntityNames } },
        { description: { in: testEntityDescriptions } },
        ...(testWorldIds.length > 0 ? [{ worldId: { in: testWorldIds } }] : []),
        ...(testEntityTypeIds.length > 0 ? [{ entityTypeId: { in: testEntityTypeIds } }] : [])
      ]
    },
    select: { id: true, name: true }
  });
  const testEntityIds = testEntities.map((entity) => entity.id);

  const testFields = await prisma.entityField.findMany({
    where: {
      OR: [
        { fieldKey: { in: testFieldKeys } },
        { label: { in: testFieldLabels } },
        ...(testEntityTypeIds.length > 0 ? [{ entityTypeId: { in: testEntityTypeIds } }] : [])
      ]
    },
    select: { id: true }
  });
  const testFieldIds = testFields.map((field) => field.id);

  const logSummary = (label, items) => {
    console.log(`${label}: ${items.length}`);
  };

  logSummary("Worlds", testWorlds);
  logSummary("Campaigns", testCampaigns);
  logSummary("Characters", testCharacters);
  logSummary("Entity Types", testEntityTypes);
  logSummary("Entities", testEntities);
  logSummary("Entity Fields", testFields);

  if (testEntityIds.length > 0) {
    await prisma.entityAccess.deleteMany({ where: { entityId: { in: testEntityIds } } });
    await prisma.entityFieldValue.deleteMany({ where: { entityId: { in: testEntityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: testEntityIds } } });
  }

  if (testFieldIds.length > 0) {
    await prisma.entityFieldChoice.deleteMany({ where: { entityFieldId: { in: testFieldIds } } });
    await prisma.entityFieldValue.deleteMany({ where: { fieldId: { in: testFieldIds } } });
    await prisma.entityField.deleteMany({ where: { id: { in: testFieldIds } } });
  }

  if (testEntityTypeIds.length > 0) {
    await prisma.userListViewPreference.deleteMany({
      where: { entityTypeId: { in: testEntityTypeIds } }
    });
    await prisma.entityTypeListViewDefault.deleteMany({
      where: { entityTypeId: { in: testEntityTypeIds } }
    });
    await prisma.entityFormSection.deleteMany({ where: { entityTypeId: { in: testEntityTypeIds } } });
    await prisma.entityType.deleteMany({ where: { id: { in: testEntityTypeIds } } });
  }

  if (testCampaignIds.length > 0) {
    await prisma.characterCampaign.deleteMany({ where: { campaignId: { in: testCampaignIds } } });
    await prisma.campaignCharacterCreator.deleteMany({
      where: { campaignId: { in: testCampaignIds } }
    });
    await prisma.campaignDelegate.deleteMany({ where: { campaignId: { in: testCampaignIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: testCampaignIds } } });
  }

  if (testCharacterIds.length > 0) {
    await prisma.characterCampaign.deleteMany({ where: { characterId: { in: testCharacterIds } } });
    await prisma.character.deleteMany({ where: { id: { in: testCharacterIds } } });
  }

  if (testWorldIds.length > 0) {
    await prisma.worldDelegate.deleteMany({ where: { worldId: { in: testWorldIds } } });
    await prisma.worldArchitect.deleteMany({ where: { worldId: { in: testWorldIds } } });
    await prisma.worldGameMaster.deleteMany({ where: { worldId: { in: testWorldIds } } });
    await prisma.worldCampaignCreator.deleteMany({ where: { worldId: { in: testWorldIds } } });
    await prisma.worldCharacterCreator.deleteMany({ where: { worldId: { in: testWorldIds } } });
    await prisma.world.deleteMany({ where: { id: { in: testWorldIds } } });
  }

  console.log("Cleanup complete.");
};

main()
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
