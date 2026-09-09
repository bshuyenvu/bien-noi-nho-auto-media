# Phase 8.1 — ShotCraft Pro Controls

Phase 8.1 extends the lightweight ShotCraft engine without adding Remotion, browser rendering, beat-analysis libraries, or other heavy runtime dependencies.

## Goals

- Make scene duration follow information density rather than text length alone.
- Give numbers, cautions, takeaways, and closing statements more reading/rest time.
- Mark each scene with an explicit story beat and pace.
- Use soft transitions only at meaningful narrative boundaries.
- Preserve deterministic, low-memory FFmpeg rendering on Dell Wyse.

## Story beats

`hook`, `setup`, `evidence`, `explanation`, `human`, `caution`, `takeaway`, `close`.

Each beat receives a deterministic timing multiplier. Evidence, caution, takeaway, and close scenes receive additional timeline budget; hook/setup scenes stay tighter.

## Pacing

Each scene is labeled `brisk`, `steady`, or `deliberate` from its allocated duration. This is review metadata; actual timing is encoded in `startRatio`/`endRatio`, so the existing renderer receives the improved pacing without additional runtime cost.

## Transition policy

`cut` remains the default. `soft-dip` is reserved for structural shifts such as caution, takeaway, or close. Breaking-news mode stays cut-dominant.

## QA additions

ShotCraft QA now records:

- semantic timing completeness
- weighted rest-budget ratio
- maximum consecutive high-energy scenes
- soft-dip count
- recipe diversity
- average shot duration

## Scene Studio

Review cards display camera recipe, story beat, pace, hold ratio, and the planner's reason. Operators can still change image assignment before render.

## Runtime impact

No new production dependency is added. Scene timing is computed before FFmpeg and stored in the existing scene ratios. Phase 8.0 camera recipes and per-scene media credits remain unchanged.

## Definition of Done

- TypeScript build passes.
- ShotCraft v2 semantic pacing smoke passes.
- Scene Studio JavaScript syntax smoke passes.
- Existing production Docker render smoke remains green.
- Full V1 Production acceptance remains green.
- Publishing safety gates are unchanged.
