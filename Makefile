# Supabase Audio Storage Backup - Makefile

# Install dependencies
install:
	bun install

# Run the backup scheduler (continuous mode)
start:
	bun run start

# Run the backup scheduler in development mode
dev:
	bun run dev

# Run a one-time backup
backup:
	bun run src/index.ts --once

# Run backup once (alias)
once:
	bun run src/index.ts --once

# Test Supabase connection
test:
	bun run src/test-connection.ts

# Clean up temp directory
clean:
	rm -rf /tmp/supabase-audio-backups

# Show environment variables status
check-env:
	@echo "Checking environment variables..."
	@echo "SUPABASE_URL: $${SUPABASE_URL:+[SET]}"
	@echo "SUPABASE_ANON_KEY: $${SUPABASE_ANON_KEY:+[SET]}"
	@echo "SUPABASE_BUCKET_NAME: $${SUPABASE_BUCKET_NAME:-audio}"
	@echo "SUPABASE_AUDIO_PATH: $${SUPABASE_AUDIO_PATH:-[root]}"
	@echo "S3_BUCKET_NAME: $${S3_BUCKET_NAME:+[SET]}"
	@echo "S3_ACCESS_KEY_ID: $${S3_ACCESS_KEY_ID:+[SET]}"
	@echo "S3_SECRET_ACCESS_KEY: $${S3_SECRET_ACCESS_KEY:+[SET]}"
	@echo "S3_REGION: $${S3_REGION:-us-east-1}"
	@echo "S3_PREFIX: $${S3_PREFIX:-supabase-backups/audio}"
	@echo "BACKUP_CRON: $${BACKUP_CRON:-0 2 * * *}"
	@echo "FILE_EXTENSIONS: $${FILE_EXTENSIONS:-.mp3,.wav,.m4a,.aac,.ogg,.flac}"
	@echo "BATCH_SIZE: $${BATCH_SIZE:-5}"

# Run with example environment
example:
	@echo "Running with example environment variables..."
	@echo "Please copy .env.example to .env and update with your values first!"

# Help
help:
	@echo "Supabase Audio Storage Backup - Available commands:"
	@echo ""
	@echo "  make install     - Install dependencies"
	@echo "  make start       - Run backup scheduler (continuous mode)"
	@echo "  make dev         - Run in development mode"
	@echo "  make backup      - Run one-time backup"
	@echo "  make once        - Run one-time backup (alias)"
	@echo "  make clean       - Clean up temp directory"
	@echo "  make check-env   - Check environment variables"
	@echo "  make help        - Show this help message"

.PHONY: install start dev backup once clean check-env example help