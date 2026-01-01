import { SupabaseStorage, StorageFile } from "./supabase";
import { S3Uploader } from "./s3";
import type { BackupConfig } from "./config";
import { SlackNotifier, type BackupMetrics } from "./slack";
import { mkdir, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export class StorageBackup {
  private supabase: SupabaseStorage;
  private s3: S3Uploader;
  private slack: SlackNotifier;
  private config: BackupConfig;

  constructor(config: BackupConfig) {
    this.config = config;
    this.supabase = new SupabaseStorage(config.supabase);
    this.s3 = new S3Uploader(config.s3);
    this.slack = new SlackNotifier(config.slackWebhookUrl);
  }

  async backup(): Promise<void> {
    const startTime = Date.now();
    console.log("\n" + "=".repeat(60));
    console.log(`Starting backup at ${new Date().toLocaleString()}`);
    console.log("=".repeat(60));

    try {
      // Ensure temp directory exists
      await this.ensureTempDir();

      // Recursively get ALL files from Supabase
      const allFiles = await this.supabase.listAllFiles();

      if (allFiles.length === 0) {
        console.log("\nNo files found to backup");
        return;
      }

      console.log(`\nStarting backup of ${allFiles.length} file(s)...`);

      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      // Calculate total size
      const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);
      console.log(`Total size to backup: ${this.formatBytes(totalSize)}`);

      // Process files in batches
      for (let i = 0; i < allFiles.length; i += this.config.batchSize) {
        const batch = allFiles.slice(
          i,
          Math.min(i + this.config.batchSize, allFiles.length)
        );

        console.log(
          `\nProcessing batch ${Math.floor(i / this.config.batchSize) + 1} (${
            batch.length
          } files):`
        );

        const promises = batch.map(async (file) => {
          try {
            await this.backupFile(file);
            successCount++;
            return { success: true };
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.includes("already exists")
            ) {
              skipCount++;
              return { skip: true };
            }
            errorCount++;
            console.error(`  ✗ Error backing up ${file.path}:`, error);
            return { error: true };
          }
        });

        await Promise.all(promises);
      }

      // Clean up temp directory
      await this.cleanupTempDir();

      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      console.log("\n" + "=".repeat(60));
      console.log("Backup Summary:");
      console.log(`  Total files: ${allFiles.length}`);
      console.log(`  Successfully backed up: ${successCount}`);
      console.log(`  Skipped (already exists): ${skipCount}`);
      console.log(`  Errors: ${errorCount}`);
      console.log(`  Duration: ${duration} seconds`);
      console.log(`  Total size processed: ${this.formatBytes(totalSize)}`);
      console.log("=".repeat(60) + "\n");

      // Send Slack notification
      const metrics: BackupMetrics = {
        totalFiles: allFiles.length,
        successCount,
        skipCount,
        errorCount,
        duration,
        totalSize,
        startTime: new Date(startTime),
        endTime: new Date(endTime)
      };
      await this.slack.sendBackupNotification(metrics);
    } catch (error) {
      console.error("\nBackup failed with error:", error);
      throw error;
    }
  }

  private async backupFile(file: StorageFile): Promise<void> {
    console.log(`\n  Processing: ${file.path}`);

    // Check if file already exists in S3
    const exists = await this.s3.fileExists(file.path);
    if (exists) {
      console.log(`  ⊖ Skipping (already exists in S3): ${file.path}`);
      throw new Error("File already exists");
    }

    // Method 1: Try direct buffer download and upload (memory efficient for smaller files)
    if (file.size && file.size < 100 * 1024 * 1024) {
      // Less than 100MB
      try {
        console.log(`  ↓ Downloading from Supabase...`);
        const buffer = await this.supabase.downloadFile(file.path);

        console.log(`  ↑ Uploading to S3...`);
        const contentType = this.supabase.getContentType(file.name);
        await this.s3.uploadBuffer(buffer, file.path, contentType);

        return;
      } catch (error) {
        console.log(`  ! Buffer method failed, trying file method...`);
      }
    }

    // Method 2: Download to temp file then upload (for larger files)
    // Create nested folder structure in temp directory
    const tempFileName = file.path.replace(/\//g, "_");
    const tempFilePath = path.join(this.config.tempDir, tempFileName);

    try {
      console.log(`  ↓ Downloading to temp file...`);
      const buffer = await this.supabase.downloadFile(file.path);
      await writeFile(tempFilePath, buffer);

      console.log(`  ↑ Uploading from temp file to S3...`);
      const contentType = this.supabase.getContentType(file.name);

      await this.s3.uploadFile(
        tempFilePath,
        file.path,
        contentType,
        (progress) => {
          process.stdout.write(`\r  ↑ Upload progress: ${progress}%`);
        }
      );
      process.stdout.write("\n");

      // Clean up temp file
      await rm(tempFilePath, { force: true });
    } catch (error) {
      // Clean up temp file on error
      await rm(tempFilePath, { force: true }).catch(() => {});
      throw error;
    }
  }

  private async ensureTempDir(): Promise<void> {
    if (!existsSync(this.config.tempDir)) {
      await mkdir(this.config.tempDir, { recursive: true });
      console.log(`Created temp directory: ${this.config.tempDir}`);
    }
  }

  private async cleanupTempDir(): Promise<void> {
    try {
      await rm(this.config.tempDir, { recursive: true, force: true });
      console.log(`\nCleaned up temp directory: ${this.config.tempDir}`);
    } catch (error) {
      console.warn(`Warning: Could not clean up temp directory:`, error);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}