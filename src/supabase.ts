import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseConfig } from "./config";

export interface StorageFile {
  name: string;
  id: string;
  path: string; // Full path including folders
  isFolder: boolean;
  created_at: string;
  updated_at: string;
  size: number;
  metadata?: Record<string, any>;
}

export class SupabaseStorage {
  private client: SupabaseClient;
  private bucketName: string;

  constructor(config: SupabaseConfig) {
    // Use service key if available for full access, otherwise use anon key
    const key = config.serviceKey || config.anonKey;

    this.client = createClient(config.url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    this.bucketName = config.bucketName;

    if (config.serviceKey) {
      console.log("  ℹ️  Using service role key for full access");
    } else {
      console.log("  ℹ️  Using anon key (limited access - files may not be visible)");
    }
  }

  /**
   * Recursively list all files in the bucket, traversing all directories
   */
  async listAllFiles(): Promise<StorageFile[]> {
    console.log(`\nScanning Supabase bucket: ${this.bucketName}`);
    console.log(`  Starting recursive scan...`);

    const allFiles: StorageFile[] = [];
    const foldersToProcess: string[] = [""]; // Start with root
    const processedFolders = new Set<string>();

    while (foldersToProcess.length > 0) {
      const currentPath = foldersToProcess.shift()!;

      // Skip if already processed
      if (processedFolders.has(currentPath)) {
        continue;
      }
      processedFolders.add(currentPath);

      try {
        const { data, error } = await this.client.storage
          .from(this.bucketName)
          .list(currentPath, {
            limit: 10000,
            offset: 0,
          });

        if (error) {
          console.error(`  ✗ Error listing path "${currentPath}":`, error.message);
          continue;
        }

        if (!data || data.length === 0) {
          continue;
        }

        for (const item of data) {
          const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
          const isFolder = !item.metadata || Object.keys(item.metadata).length === 0 || !item.metadata.size;

          if (isFolder) {
            // Add folder to be processed
            foldersToProcess.push(fullPath);
            console.log(`  📁 Found folder: ${fullPath}`);
          } else {
            // Add file to results
            const file: StorageFile = {
              name: item.name,
              id: item.id,
              path: fullPath,
              isFolder: false,
              created_at: item.created_at || "",
              updated_at: item.updated_at || "",
              size: item.metadata?.size || 0,
              metadata: item.metadata,
            };
            allFiles.push(file);
          }
        }
      } catch (error) {
        console.error(`  ✗ Error processing path "${currentPath}":`, error);
      }
    }

    console.log(`\n  ✓ Scan complete. Found ${allFiles.length} file(s) across ${processedFolders.size} folder(s)`);

    // Show file type breakdown
    if (allFiles.length > 0) {
      const extensions = new Map<string, number>();
      allFiles.forEach(file => {
        const ext = file.name.includes('.') ?
          '.' + file.name.split('.').pop()?.toLowerCase() :
          '(no extension)';
        extensions.set(ext, (extensions.get(ext) || 0) + 1);
      });

      console.log("\n  File types found:");
      Array.from(extensions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10) // Show top 10 types
        .forEach(([ext, count]) => {
          console.log(`    - ${ext}: ${count} file(s)`);
        });

      // Show some sample files
      console.log("\n  Sample files:");
      allFiles.slice(0, 5).forEach(file => {
        console.log(`    - ${file.path} (${this.formatBytes(file.size)})`);
      });
    }

    return allFiles;
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    try {
      // Add timeout wrapper to prevent hanging downloads
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Download timeout after 60s')), 60000);
      });

      const downloadPromise = (async () => {
        const { data, error } = await this.client.storage
          .from(this.bucketName)
          .download(filePath);

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(`No data returned for file: ${filePath}`);
        }

        // Convert Blob to Buffer
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
      })();

      return await Promise.race([downloadPromise, timeout]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        console.error(`  ! Timeout downloading file ${filePath} after 60s`);
      } else {
        console.error(`  ! Error downloading file ${filePath}:`, error);
      }
      throw error;
    }
  }

  async getFileUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .createSignedUrl(filePath, expiresIn);

      if (error) {
        throw error;
      }

      if (!data?.signedUrl) {
        throw new Error(`No signed URL generated for file: ${filePath}`);
      }

      return data.signedUrl;
    } catch (error) {
      console.error(`Error generating signed URL for ${filePath}:`, error);
      throw error;
    }
  }

  getContentType(fileName: string): string {
    const extension = fileName.toLowerCase().split(".").pop();
    const contentTypes: Record<string, string> = {
      // Audio files
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      aac: "audio/aac",
      ogg: "audio/ogg",
      flac: "audio/flac",
      webm: "audio/webm",
      wma: "audio/x-ms-wma",

      // Video files
      mp4: "video/mp4",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      mov: "video/quicktime",
      wmv: "video/x-ms-wmv",
      flv: "video/x-flv",

      // Image files
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      bmp: "image/bmp",
      webp: "image/webp",
      svg: "image/svg+xml",
      ico: "image/x-icon",

      // Document files
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",

      // Text files
      txt: "text/plain",
      csv: "text/csv",
      json: "application/json",
      xml: "application/xml",
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      ts: "application/typescript",

      // Archive files
      zip: "application/zip",
      rar: "application/x-rar-compressed",
      "7z": "application/x-7z-compressed",
      tar: "application/x-tar",
      gz: "application/gzip",
    };

    // Default to binary if unknown
    return contentTypes[extension || ""] || "application/octet-stream";
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}