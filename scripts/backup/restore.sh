#!/usr/bin/env bash
# ==============================================================================
# BarberCraft Production PostgreSQL Restore Tool
# Restores a compressed pg_dump backup (.sql.gz) into a target database.
#
# SAFETY INVARIANT:
# By default, restores into a specified TARGET_DATABASE_URL or explicitly confirmed DB.
# Never silently drops production databases without explicit user confirmation.
# ==============================================================================

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz> [target_database_url]" >&2
  exit 1
fi

BACKUP_FILE="$1"
RESTORE_URL="${2:-${TARGET_DATABASE_URL:-${DATABASE_URL:-}}}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: Backup file '${BACKUP_FILE}' not found." >&2
  exit 1
fi

if [[ -z "${RESTORE_URL}" ]]; then
  echo "ERROR: Target database URL not provided. Set TARGET_DATABASE_URL or pass as second argument." >&2
  exit 1
fi

echo "=========================================================="
echo "WARNING: YOU ARE ABOUT TO RESTORE A DATABASE BACKUP"
echo "Backup source: ${BACKUP_FILE}"
echo "=========================================================="

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  read -r -p "Are you sure you want to proceed with restore? [y/N]: " confirmation
  if [[ "${confirmation}" != "y" && "${confirmation}" != "Y" ]]; then
    echo "Restore aborted by operator."
    exit 0
  fi
fi

echo "Decompressing and streaming backup into target PostgreSQL database..."

if gzip -dc "${BACKUP_FILE}" | psql "${RESTORE_URL}" --single-transaction --set ON_ERROR_STOP=on; then
  echo "SUCCESS: Database restore completed cleanly."
else
  echo "ERROR: Database restore failed!" >&2
  exit 1
fi

exit 0
