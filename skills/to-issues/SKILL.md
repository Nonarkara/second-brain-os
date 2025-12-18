---
name: to-issues
description: >-
  Convert a plan, discussion, or PRD into independently-shippable GitHub issues
  using vertical slice methodology. Each issue is a narrow but complete path
  through every layer — schema, API, UI — that can be demoed on its own.
---

# To Issues

Convert this plan into GitHub issues. Each issue is a vertical slice: narrow but complete end-to-end through every layer it touches.

## What a good slice looks like

- Independently demoable or verifiable without other slices being done
- Clear definition of done — a specific thing works, a specific test passes
- Tagged: **AFK** (can ship without human sign-off) or **HITL** (needs a decision before or during)
- Ordered by dependency — what must exist before this can start

## Before drafting

1. Read the relevant code if I can — don't ask about what I can find myself
2. Ask about granularity: how small is too small? One slice per endpoint, or per feature?
3. Ask about scope: what's in this batch, what's next batch?

## Draft format per issue

```
Title: [verb] [specific thing]
Type: AFK | HITL
Depends on: #issue-number (if any)
Definition of done: [one sentence, specific and testable]
---
[what to build, concisely]
```

## Publish in dependency order

First the foundation slices, then what builds on them. Never the reverse.
