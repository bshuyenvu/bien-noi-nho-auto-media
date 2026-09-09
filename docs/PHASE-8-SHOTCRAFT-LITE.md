# Phase 8 — ShotCraft Lite

ShotCraft Lite adapts the motion-design methodology of `Vincentwei1021/video-shotcraft` to VietNewsFlow AI's narration/news workflow and Dell Wyse runtime.

## Why Lite instead of embedding Remotion

The upstream project is Apache-2.0 and primarily targets cinematic product promos with Remotion. VietNewsFlow is a low-memory self-hosted newsroom, so Phase 8 keeps the existing FFmpeg renderer and ports the reusable production ideas rather than adding a second heavy render stack.

Upstream inspiration: shot recipe cards, one-primary-motion-per-shot, hold/rest budgeting, stable camera language, restrained transitions, energy curves and explicit visual QA. No upstream audio or demo assets are bundled.

## Runtime contract

- deterministic shot planner (`shotcraft-lite-v1`)
- motion character: professional-trust / calm-care / friendly / energetic
- eight lightweight camera recipes
- no adjacent recipe repetition
- first shot establishes slowly; final shot settles into a hold
- soft-dip is sparse; normal cut is the default
- per-scene media provenance remains intact
- FFmpeg-only production renderer; no Remotion dependency
- existing `motion=off/light/medium/strong` remains the global intensity control

## Camera recipes

`still-hold`, `slow-push`, `slow-pull`, `pan-left`, `pan-right`, `drift-up`, `drift-down`, `diagonal-drift`.

The planner uses story semantics and channel context. Medical/patient stories default to calm-care motion; breaking news may use a higher energy curve but still avoids full-frame shaking.

## Attribution

Methodology adapted from `Vincentwei1021/video-shotcraft`, Copyright 2026 Wei Yihao, licensed under Apache License 2.0. This integration is a clean lightweight implementation for VietNewsFlow and does not redistribute the upstream demo assets, music or SFX.
