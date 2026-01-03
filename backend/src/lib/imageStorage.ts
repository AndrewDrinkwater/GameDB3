import { randomBytes } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  IMAGE_BUCKET,
  IMAGE_REGION,
  IMAGE_ENDPOINT,
  IMAGE_ACCESS_KEY_ID,
  IMAGE_SECRET_ACCESS_KEY,
  IMAGE_PUBLIC_BASE_URL
} = process.env;

const resolveBucketConfig = () => {
  if (!IMAGE_BUCKET || !IMAGE_ACCESS_KEY_ID || !IMAGE_SECRET_ACCESS_KEY) {
    throw new Error("Image storage is not configured.");
  }
  return {
    bucket: IMAGE_BUCKET,
    region: IMAGE_REGION ?? "us-east-1",
    endpoint: IMAGE_ENDPOINT,
    accessKeyId: IMAGE_ACCESS_KEY_ID,
    secretAccessKey: IMAGE_SECRET_ACCESS_KEY
  };
};

let cachedClient: S3Client | null = null;

const getClient = () => {
  if (cachedClient) return cachedClient;
  const config = resolveBucketConfig();
  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  return cachedClient;
};

const buildPublicUrl = (key: string) => {
  if (!IMAGE_PUBLIC_BASE_URL) return null;
  const base = IMAGE_PUBLIC_BASE_URL.endsWith("/")
    ? IMAGE_PUBLIC_BASE_URL.slice(0, -1)
    : IMAGE_PUBLIC_BASE_URL;
  const normalizedKey = key.startsWith("/") ? key.slice(1) : key;
  return `${base}/${normalizedKey}`;
};

const generateUploadKey = (worldId: string, fileName: string) => {
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const token = randomBytes(12).toString("hex");
  return `uploads/${worldId}/${Date.now()}-${token}-${safeName}`;
};

const getSignedUploadUrl = async (key: string, contentType: string, expiresInSeconds = 600) => {
  const client = getClient();
  const { bucket } = resolveBucketConfig();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
};

const headObject = async (key: string) => {
  const client = getClient();
  const { bucket } = resolveBucketConfig();
  const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
  return client.send(command);
};

const getObjectBuffer = async (key: string) => {
  const client = getClient();
  const { bucket } = resolveBucketConfig();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await client.send(command);
  if (!response.Body) {
    throw new Error("Image upload is missing.");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const putObjectBuffer = async (key: string, buffer: Buffer, contentType: string) => {
  const client = getClient();
  const { bucket } = resolveBucketConfig();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType
  });
  await client.send(command);
};

const deleteObject = async (key: string) => {
  const client = getClient();
  const { bucket } = resolveBucketConfig();
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
  await client.send(command);
};

export {
  buildPublicUrl,
  generateUploadKey,
  getSignedUploadUrl,
  headObject,
  getObjectBuffer,
  putObjectBuffer,
  deleteObject
};
