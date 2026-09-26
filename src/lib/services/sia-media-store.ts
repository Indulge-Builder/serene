// sia-media-store.ts — THE read of a Sia media file's bytes from the watcher's S3 archive
// (0169: wag_media.storage_path = s3://bucket/key). No `server-only`: the Sia page (sia-service)
// signs urls with it and the media reader (Trigger.dev, 0246) downloads with it. The identity is
// read-only (SIA_S3_ACCESS_KEY_ID / SIA_S3_SECRET_ACCESS_KEY); never a write here.
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

let s3Member: S3Client | null = null;
export function siaS3(): S3Client {
  const keyId = process.env.SIA_S3_ACCESS_KEY_ID;
  const secret = process.env.SIA_S3_SECRET_ACCESS_KEY;
  s3Member ??= new S3Client({
    region: process.env.SIA_S3_REGION ?? "ap-south-1",
    ...(keyId && secret ? { credentials: { accessKeyId: keyId, secretAccessKey: secret } } : {}),
  });
  return s3Member;
}

/** s3://bucket/key → { bucket, key }, or null for anything else (a pre-W1 local path). */
export function parseS3Path(storagePath: string): { bucket: string; key: string } | null {
  if (!storagePath.startsWith("s3://")) return null;
  const rest = storagePath.slice("s3://".length);
  const slash = rest.indexOf("/");
  const bucket = rest.slice(0, slash);
  const key = rest.slice(slash + 1);
  return bucket && key ? { bucket, key } : null;
}

/** The whole object as bytes, or null when the path is not S3 or the object is gone. Caller caps the size. */
export async function downloadSiaMediaBytes(storagePath: string, maxBytes: number): Promise<{ bytes: Buffer; contentType: string | null } | null> {
  const loc = parseS3Path(storagePath);
  if (!loc) return null;
  const res = await siaS3().send(new GetObjectCommand({ Bucket: loc.bucket, Key: loc.key }));
  if (res.ContentLength !== undefined && res.ContentLength > maxBytes) return null;
  const body = await res.Body?.transformToByteArray();
  if (!body) return null;
  if (body.byteLength > maxBytes) return null;
  return { bytes: Buffer.from(body), contentType: res.ContentType ?? null };
}
