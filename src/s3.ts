import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { S3Config } from "./config";
import { createReadStream } from "fs";
import { stat } from "fs/promises";

export class S3Uploader {
  private client: S3Client;
  private bucketName: string;
  private prefix?: string;

  constructor(config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucketName = config.bucketName;
    this.prefix = config.prefix;
  }

  async uploadFile(
    localFilePath: string,
    filePath: string, // Full path including folders
    contentType: string = "application/octet-stream",
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      const fileStats = await stat(localFilePath);
      const fileStream = createReadStream(localFilePath);

      const s3Key = this.generateS3Key(filePath);

      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucketName,
          Key: s3Key,
          Body: fileStream,
          ContentType: contentType,
          Metadata: {
            "original-path": filePath,
            "backup-date": new Date().toISOString(),
          },
        },
      });

      upload.on("httpUploadProgress", (progress) => {
        if (onProgress && progress.loaded && progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          onProgress(percent);
        }
      });

      await upload.done();
      console.log(
        `  ✓ Uploaded: ${filePath} → s3://${this.bucketName}/${s3Key} (${this.formatBytes(fileStats.size)})`
      );
    } catch (error) {
      console.error(`  ✗ Failed to upload: ${filePath}`, error);
      throw error;
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    filePath: string, // Full path including folders
    contentType: string = "application/octet-stream"
  ): Promise<void> {
    try {
      const s3Key = this.generateS3Key(filePath);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          "original-path": filePath,
          "backup-date": new Date().toISOString(),
        },
      });

      await this.client.send(command);
      console.log(
        `  ✓ Uploaded: ${filePath} → s3://${this.bucketName}/${s3Key} (${this.formatBytes(buffer.length)})`
      );
    } catch (error) {
      console.error(`  ✗ Failed to upload: ${filePath}`, error);
      throw error;
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      const s3Key = this.generateS3Key(filePath);
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: s3Key,
        MaxKeys: 1,
      });

      const response = await this.client.send(command);
      return (response.Contents?.length ?? 0) > 0;
    } catch (error) {
      console.error(`Error checking if file exists in S3: ${filePath}`, error);
      return false;
    }
  }

  private generateS3Key(filePath: string): string {
    // Create a direct mirror without date prefix
    // This will overwrite existing files (no versioning)
    const key = this.prefix
      ? `${this.prefix}/${filePath}`
      : filePath;

    return key;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}