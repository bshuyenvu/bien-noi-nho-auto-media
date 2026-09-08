# Wyse Operations — Deploy, Backup, Rollback

Phase 4.1 adds a production deployment workflow for the Dell Wyse profile without committing secrets or automatically overwriting production data during rollback.

## Safety model

Every deploy follows this order:

1. Validate the host, `.env`, Docker Compose and clean tracked Git state.
2. Preserve the currently running image under a timestamped rollback tag.
3. Create a consistent SQLite backup.
4. Fast-forward the production checkout to `origin/main`.
5. Build the new image and label it with the Git revision.
6. Recreate only `auto-media`.
7. Wait for `/health`.
8. Run the in-container production check.
9. If the new service fails after replacement, automatically restore the previous image.

Database backups are **not restored automatically** during image rollback. This avoids deleting valid data written after a deployment. A database restore should be a separate, deliberate recovery action.

## First adoption of Phase 4.1

If the production checkout does not yet contain the Phase 4.1 scripts, update the code once:

```bash
git switch main
git pull --ff-only origin main
```

Then all future application upgrades can use the one-command deployment below.

## One-command production deploy

From the repository root:

```bash
bash scripts/deploy-wyse.sh
```

The script performs backup, pull, build, health validation and rollback protection automatically.

The default health window is 40 attempts x 3 seconds. Override through the server `.env` when needed:

```dotenv
DEPLOY_HEALTH_URL=http://127.0.0.1:8787/health
DEPLOY_HEALTH_RETRIES=40
DEPLOY_HEALTH_SLEEP_SECONDS=3
DEPLOY_STRICT_CHECK=false
DEPLOY_KEEP_ROLLBACK_IMAGES=3
BACKUP_RETENTION_COUNT=7
```

`DEPLOY_STRICT_CHECK=false` is the normal upgrade setting. During deliberate LIVE activation you may set it to `true` so deployment also fails if the production publisher gate is not ready.

## What is backed up

Run a backup at any time with:

```bash
bash scripts/backup-wyse.sh
```

When the app is running, the script streams `sqlite-backup.mjs` into the current container and uses SQLite `VACUUM INTO` to create a consistent online snapshot. This also works when the currently running image predates Phase 4.1.

When the app is stopped, the script copies the database and any WAL/SHM sidecars.

Default backup location:

```text
backups/YYYYMMDDTHHMMSSZ/
```

Each backup contains:

- `auto-media.sqlite` when a database exists;
- WAL/SHM files when an offline copy requires them;
- `metadata.env`;
- `SHA256SUMS`.

The `backups/latest` symlink points to the newest snapshot. Backup directories are ignored by Git.

## Automatic image rollback

Before replacing a running image, deploy creates a tag such as:

```text
bien-noi-nho-auto-media:rollback-20260908T101500Z
```

New images carry the OCI label:

```text
org.opencontainers.image.revision=<git-commit>
```

That lets the deployment state record the revision represented by the rollback image.

If the new container fails health or the production check after service replacement, deploy invokes:

```bash
bash scripts/rollback-wyse.sh --auto
```

The previous image is retagged as `bien-noi-nho-auto-media:current`, the container is recreated without rebuilding, and health is checked again.

## Manual rollback

To manually return to the rollback image recorded by the most recent deployment:

```bash
bash scripts/rollback-wyse.sh
```

The script displays:

- rollback image;
- previous runtime commit;
- retained SQLite backup.

It asks for confirmation before changing the running image.

The rollback does **not** reset the repository working tree and does **not** restore SQLite automatically. The old runtime is provided by the preserved Docker image, while the recorded commit identifies exactly what that image represents.

## Deployment state

Runtime deployment metadata is stored below the ignored `data/` directory:

```text
data/deployments/latest.env
data/deployments/last-success.env
data/deployments/rollback-active.env
```

These files contain image tags, commit hashes and local backup paths, not OAuth secrets.

## First deployment without an old image

If there is no existing `auto-media` image, deployment can still proceed, but automatic image rollback is unavailable for that first boot. A SQLite metadata backup is still created.

After the first successful Phase 4.1 deployment, future images use the stable `bien-noi-nho-auto-media:current` tag and timestamped rollback tags.

## Emergency publishing kill switch

Deployment rollback is separate from the publishing kill switch. To immediately stop real publishing while leaving the application and render pipeline available:

```dotenv
PUBLISH_LIVE_ENABLED=false
```

Then recreate the service:

```bash
docker compose up -d --force-recreate auto-media
```

## Useful checks

```bash
docker compose ps
docker stats --no-stream bien-noi-nho-auto-media
curl -fsS http://127.0.0.1:8787/health
docker compose exec -T auto-media npm run prod:check
docker compose logs --tail=200 auto-media
```

To inspect the source revision embedded in the current image:

```bash
docker image inspect bien-noi-nho-auto-media:current \
  --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

## Secrets rule

Do not add `.env`, credential vault contents, OAuth tokens, SQLite files, deployment state, or backups to GitHub. Phase 4.1 keeps those paths ignored and outside the image build context.
