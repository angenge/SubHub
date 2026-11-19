#!/usr/bin/env bash
#
# Pull the latest release and redeploy SubHub.
#
#   ./scripts/deploy.sh              # pull origin/main, rebuild, restart
#   ./scripts/deploy.sh v1.0.0       # deploy a specific tag (rollback)
#
# The running revision is stamped into GET /health as "build".
#
# Rollback at any time:
#   git checkout <previous-tag>
#   docker compose up -d --build
#
# Your data lives outside this directory (see SUBHUB_DATA_DIR in .env), so
# switching revisions never touches the database.

set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"

if [ -n "$TARGET" ]; then
  echo "==> checking out $TARGET"
  git fetch --tags origin
  git checkout "$TARGET"
else
  echo "==> pulling latest main"
  git fetch origin
  git pull --ff-only origin main
fi

export SUBHUB_BUILD_ID="$(git rev-parse --short HEAD)"
echo "==> building (SUBHUB_BUILD_ID=$SUBHUB_BUILD_ID)"
docker compose build

echo "==> starting container"
docker compose up -d

echo "==> waiting for health check"
for _ in $(seq 1 18); do
  STATUS="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' subhub 2>/dev/null || echo missing)"
  echo "    status: $STATUS"
  if [ "$STATUS" = "healthy" ]; then
    echo "deploy ok: $SUBHUB_BUILD_ID"
    exit 0
  fi
  sleep 5
done

echo "WARNING: container did not become healthy in time."
echo "  inspect : docker logs --tail 50 subhub"
echo "  rollback: git checkout <previous-tag> && docker compose up -d --build"
exit 1
