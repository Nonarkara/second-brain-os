---
name: diagnose
description: >-
  Structured debugging framework for hard bugs and performance regressions.
  Builds a fast feedback loop first, then hypothesises, then fixes.
  Use when a bug is not immediately obvious.
---

# Diagnose

Six phases. In order. Don't skip to Phase 3 because you think you know the answer.

## Phase 1 — Build a feedback loop (this is the skill)

If you have a fast, deterministic, runnable pass/fail signal for the bug, you will find the cause. Build this first.

Options:
- Failing test that reproduces the bug
- Script that triggers the failure
- Minimal reproduction case

The loop is the product. Make it fast. Make it deterministic. A slow or flaky loop is worse than no loop.

## Phase 2 — Reproduce

Confirm the bug appears in the loop. Confirm it matches the actual reported problem, not a neighboring symptom.

## Phase 3 — Hypothesise

Generate 3–5 ranked hypotheses. Each must be falsifiable — a specific prediction that the next step will either confirm or deny. Share the list before testing. Domain knowledge often reorders priorities.

## Phase 4 — Instrument

Map each probe to a specific hypothesis. For performance regressions: measure first, log second. Logs are usually wrong.

## Phase 5 — Fix + regression test

Write the test before the fix. Fix at the seam where the real bug pattern can be replicated. Don't patch symptoms.

## Phase 6 — Cleanup

Verify the original scenario no longer fails. Remove all debug instrumentation. One-paragraph post-mortem: what was the root cause, what made it hard to find, what would have caught it earlier.

## If no test seam exists

Flag it as a separate finding. The missing seam is a bug too.
