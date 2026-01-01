export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey?: string; // Optional service role key for full access
  bucketName: string;
  audioPath?: string; // Optional path prefix for files
}

export interface S3Config {
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  prefix?: string; // Optional prefix for S3 keys
}

export interface BackupConfig {
  supabase: SupabaseConfig;
  s3: S3Config;
  cronSchedule: string;
  tempDir: string;
  fileExtensions: string[]; // e.g., ['.mp3', '.wav', '.m4a']
  batchSize: number; // Number of files to process in parallel
  slackWebhookUrl?: string; // Optional Slack webhook URL for notifications
}

function loadSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || "audio";
  const audioPath = process.env.SUPABASE_AUDIO_PATH || "";

  if (!url || (!anonKey && !serviceKey)) {
    throw new Error(
      "Supabase configuration incomplete. Please set SUPABASE_URL and either SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY"
    );
  }

  // Prefer service key if available for full access
  const key = serviceKey || anonKey;

  return { url, anonKey: key!, serviceKey, bucketName, audioPath };
}

function loadS3Config(): S3Config {
  const bucketName = process.env.S3_BUCKET_NAME;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || "us-east-1";
  const prefix = process.env.S3_PREFIX || "supabase-backups/audio";

  if (!bucketName || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 configuration incomplete. Please set S3_BUCKET_NAME, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY"
    );
  }

  return { bucketName, accessKeyId, secretAccessKey, region, prefix };
}

export function loadConfig(): BackupConfig {
  const supabase = loadSupabaseConfig();
  const s3 = loadS3Config();
  const cronSchedule = process.env.BACKUP_CRON || "0 2 * * *"; // Default: 2 AM daily
  const tempDir = process.env.TEMP_DIR || "/tmp/supabase-audio-backups";
  const fileExtensions = (
    process.env.FILE_EXTENSIONS || ".mp3,.wav,.m4a,.aac,.ogg,.flac"
  )
    .split(",")
    .map((ext) => ext.trim());
  const batchSize = parseInt(process.env.BATCH_SIZE || "5", 10);
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  return {
    supabase,
    s3,
    cronSchedule,
    tempDir,
    fileExtensions,
    batchSize,
    slackWebhookUrl,
  };
}
