/**
 * Slack notification client for sending backup status updates
 */

export interface SlackMessage {
  text: string;
  blocks?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
    };
    fields?: Array<{
      type: string;
      text: string;
    }>;
  }>;
}

export interface BackupMetrics {
  totalFiles: number;
  successCount: number;
  skipCount: number;
  errorCount: number;
  duration: number; // in seconds
  totalSize: number; // in bytes
  startTime: Date;
  endTime: Date;
}

export class SlackNotifier {
  private webhookUrl: string | undefined;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Send a backup completion notification to Slack
   */
  async sendBackupNotification(metrics: BackupMetrics): Promise<void> {
    if (!this.webhookUrl) {
      console.log("Slack webhook URL not configured, skipping notification");
      return;
    }

    const message = this.buildBackupMessage(metrics);

    try {
      await this.sendMessage(message);
      console.log("Slack notification sent successfully");
    } catch (error) {
      console.error("Failed to send Slack notification:", error);
      // Don't throw - we don't want Slack failures to affect backup process
    }
  }

  /**
   * Build a formatted Slack message from backup metrics
   */
  private buildBackupMessage(metrics: BackupMetrics): SlackMessage {
    const status = metrics.errorCount === 0 ? "Success" : "Completed with errors";
    const statusEmoji = metrics.errorCount === 0 ? "✅" : "⚠️";

    // Format dates
    const startTimeStr = metrics.startTime.toLocaleString();
    const endTimeStr = metrics.endTime.toLocaleString();

    // Format duration
    const durationMin = Math.floor(metrics.duration / 60);
    const durationSec = metrics.duration % 60;
    const durationStr = durationMin > 0
      ? `${durationMin}m ${durationSec}s`
      : `${durationSec}s`;

    // Format size
    const sizeStr = this.formatBytes(metrics.totalSize);

    const message: SlackMessage = {
      text: `Supabase Storage Backup - ${status}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Supabase Storage Backup ${statusEmoji}`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Backup Status: *${status}*`
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Total Files:*\n${metrics.totalFiles}`
            },
            {
              type: "mrkdwn",
              text: `*Duration:*\n${durationStr}`
            },
            {
              type: "mrkdwn",
              text: `*Backed Up:*\n${metrics.successCount}`
            },
            {
              type: "mrkdwn",
              text: `*Skipped:*\n${metrics.skipCount}`
            },
            {
              type: "mrkdwn",
              text: `*Errors:*\n${metrics.errorCount}`
            },
            {
              type: "mrkdwn",
              text: `*Total Size:*\n${sizeStr}`
            }
          ]
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Started:*\n${startTimeStr}`
            },
            {
              type: "mrkdwn",
              text: `*Completed:*\n${endTimeStr}`
            }
          ]
        }
      ]
    };

    // Add error section if there were errors
    if (metrics.errorCount > 0) {
      message.blocks?.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⚠️ *Warning:* ${metrics.errorCount} file(s) failed to backup. Check logs for details.`
        }
      });
    }

    return message;
  }

  /**
   * Send a message to the Slack webhook
   */
  private async sendMessage(message: SlackMessage): Promise<void> {
    if (!this.webhookUrl) {
      throw new Error("Slack webhook URL not configured");
    }

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Slack API error: ${response.status} - ${text}`);
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}