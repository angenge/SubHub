-- 0001: 默认更新周期 6h → 3h + 同步日志记录被跳过（不支持的协议/损坏条目）
-- 本迁移适用于已应用 0000 的现有库（本地 data/subhub.db 与 Cloudflare D1 subhub-db）。

UPDATE subscriptions SET update_interval = 180 WHERE update_interval = 360;
ALTER TABLE sync_logs ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN skipped_detail TEXT;