import fs from 'node:fs/promises';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';

// Local disk, for development without MinIO
class LocalStorage {
  constructor(dir) {
    this.dir = path.resolve(dir);
  }
  resolve(key) {
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(this.dir + path.sep)) throw new Error('Invalid storage key');
    return full;
  }
  async init() {
    await fs.mkdir(this.dir, { recursive: true });
  }
  async put(key, buffer) {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
  }
  async get(key) {
    return fs.readFile(this.resolve(key));
  }
  async remove(key) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

// MinIO (local) or AWS S3 (production)
class S3Storage {
  constructor(cfg) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  async init() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
  async put(key, buffer, mimeType) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mimeType }));
  }
  async get(key) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await out.Body.transformToByteArray());
  }
  async remove(key) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export const storage = config.s3.accessKeyId ? new S3Storage(config.s3) : new LocalStorage(config.upload.localDir);
