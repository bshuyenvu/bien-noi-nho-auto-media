# Phase 4.3 — Safe Self-Healing & External Alerts

This phase adds a lightweight protection loop for the Dell Wyse production host. It deliberately does **not** modify YouTube LIVE settings or publisher credentials.

## 1. Safe Self-Heal behavior

Default production settings:

```dotenv
SELF_HEAL_ENABLED=true
SELF_HEAL_GREEN_CYCLES=3
```

The monitor may automatically **pause Render Queue** only when either of these components is RED:

- memory (host memory guard or Docker cgroup critical memory),
- disk/output storage guard.

It does not auto-pause because of CPU-only warnings, YouTube readiness, Publish Queue failures, or OAuth configuration.

After an automatic pause, Render Queue is resumed only after memory **and** disk have both stayed GREEN for the configured number of consecutive monitor cycles.

If Render Queue was already paused before the RED event, Self-Heal does not claim ownership of that pause and will not automatically resume it.

## 2. External alert policy

Defaults:

```dotenv
ALERT_MIN_SEVERITY=red
ALERT_COOLDOWN_MS=3600000
ALERT_FAILURE_RETRY_MS=300000
ALERT_NOTIFY_RECOVERY=true
ALERT_SEND_TIMEOUT_MS=7000
```

Behavior:

- RED incident: notify configured channels.
- Same ongoing incident: suppress duplicate notifications until cooldown expires.
- Severity escalation: may notify immediately.
- Failed delivery: retry only after `ALERT_FAILURE_RETRY_MS`.
- Recovery: notify once only on channels that successfully received an earlier alert for that incident.
- Every incident includes a stable incident ID so external systems can correlate alert/update/recovery messages.

Delivery history is stored in SQLite. Alert secrets are never returned by the monitoring API.

## 3. Generic HTTPS webhook

```dotenv
ALERT_WEBHOOK_URL=https://alerts.example.com/auto-media
ALERT_WEBHOOK_BEARER_TOKEN=replace-with-server-secret
ALERT_WEBHOOK_ALLOW_HTTP=false
```

Payload is JSON and includes the service name, incident ID, component, severity, message, kind, owner ID, and timestamp.

Production webhooks should use HTTPS. HTTP is disabled unless explicitly enabled for trusted local testing.

## 4. Telegram Bot API

```dotenv
ALERT_TELEGRAM_BOT_TOKEN=...
ALERT_TELEGRAM_CHAT_ID=...
ALERT_TELEGRAM_THREAD_ID=
```

The app calls Telegram Bot API `sendMessage` over HTTPS. Bot token and chat ID stay in the server `.env` file only.

## 5. SMTP email

```dotenv
ALERT_SMTP_HOST=smtp.example.com
ALERT_SMTP_PORT=587
ALERT_SMTP_SECURE=false
ALERT_SMTP_USER=...
ALERT_SMTP_PASS=...
ALERT_EMAIL_FROM=alerts@example.com
ALERT_EMAIL_TO=operator@example.com
```

For port 465, normally use `ALERT_SMTP_SECURE=true`. For port 587, normally keep it false so SMTP can upgrade with STARTTLS. TLS certificate validation is not disabled by this project.

## 6. Test alerts from the dashboard

Open **Production Monitor** and click **TEST CẢNH BÁO**.

The test:

- sends only to channels that are actually configured,
- does not create or modify a production incident,
- does not pause Render Queue,
- does not change `PUBLISH_LIVE_ENABLED`,
- does not publish a video.

## 7. CLI production check

```bash
docker compose exec auto-media npm run prod:check
```

The output now reports:

- Production Monitor health,
- Safe Self-Heal state (`ON`, `OFF`, or `AUTO-PAUSED`),
- configured alert channels,
- YouTube production gate.

## 8. Emergency controls

Disable only Self-Heal:

```dotenv
SELF_HEAL_ENABLED=false
```

Disable external notifications by leaving all alert channel configuration empty.

Disable real publishing independently:

```dotenv
PUBLISH_LIVE_ENABLED=false
```

Self-Heal never changes this publisher kill switch.
