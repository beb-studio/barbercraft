#!/usr/bin/env bash
# ==============================================================================
# BarberCraft Production PostgreSQL Backup Tool
# Creates a compressed, timestamped logical PostgreSQL database backup using pg_dump.
#
# Requirements:
# - pg_dump installed
# - DATABASE_URL set in environment, or passes connection parameters
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/barbercraft_backup_${TIMESTAMP}.sql.gz"

# Ensure target backup directory exists with restricted permissions
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL environment variable is not set." >&2
  exit 1
fi

echo "Starting PostgreSQL logical backup..."
echo "Destination: ${BACKUP_FILE}"

# Run pg_dump through gzip, never logging credentials
if pg_dump --clean --if-exists --no-owner --no-privileges "${DATABASE_URL}" | gzip -9 > "${BACKUP_FILE}"; then
  # Restrict permissions so backup is readable only by owner
  chmod 600 "${BACKUP_FILE}"
  BACKUP_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
  echo "SUCCESS: Database backup completed. Size: ${BACKUP_SIZE}"
else
  echo "ERROR: pg_dump backup failed!" >&2
  # Remove partial or corrupt file
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# Retention policy: Prune backups older than RETENTION_DAYS
echo "Applying retention policy (keeping last ${RETENTION_DAYS} days)..."
find "${BACKUP_DIR}" -type f -name "barbercraft_backup_*.sql.gz" -mtime +"${RETENTION_DAYS}" -print -delete || true

echo "Backup operation finished successfully."
exit 0
