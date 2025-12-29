#!/usr/bin/env bun

import { loadConfig } from "./config";
import { BackupScheduler } from "./scheduler";
import { StorageBackup } from "./backup";

async function main() {
  console.log("📦 Supabase Storage Backup Tool\n");

  try {
    // Load configuration from environment variables
    const config = loadConfig();

    // Check if running in one-time mode or scheduler mode
    const args = process.argv.slice(2);
    const oneTimeMode = args.includes("--once") || args.includes("-o");

    if (oneTimeMode) {
      console.log("Running in one-time backup mode...\n");
      const backup = new StorageBackup(config);
      await backup.backup();
      console.log("\nOne-time backup completed successfully!");
      process.exit(0);
    } else {
      // Start the scheduler
      const scheduler = new BackupScheduler(config);
      await scheduler.start();

      // Keep the process running
      await new Promise(() => {});
    }
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    if (error instanceof Error) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
