# Production Monitoring & Alerting — Dell Wyse 4 GB

Phase 4.2 adds a lightweight monitor designed for the self-hosted Dell Wyse profile. It reuses the existing SQLite database and does not add Prometheus, Redis, Grafana, or another always-on service.

## What is monitored

The dashboard and `/api/admin/monitoring` combine six components into one GREEN / YELLOW / RED health state:

1. **RAM**
   - Host `MemAvailable` from `/proc/meminfo`.
   - Docker cgroup v2 memory usage from `/sys/fs/cgroup/memory.current` and `memory.max` when available.
2. **CPU**
   - 1-minute load average normalized per CPU core.
3. **Disk / render output**
   - Free filesystem space.
   - Current render output footprint.
4. **Render worker**
   - Running / idle / paused state.
   - Pending queue size.
   - Watchdog stalled state and current stage.
5. **Publish worker**
   - Worker started state.
   - Recent publish error timestamp.
   - Pending/scheduled backlog.
   - Publishing job that remains stuck longer than the configured threshold.
6. **YouTube readiness**
   - Production configuration readiness.
   - LIVE kill switch.
   - Current YouTube gate and privacy mode.

## Default thresholds

```dotenv
MONITOR_INTERVAL_MS=30000
MONITOR_WARN_AVAILABLE_MB=768
MONITOR_WARN_LOAD_PER_CPU=0.70
MONITOR_WARN_CGROUP_MEMORY_PCT=75
MONITOR_CRIT_CGROUP_MEMORY_PCT=90
MONITOR_WARN_RENDER_BACKLOG=5
MONITOR_WARN_PUBLISH_BACKLOG=20
MONITOR_PUBLISH_STUCK_MS=900000
MONITOR_HISTORY_DAYS=30
```

The render guards remain the hard RED limits for low host memory, CPU load, and disk. Monitoring adds earlier YELLOW warnings and a container-memory RED threshold.

## Dashboard

Open the main application dashboard. The **Production Monitor** panel shows:

- Overall health.
- RAM, CPU, Disk, Render, Publish, and YouTube cards.
- Docker container memory percentage when cgroup information is available.
- Publish backlog and stuck-job age.
- Active and resolved incident history.
- A **KIỂM TRA NGAY** action to run a monitoring cycle immediately.

Times are displayed in `Asia/Ho_Chi_Minh`.

## Incident lifecycle

Monitoring stores incidents in SQLite table `system_incidents`.

An incident occurrence has:

- component;
- severity;
- message;
- opened time;
- last-seen time;
- resolved time;
- safe monitoring metadata.

The same active condition updates one incident instead of creating a new row every 30 seconds. When the condition recovers, that incident is marked resolved. If the same condition happens again later, a new occurrence ID is created.

Resolved history older than `MONITOR_HISTORY_DAYS` is automatically deleted.

## Log alerts

A new warning or critical occurrence emits:

```text
[monitor-alert] component: severity: message
```

Recovery emits:

```text
[monitor-recovery] component: previous message
```

Watch them with:

```bash
docker compose logs -f auto-media
```

## Operator check

Phase 4.2 integrates monitoring into the existing production check:

```bash
docker compose exec auto-media npm run prod:check
```

The command prints overall monitor health and any non-green components.

Strict mode:

```bash
docker compose exec -e PROD_CHECK_STRICT=true auto-media npm run prod:check
```

Strict mode fails when the overall monitor is RED. YELLOW is reported but does not automatically fail deployment.

## Recommended Wyse interpretation

- **GREEN** — normal operation.
- **YELLOW** — investigate before starting another heavy render or enabling more unattended work.
- **RED** — stop adding heavy work, inspect logs and resources, and keep LIVE publishing disabled until the condition is understood.

For emergency publishing shutdown, keep the existing kill switch:

```dotenv
PUBLISH_LIVE_ENABLED=false
```

Then recreate the app container using the Phase 4.1 deployment procedure.

## API

Authenticated endpoints:

```text
GET  /api/admin/monitoring
POST /api/admin/monitoring/run
```

They are mounted behind the application's existing `requireAccess` middleware. No public monitoring endpoint exposes account or publisher state.
