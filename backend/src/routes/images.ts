import express from "express";
import { ImageVariantType, Prisma } from "@prisma/client";
import { createHash } from "crypto";
import sharp from "sharp";
import {
  requireAuth,
  canWriteEntity,
  canWriteLocation,
  isAdmin,
  getSystemPropertyNumber,
  getSystemPropertyString
} from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";
import prisma from "../lib/prismaClient";
import { ServiceError } from "../services/serviceError";
import {
  buildPublicUrl,
  deleteObject,
  generateUploadKey,
  getObjectBuffer,
  getSignedUploadUrl,
  headObject,
  putObjectBuffer
} from "../lib/imageStorage";
import {
  getRecordImagesForEntity,
  getRecordImagesForLocation,
  normalizeRecordImageOrder
} from "../services/imageService";
import { requireWorldAccess } from "../middlewares/permissions";

const defaultMimeTypes = "image/jpeg,image/png,image/webp";

const buildMimeTypeSet = (value: string) =>
  new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean));

const getImageConfig = async () => {
  const allowed = await getSystemPropertyString(
    "images.allowed_mime_types",
    process.env.IMAGE_ALLOWED_MIME_TYPES ?? defaultMimeTypes
  );
  const maxBytes = await getSystemPropertyNumber(
    "images.max_bytes",
    Number(process.env.IMAGE_MAX_BYTES ?? "10485760")
  );
  const uploadExpirySeconds = await getSystemPropertyNumber(
    "images.upload_url_expiry_seconds",
    600
  );
  const thumbPx = await getSystemPropertyNumber("images.variant.thumb_px", 128);
  const smallPx = await getSystemPropertyNumber("images.variant.small_px", 256);
  const mediumPx = await getSystemPropertyNumber("images.variant.medium_px", 512);
  const largePx = await getSystemPropertyNumber("images.variant.large_px", 1024);
  const largeMinPx = await getSystemPropertyNumber("images.variant.large_min_px", 1024);

  return {
    allowedMimeTypes: buildMimeTypeSet(allowed || defaultMimeTypes),
    maxBytes,
    uploadExpirySeconds,
    sizes: {
      thumb: thumbPx,
      small: smallPx,
      medium: mediumPx,
      large: largePx,
      largeMin: largeMinPx
    }
  };
};

const ensureImageType = (contentType: string, allowedMimeTypes: Set<string>) => {
  if (!allowedMimeTypes.has(contentType)) {
    throw new ServiceError(400, "Unsupported image type.");
  }
};

const ensureImageSize = (sizeBytes: number, maxBytes: number) => {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new ServiceError(400, "Image size is invalid.");
  }
  if (sizeBytes > maxBytes) {
    throw new ServiceError(400, "Image exceeds size limit.");
  }
};

const deriveFormat = (contentType: string) => {
  if (contentType === "image/png") return { format: "png", contentType };
  if (contentType === "image/webp") return { format: "webp", contentType };
  return { format: "jpeg", contentType: "image/jpeg" };
};

const buildVariantKey = (worldId: string, hash: string, variant: ImageVariantType) => {
  return `images/${worldId}/${hash}/${variant.toLowerCase()}`;
};

const buildOriginalKey = (worldId: string, hash: string) => {
  return `images/${worldId}/${hash}/original`;
};

const handleError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(fallbackMessage, error);
  res.status(500).json({ error: fallbackMessage });
};

