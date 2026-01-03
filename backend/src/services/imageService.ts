import { Prisma } from "@prisma/client";
import prisma from "../lib/prismaClient";
import { buildPublicUrl } from "../lib/imageStorage";

type RecordImagePayload = Prisma.RecordImageGetPayload<{
  include: { imageAsset: { include: { variants: true } } };
}>;

const sortRecordImages = (images: RecordImagePayload[]) =>
  [...images].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

const serializeRecordImages = (images: RecordImagePayload[]) =>
  sortRecordImages(images).map((recordImage) => {
    const asset = recordImage.imageAsset;
    return {
      id: recordImage.id,
      imageAssetId: recordImage.imageAssetId,
      isPrimary: recordImage.isPrimary,
      sortOrder: recordImage.sortOrder,
      caption: recordImage.caption,
      focalX: recordImage.focalX,
      focalY: recordImage.focalY,
      zoom: recordImage.zoom,
      asset: {
        id: asset.id,
        contentType: asset.contentType,
        width: asset.width,
        height: asset.height,
        originalFileName: asset.originalFileName,
        variants: asset.variants
          .slice()
          .sort((a, b) => a.variant.localeCompare(b.variant))
          .map((variant) => ({
            id: variant.id,
            variant: variant.variant,
            width: variant.width,
            height: variant.height,
            contentType: variant.contentType,
            sizeBytes: variant.sizeBytes,
            url: buildPublicUrl(variant.key)
          }))
      }
    };
  });

const getRecordImagesForEntity = async (entityId: string) => {
  const recordImages = await prisma.recordImage.findMany({
    where: { entityId },
    include: { imageAsset: { include: { variants: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  return serializeRecordImages(recordImages);
};

const getRecordImagesForLocation = async (locationId: string) => {
  const recordImages = await prisma.recordImage.findMany({
    where: { locationId },
    include: { imageAsset: { include: { variants: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  return serializeRecordImages(recordImages);
};

const normalizeRecordImageOrder = async (
  filter: { entityId: string } | { locationId: string }
) => {
  const recordImages = await prisma.recordImage.findMany({
    where: filter,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  const updates: Prisma.PrismaPromise<unknown>[] = [];
  recordImages.forEach((recordImage, index) => {
    if (recordImage.sortOrder !== index) {
      updates.push(
        prisma.recordImage.update({
          where: { id: recordImage.id },
          data: { sortOrder: index }
        })
      );
    }
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
};

export {
  getRecordImagesForEntity,
  getRecordImagesForLocation,
  normalizeRecordImageOrder,
  serializeRecordImages
};
