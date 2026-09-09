# Phase 6.4 — Unified Provider Capability Registry

## Mục tiêu
Loại bỏ các điều kiện nền tảng bị hard-code rải rác giữa API, worker và frontend.

`src/publish/capabilities.ts` là nguồn sự thật duy nhất cho:
- dry-run support;
- LIVE implementation;
- production approval;
- credential mode;
- release mode;
- per-post consent requirement;
- privacy modes được hỗ trợ.

## Quy tắc V1
- YouTube: LIVE implementation + production-approved, nhưng vẫn chịu Activation/Review/Artifact/Public Ramp gates.
- Facebook: dry-run + Safe Export; LIVE khóa.
- TikTok: dry-run + Safe Export; Direct Post không có trong runtime V1.