export const registerImageRoutes = (app: express.Express) => {
  app.post(
    "/api/images/init",
    requireAuth,
    requireWorldAccess((req) => (req.body as { worldId?: string }).worldId),
    async (req, res) => {
      const body = req.body as {
        worldId?: string;
        fileName?: string;
        contentType?: string;
        sizeBytes?: number;
      };

      try {
        if (!body.worldId || !body.fileName || !body.contentType || !body.sizeBytes) {
          throw new ServiceError(400, "worldId, fileName, contentType, and sizeBytes are required.");
        }
        const config = await getImageConfig();
        ensureImageType(body.contentType, config.allowedMimeTypes);
        ensureImageSize(body.sizeBytes, config.maxBytes);

        const uploadKey = generateUploadKey(body.worldId, body.fileName);
        const uploadUrl = await getSignedUploadUrl(
          uploadKey,
          body.contentType,
          config.uploadExpirySeconds
        );

        res.json({
          uploadUrl,
          uploadKey,
          expiresInSeconds: 600
        });
      } catch (error) {
        handleError(res, error, "Failed to initialize upload.");
      }
    }
  );

  app.post(
    "/api/images/complete",
    requireAuth,
    requireWorldAccess((req) => (req.body as { worldId?: string }).worldId),
    async (req, res) => {
      const user = (req as AuthRequest).user!;
      const body = req.body as {
        worldId?: string;
        uploadKey?: string;
        fileName?: string;
      };

      try {
        if (!body.worldId || !body.uploadKey) {
          throw new ServiceError(400, "worldId and uploadKey are required.");
        }

        const head = await headObject(body.uploadKey);
        const contentType = head.ContentType ?? "application/octet-stream";
        const sizeBytes = Number(head.ContentLength ?? 0);
        const config = await getImageConfig();
        ensureImageType(contentType, config.allowedMimeTypes);
        ensureImageSize(sizeBytes, config.maxBytes);

        const buffer = await getObjectBuffer(body.uploadKey);
        const contentHash = createHash("sha256").update(buffer).digest("hex");

        const existing = await prisma.imageAsset.findUnique({
          where: {
            worldId_contentHash: {
              worldId: body.worldId,
              contentHash
            }
          },
          include: { variants: true }
        });

        if (existing) {
          await deleteObject(body.uploadKey);
          res.json({
            assetId: existing.id,
            deduped: true,
            variants: existing.variants.map((variant) => ({
              variant: variant.variant,
              url: buildPublicUrl(variant.key)
            }))
          });
          return;
        }

        const metadata = await sharp(buffer).metadata();
        const formatInfo = deriveFormat(contentType);
        const originalKey = buildOriginalKey(body.worldId, contentHash);
        await putObjectBuffer(originalKey, buffer, contentType);

        const variants: {
          variant: ImageVariantType;
          key: string;
          buffer: Buffer;
          contentType: string;
          width: number;
          height: number;
        }[] = [];

        const sizes: Array<{ variant: ImageVariantType; size: number }> = [
          { variant: ImageVariantType.THUMB, size: config.sizes.thumb },
          { variant: ImageVariantType.SMALL, size: config.sizes.small },
          { variant: ImageVariantType.MEDIUM, size: config.sizes.medium }
        ];

        const maxDim = Math.max(metadata.width ?? 0, metadata.height ?? 0);
        if (config.sizes.large > 0 && maxDim > config.sizes.largeMin) {
          sizes.push({ variant: ImageVariantType.LARGE, size: config.sizes.large });
        }

        for (const entry of sizes) {
          const resized = await sharp(buffer)
            .resize({ width: entry.size, height: entry.size, fit: "inside", withoutEnlargement: true })
            .toFormat(formatInfo.format as "jpeg" | "png" | "webp")
            .toBuffer();
          const variantMeta = await sharp(resized).metadata();
          variants.push({
            variant: entry.variant,
            key: buildVariantKey(body.worldId, contentHash, entry.variant),
            buffer: resized,
            contentType: formatInfo.contentType,
            width: variantMeta.width ?? entry.size,
            height: variantMeta.height ?? entry.size
          });
        }

        for (const variant of variants) {
          await putObjectBuffer(variant.key, variant.buffer, variant.contentType);
        }

        let asset;
        try {
          asset = await prisma.imageAsset.create({
            data: {
              worldId: body.worldId,
              createdById: user.id,
              originalFileName: body.fileName ?? null,
              contentType,
              sizeBytes,
              width: metadata.width ?? null,
              height: metadata.height ?? null,
              contentHash,
              originalKey,
              variants: {
                create: variants.map((variant) => ({
                  variant: variant.variant,
                  key: variant.key,
                  contentType: variant.contentType,
                  sizeBytes: variant.buffer.length,
                  width: variant.width,
                  height: variant.height
                }))
              }
            },
            include: { variants: true }
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            const existingAsset = await prisma.imageAsset.findUnique({
              where: {
                worldId_contentHash: {
                  worldId: body.worldId,
                  contentHash
                }
              },
              include: { variants: true }
            });
            if (existingAsset) {
              await deleteObject(body.uploadKey);
              res.json({
                assetId: existingAsset.id,
                deduped: true,
                variants: existingAsset.variants.map((variant) => ({
                  variant: variant.variant,
                  url: buildPublicUrl(variant.key)
                }))
              });
              return;
            }
          }
          throw error;
        }

        await deleteObject(body.uploadKey);

        res.json({
          assetId: asset.id,
          deduped: false,
          variants: asset.variants.map((variant) => ({
            variant: variant.variant,
            url: buildPublicUrl(variant.key)
          }))
        });
      } catch (error) {
        handleError(res, error, "Failed to complete upload.");
      }
    }
  );

  app.post("/api/records/:recordType/:recordId/images", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const { recordType, recordId } = req.params;
    const body = req.body as {
      imageAssetId?: string;
      caption?: string;
      isPrimary?: boolean;
    };

    try {
      if (!body.imageAssetId) {
        throw new ServiceError(400, "imageAssetId is required.");
      }
      const imageAssetId = body.imageAssetId;

      const asset = await prisma.imageAsset.findUnique({
        where: { id: imageAssetId },
        select: { id: true, worldId: true }
      });
      if (!asset) {
        throw new ServiceError(404, "Image asset not found.");
      }

      if (recordType === "entities") {
        const entity = await prisma.entity.findUnique({
          where: { id: recordId },
          select: { id: true, worldId: true }
        });
        if (!entity || entity.worldId !== asset.worldId) {
          throw new ServiceError(404, "Entity not found.");
        }
        if (!isAdmin(user) && !(await canWriteEntity(user, recordId))) {
          throw new ServiceError(403, "Forbidden.");
        }

        const nextOrder =
          (await prisma.recordImage.findFirst({
            where: { entityId: recordId },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true }
          }))?.sortOrder ?? -1;

        const hasPrimary = await prisma.recordImage.findFirst({
          where: { entityId: recordId, isPrimary: true },
          select: { id: true }
        });
        const shouldSetPrimary = body.isPrimary ?? !hasPrimary;

        await prisma.$transaction(async (tx) => {
          if (shouldSetPrimary) {
            await tx.recordImage.updateMany({
              where: { entityId: recordId, isPrimary: true },
              data: { isPrimary: false }
            });
          }
          await tx.recordImage.create({
            data: {
              imageAssetId,
              entityId: recordId,
              caption: body.caption ?? null,
              isPrimary: shouldSetPrimary,
              sortOrder: nextOrder + 1
            }
          });
        });

        const recordImages = await getRecordImagesForEntity(recordId);
        res.status(201).json({ recordImages });
        return;
      }

      if (recordType === "locations") {
        const location = await prisma.location.findUnique({
          where: { id: recordId },
          select: { id: true, worldId: true }
        });
        if (!location || location.worldId !== asset.worldId) {
          throw new ServiceError(404, "Location not found.");
        }
        if (!isAdmin(user) && !(await canWriteLocation(user, recordId))) {
          throw new ServiceError(403, "Forbidden.");
        }

        const nextOrder =
          (await prisma.recordImage.findFirst({
            where: { locationId: recordId },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true }
          }))?.sortOrder ?? -1;

        const hasPrimary = await prisma.recordImage.findFirst({
          where: { locationId: recordId, isPrimary: true },
          select: { id: true }
        });
        const shouldSetPrimary = body.isPrimary ?? !hasPrimary;

        await prisma.$transaction(async (tx) => {
          if (shouldSetPrimary) {
            await tx.recordImage.updateMany({
              where: { locationId: recordId, isPrimary: true },
              data: { isPrimary: false }
            });
          }
          await tx.recordImage.create({
            data: {
              imageAssetId,
              locationId: recordId,
              caption: body.caption ?? null,
              isPrimary: shouldSetPrimary,
              sortOrder: nextOrder + 1
            }
          });
        });

        const recordImages = await getRecordImagesForLocation(recordId);
        res.status(201).json({ recordImages });
        return;
      }

      throw new ServiceError(400, "Unsupported record type.");
    } catch (error) {
      handleError(res, error, "Failed to attach image.");
    }
  });

  app.patch("/api/record-images/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const { id } = req.params;
    const body = req.body as {
      isPrimary?: boolean;
      sortOrder?: number;
      focalX?: number;
      focalY?: number;
      zoom?: number;
      caption?: string | null;
    };

    try {
      const recordImage = await prisma.recordImage.findUnique({
        where: { id },
        include: { imageAsset: true }
      });
      if (!recordImage) {
        throw new ServiceError(404, "Image link not found.");
      }

      if (recordImage.entityId) {
        if (!isAdmin(user) && !(await canWriteEntity(user, recordImage.entityId))) {
          throw new ServiceError(403, "Forbidden.");
        }
      } else if (recordImage.locationId) {
        if (!isAdmin(user) && !(await canWriteLocation(user, recordImage.locationId))) {
          throw new ServiceError(403, "Forbidden.");
        }
      } else {
        throw new ServiceError(400, "Record link is invalid.");
      }

      await prisma.$transaction(async (tx) => {
        if (body.isPrimary) {
          await tx.recordImage.updateMany({
            where: recordImage.entityId
              ? { entityId: recordImage.entityId, isPrimary: true }
              : { locationId: recordImage.locationId!, isPrimary: true },
            data: { isPrimary: false }
          });
          await tx.recordImage.update({ where: { id }, data: { isPrimary: true } });
        }

        const nextData: {
          sortOrder?: number;
          focalX?: number;
          focalY?: number;
          zoom?: number;
          caption?: string | null;
        } = {};
        if (typeof body.sortOrder === "number") {
          nextData.sortOrder = body.sortOrder;
        }
        if (typeof body.focalX === "number") {
          nextData.focalX = Math.max(0, Math.min(100, Math.round(body.focalX)));
        }
        if (typeof body.focalY === "number") {
          nextData.focalY = Math.max(0, Math.min(100, Math.round(body.focalY)));
        }
        if (typeof body.zoom === "number") {
          nextData.zoom = Math.max(1, Math.min(3, body.zoom));
        }
        if (body.caption !== undefined) {
          const trimmed =
            typeof body.caption === "string" ? body.caption.trim() : null;
          nextData.caption = trimmed && trimmed.length > 0 ? trimmed : null;
        }
        if (Object.keys(nextData).length > 0) {
          await tx.recordImage.update({
            where: { id },
            data: nextData
          });
        }
      });

      if (recordImage.entityId) {
        await normalizeRecordImageOrder({ entityId: recordImage.entityId });
        const recordImages = await getRecordImagesForEntity(recordImage.entityId);
        res.json({ recordImages });
        return;
      }

      await normalizeRecordImageOrder({ locationId: recordImage.locationId! });
      const recordImages = await getRecordImagesForLocation(recordImage.locationId!);
      res.json({ recordImages });
    } catch (error) {
      handleError(res, error, "Failed to update image.");
    }
  });

  app.delete("/api/record-images/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const { id } = req.params;

    try {
      const recordImage = await prisma.recordImage.findUnique({
        where: { id }
      });
      if (!recordImage) {
        throw new ServiceError(404, "Image link not found.");
      }

      if (recordImage.entityId) {
        if (!isAdmin(user) && !(await canWriteEntity(user, recordImage.entityId))) {
          throw new ServiceError(403, "Forbidden.");
        }
      } else if (recordImage.locationId) {
        if (!isAdmin(user) && !(await canWriteLocation(user, recordImage.locationId))) {
          throw new ServiceError(403, "Forbidden.");
        }
      } else {
        throw new ServiceError(400, "Record link is invalid.");
      }

      await prisma.recordImage.delete({ where: { id } });

      if (recordImage.entityId) {
        await normalizeRecordImageOrder({ entityId: recordImage.entityId });
        const hasPrimary = await prisma.recordImage.findFirst({
          where: { entityId: recordImage.entityId, isPrimary: true },
          select: { id: true }
        });
        if (!hasPrimary) {
          const nextPrimary = await prisma.recordImage.findFirst({
            where: { entityId: recordImage.entityId },
            orderBy: { sortOrder: "asc" },
            select: { id: true }
          });
          if (nextPrimary) {
            await prisma.recordImage.update({
              where: { id: nextPrimary.id },
              data: { isPrimary: true }
            });
          }
        }
      } else if (recordImage.locationId) {
        await normalizeRecordImageOrder({ locationId: recordImage.locationId });
        const hasPrimary = await prisma.recordImage.findFirst({
          where: { locationId: recordImage.locationId, isPrimary: true },
          select: { id: true }
        });
        if (!hasPrimary) {
          const nextPrimary = await prisma.recordImage.findFirst({
            where: { locationId: recordImage.locationId },
            orderBy: { sortOrder: "asc" },
            select: { id: true }
          });
          if (nextPrimary) {
            await prisma.recordImage.update({
              where: { id: nextPrimary.id },
              data: { isPrimary: true }
            });
          }
        }
      }

      if (recordImage.imageAssetId) {
        const remaining = await prisma.recordImage.count({
          where: { imageAssetId: recordImage.imageAssetId }
        });
        if (remaining === 0) {
          const asset = await prisma.imageAsset.findUnique({
            where: { id: recordImage.imageAssetId },
            include: { variants: true }
          });
          if (asset) {
            await prisma.imageVariant.deleteMany({
              where: { imageAssetId: asset.id }
            });
            await prisma.imageAsset.delete({ where: { id: asset.id } });
            await deleteObject(asset.originalKey).catch(() => undefined);
            await Promise.all(
              asset.variants.map((variant) => deleteObject(variant.key).catch(() => undefined))
            );
          }
        }
      }

      if (recordImage.entityId) {
        const recordImages = await getRecordImagesForEntity(recordImage.entityId);
        res.json({ recordImages });
        return;
      }

      if (recordImage.locationId) {
        const recordImages = await getRecordImagesForLocation(recordImage.locationId);
        res.json({ recordImages });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      handleError(res, error, "Failed to delete image.");
    }
  });
};
