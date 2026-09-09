# Phase 6.7 — Final Integration & Release Closure

## Definition of Done
- Phase 6.0–6.6 integrated in one runtime path.
- Full CI-equivalent suite passes from clean `npm ci`.
- No dead runtime TypeScript modules; CLI-only entries are explicitly retained.
- No unsupported TikTok/Facebook automatic LIVE path.
- YouTube remains the only production-approved LIVE provider.
- Safe Export Handoff covers non-YouTube manual publishing.
- Docker build is deterministic (`package-lock.json` + `npm ci`) and revision-only rebuilds reuse system/dependency cache.
- Private-first deployment keeps `PUBLISH_LIVE_ENABLED=false` and YouTube `private` unless an operator explicitly activates them.

## Final runtime chain
Source → Language → Fact Engine → Evidence Gate → Claim/Source Matrix → Evidence Review → Durable Review → Render → Artifact Integrity → Content Safety → Provider Capability Gate → YouTube controlled publish OR Safe Export Handoff.

## Release rule
Code completion and deployment are separate from real LIVE activation. Missing OAuth credentials may block LIVE activation but must not block a safe private-first runtime deployment.
