#!/usr/bin/env bash
# ==============================================================================
# BarberCraft Restore Verification Drill Tool
# Tests that a backup file can be successfully restored into a temporary
# isolated database and verifies schema integrity.
#
# Usage:
#   DATABASE_BASE_URL="postgres://user:pass@localhost:5432" \
#   ./scripts/backup/verify-restore.sh <path_to_backup.sql.gz>
# ==============================================================================

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
TEMP_DB_NAME="barbercraft_drill_$(date +%s)"
BASE_URL="${DATABASE_BASE_URL:-postgresql://postgres:postgres@localhost:5432}"
ADMIN_URL="${BASE_URL%/}/postgres"
TEMP_DB_URL="${BASE_URL%/}/${TEMP_DB_NAME}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: Backup file '${BACKUP_FILE}' does not exist." >&2
  exit 1
fi

echo "=========================================================="
echo "Starting Non-Destructive Restore Verification Drill"
echo "Source: ${BACKUP_FILE}"
echo "Temporary DB: ${TEMP_DB_NAME}"
echo "=========================================================="

cleanup() {
  echo "Tearing down temporary drill database..."
  psql "${ADMIN_URL}" -c "DROP DATABASE IF EXISTS ${TEMP_DB_NAME};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "1. Creating temporary database '${TEMP_DB_NAME}'..."
psql "${ADMIN_URL}" -c "CREATE DATABASE ${TEMP_DB_NAME};" >/dev/null

echo "2. Restoring backup into temporary database..."
CONFIRM_RESTORE=yes ./scripts/backup/restore.sh "${BACKUP_FILE}" "${TEMP_DB_URL}"

echo "3. Verifying database table and integrity counts..."
psql "${TEMP_DB_URL}" -c "
  SELECT 'businesses' AS entity, COUNT(*) FROM businesses
  UNION ALL
  SELECT 'appointments', COUNT(*) FROM appointments
  UNION ALL
  SELECT 'users', COUNT(*) FROM users
  UNION ALL
  SELECT 'services', COUNT(*) FROM services
  UNION ALL
  SELECT 'rate_limits', COUNT(*) FROM rate_limits;
"

echo "SUCCESS: Restore verification drill completed. Backup is valid and restorable."
exit 0
