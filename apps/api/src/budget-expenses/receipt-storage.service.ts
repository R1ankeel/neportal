import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

@Injectable()
export class ReceiptStorageService {
  uploadsRoot(): string {
    const configured = process.env.UPLOAD_DIR?.trim();
    if (configured) return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
    return path.join(process.cwd(), "uploads");
  }

  async save(orgId: string, buffer: Buffer, originalFilename: string): Promise<string> {
    const safe =
      originalFilename.replace(/[^a-zA-Z0-9._-]/gu, "_").replace(/_+/g, "_").slice(0, 120) || "receipt";
    const rel = path.posix.join("receipts", orgId, `${randomUUID()}-${safe}`);
    const abs = path.join(this.uploadsRoot(), rel);
    await mkdir(path.dirname(abs), { recursive: true });
    try {
      await writeFile(abs, buffer);
    } catch {
      throw new InternalServerErrorException("Failed to save receipt file");
    }
    return rel;
  }

  async read(storageKey: string): Promise<Buffer> {
    const normalized = storageKey.replace(/\\/g, "/");
    if (normalized.includes("..")) {
      throw new InternalServerErrorException("Invalid storage key");
    }
    const abs = path.join(this.uploadsRoot(), normalized);
    try {
      return await readFile(abs);
    } catch {
      throw new InternalServerErrorException("Receipt file not found on disk");
    }
  }
}
