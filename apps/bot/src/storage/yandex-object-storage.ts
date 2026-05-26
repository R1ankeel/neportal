import { randomBytes } from "node:crypto";
import { getSpeechKitConfig } from "../speech/speechkit-config";
import { SpeechKitError } from "../speech/types";

type StorageSource = "telegram-voice" | "telegram-audio";

export type UploadTempObjectParams = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  source?: StorageSource;
};

export type UploadTempObjectResult = {
  bucket: string;
  key: string;
  objectUri: string;
  s3Url: string;
};

let cachedS3Client: unknown;

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) return "speechkit/tmp/";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function buildTempObjectKey(prefix: string, extension: string): string {
  const isoDate = new Date().toISOString().slice(0, 10);
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const random = randomBytes(8).toString("hex");
  return `${normalizePrefix(prefix)}${isoDate}/${random}.${safeExt}`;
}

function getStorageConfigOrThrow(): {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
} {
  const cfg = getSpeechKitConfig();
  if (
    !cfg.objectStorageBucket
    || !cfg.storageAccessKeyId
    || !cfg.storageSecretAccessKey
    || !cfg.storageEndpoint
    || !cfg.storageRegion
  ) {
    throw new SpeechKitError({
      code: "SPEECHKIT_STORAGE_NOT_CONFIGURED",
      message: "provider=yandex-speechkit code=SPEECHKIT_STORAGE_NOT_CONFIGURED",
      retryable: false,
      details: {
        hasBucket: !!cfg.objectStorageBucket,
        hasAccessKey: !!cfg.storageAccessKeyId,
        hasSecretKey: !!cfg.storageSecretAccessKey,
        hasEndpoint: !!cfg.storageEndpoint,
        hasRegion: !!cfg.storageRegion,
      },
    });
  }
  return {
    bucket: cfg.objectStorageBucket,
    endpoint: cfg.storageEndpoint,
    region: cfg.storageRegion,
    accessKeyId: cfg.storageAccessKeyId,
    secretAccessKey: cfg.storageSecretAccessKey,
    prefix: cfg.objectStoragePrefix,
  };
}

function getS3Client(): unknown {
  if (cachedS3Client) return cachedS3Client;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { S3Client } = require("@aws-sdk/client-s3") as { S3Client: new (params: unknown) => unknown };
  const cfg = getStorageConfigOrThrow();
  cachedS3Client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return cachedS3Client;
}

export async function uploadTempObject(params: UploadTempObjectParams): Promise<UploadTempObjectResult> {
  const cfg = getStorageConfigOrThrow();
  const key = buildTempObjectKey(cfg.prefix, params.extension);
  const objectUri = `https://storage.yandexcloud.net/${cfg.bucket}/${key}`;
  const s3Url = `s3://${cfg.bucket}/${key}`;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PutObjectCommand } = require("@aws-sdk/client-s3") as {
    PutObjectCommand: new (params: unknown) => unknown;
  };
  const client = getS3Client() as { send: (command: unknown) => Promise<unknown> };

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
      Metadata: {
        source: params.source ?? "telegram-voice",
      },
    }),
  );

  return {
    bucket: cfg.bucket,
    key,
    objectUri,
    s3Url,
  };
}

export async function deleteObjectBestEffort(bucket: string, key: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3") as {
      DeleteObjectCommand: new (params: unknown) => unknown;
    };
    const client = getS3Client() as { send: (command: unknown) => Promise<unknown> };
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[voice] storage temp object delete failed", {
      bucket,
      keyPrefix: key.slice(0, Math.min(48, key.length)),
      error: message.slice(0, 180),
    });
  }
}
