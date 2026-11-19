#!/usr/bin/env bash
#
# Online SQLite backup for SubHub.
# Safe to run while the container is serving traffic (uses SQLite's online
# backup API through better-sqlite3, so the produced file is always consistent
# even though the database runs in WAL mode).
#
# Usage:
#   ./scripts/backup-db.sh
#   CONTAINER=subhub KEEP_DAYS=14 ./scripts/backup-db.sh
#
# Typical cron entry (daily at 03:15):
#   15 3 * * * /home/deploy/muse-workspace/projects/subhub/scripts/backup-db.sh >> /home/deploy/muse-workspace/data/subhub/backup.log 2>&1

set -euo pipefail

CONTAINER="${CONTAINER:-subhub}"
DATA_DIR="${DATA_DIR:-/app/data}"   # path INSIDE the container
KEEP_DAYS="${KEEP_DAYS:-7}"

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${DATA_DIR}/backups/subhub-${STAMP}.db"

docker exec "$CONTAINER" mkdir -p "${DATA_DIR}/backups"

docker exec "$CONTAINER" node -e '
const Database = require("/app/node_modules/better-sqlite3");
const source = process.argv[1];
const dest = process.argv[2];
const db = new Database(source, { readonly: true });
db.backup(dest)
  .then(() => {
    console.log("backup ok -> " + dest);
    process.exit(0);
  })
  .catch((err) => {
    console.error("backup failed: " + err.message);
    process.exit(1);
  });
' "${DATA_DIR}/subhub.db" "$DEST"

# Prune backups older than KEEP_DAYS days.
docker exec "$CONTAINER" find "${DATA_DIR}/backups" -type f -name 'subhub-*.db' -mtime "+${KEEP_DAYS}" -delete
echo "retention: kept backups newer than ${KEEP_DAYS} days"
