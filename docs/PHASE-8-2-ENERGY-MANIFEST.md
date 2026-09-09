# Phase 8.2 — Energy-aware Camera + Render Manifest

Phase 8.2 connects ShotCraft planning energy to the real FFmpeg camera and adds an auditable sidecar manifest after successful render.

## Energy-aware camera

The global motion level (`off`, `light`, `medium`, `strong`) remains the operator's upper-level control. Each scene's ShotCraft `energy` value then scales the allowed camera amplitude inside that level.

Low-energy evidence, caution, takeaway, and closing scenes therefore move more gently. Higher-energy scenes can move slightly further, while the selected global motion level still bounds the result.

The deterministic helper `shotMotionCap()` clamps scene energy to 0–1 and keeps the output conservative for Dell Wyse.

## Render manifest

After the MP4 render succeeds, the render worker writes a sibling `*-shotcraft.json` file using schema `vietnewsflow.shotcraft-render.v1`.

The manifest records the final frame contract, template, global motion level and each scene's timing, recipe, transition, hold ratio, energy, effective motion cap, and source credit.

The sidecar is created only after the FFmpeg call returns successfully, so a failed encode cannot leave a misleading successful-render manifest.

## Operations

The file name starts with the render job ID, so existing render cleanup removes it together with other job artifacts. No database migration or new production dependency is required.

## CI gates

- ShotCraft v2 planner smoke
- render-manifest schema/effective-cap smoke
- production Docker MP4 render with energy-aware camera assertions
- full existing Wyse/private-first/publish/UI/V1 acceptance suite

## Safety

Phase 8.2 does not change provider capabilities, OAuth, publish scheduling, YouTube privacy, or LIVE/Public gates.
