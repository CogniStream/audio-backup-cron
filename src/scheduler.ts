import type { BackupConfig } from "./config";
import { StorageBackup } from "./backup";

export class BackupScheduler {
  private config: BackupConfig;
  private backup: StorageBackup;
  private intervalId?: Timer;

  constructor(config: BackupConfig) {
    this.config = config;
    this.backup = new StorageBackup(config);
  }

  async start(): Promise<void> {
    console.log("Starting Supabase Storage Backup Scheduler\n");
    console.log("Configuration:");
    console.log(`  Supabase URL: ${this.config.supabase.url}`);
    console.log(`  Supabase Bucket: ${this.config.supabase.bucketName}`);
    console.log(`  S3 Bucket: ${this.config.s3.bucketName}`);
    console.log(`  S3 Region: ${this.config.s3.region}`);
    console.log(`  S3 Prefix: ${this.config.s3.prefix || "none"}`);
    console.log(`  Temp Directory: ${this.config.tempDir}`);
    console.log(`  Batch Size: ${this.config.batchSize}`);
    console.log(`  Cron Schedule: ${this.config.cronSchedule}`);

    console.log("\nRunning initial backup...\n");
    await this.runBackup();

    console.log("\nScheduling cron job...");
    this.scheduleCronJob();

    console.log("Scheduler is running. Press Ctrl+C to stop.\n");

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n\nReceived SIGINT, shutting down gracefully...");
      this.stop();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\n\nReceived SIGTERM, shutting down gracefully...");
      this.stop();
      process.exit(0);
    });
  }

  private scheduleCronJob(): void {
    // Check every minute if we should run the backup based on cron schedule
    this.intervalId = setInterval(async () => {
      if (this.shouldRunBackup()) {
        console.log(
          `\n[${new Date().toLocaleString()}] Cron trigger activated`
        );
        await this.runBackup();
      }
    }, 60000); // Check every minute
  }

  private shouldRunBackup(): boolean {
    const now = new Date();
    const parts = this.config.cronSchedule.split(" ");

    if (parts.length !== 5) {
      console.error(`Invalid cron format: ${this.config.cronSchedule}`);
      return false;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentDayOfWeek = now.getDay();

    // Check if we should run based on cron expression
    const matchMinute = this.matchCronField(minute, currentMinute, 0, 59);
    const matchHour = this.matchCronField(hour, currentHour, 0, 23);
    const matchDay = this.matchCronField(dayOfMonth, currentDay, 1, 31);
    const matchMonth = this.matchCronField(month, currentMonth, 1, 12);
    const matchDayOfWeek = this.matchCronField(
      dayOfWeek,
      currentDayOfWeek,
      0,
      6
    );

    return matchMinute && matchHour && matchDay && matchMonth && matchDayOfWeek;
  }

  private matchCronField(
    cronField: string,
    currentValue: number,
    min: number,
    max: number
  ): boolean {
    if (cronField === "*") return true;

    // Handle step values (e.g., */5)
    if (cronField.includes("/")) {
      const [range, step] = cronField.split("/");
      const stepValue = parseInt(step);
      if (range === "*") {
        return currentValue % stepValue === 0;
      }
    }

    // Handle ranges (e.g., 1-5)
    if (cronField.includes("-")) {
      const [start, end] = cronField.split("-").map((v) => parseInt(v));
      return currentValue >= start && currentValue <= end;
    }

    // Handle lists (e.g., 1,3,5)
    if (cronField.includes(",")) {
      const values = cronField.split(",").map((v) => parseInt(v));
      return values.includes(currentValue);
    }

    // Handle single values
    return parseInt(cronField) === currentValue;
  }

  async runBackup(): Promise<void> {
    try {
      await this.backup.backup();
    } catch (error) {
      console.error("Backup failed:", error);
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      console.log("Scheduler stopped");
    }
  }
}
