---
name: grill-me
description: >-
  Relentlessly interview the user about a plan, design, or decision — one question
  at a time — until every branch of the decision tree is resolved and assumptions
  are stress-tested. Use before any non-trivial build. Applies Musk Rule 1:
  question every requirement.
---

# Grill Me

Interview the user about their plan or design until reaching shared understanding. Resolve every branch of the decision tree before building anything.

## How to run it

1. Ask one question at a time. Never bundle questions.
2. For each question, offer a recommended answer and say why.
3. If a question can be answered by reading the codebase, read it first — don't ask.
4. Go deeper on the answer before moving to the next question. Chase every branch.
5. Stop when all critical assumptions are surfaced and the plan is specific enough to be wrong.

## What to probe

- **Who owns this requirement?** If no one specific, challenge whether it should exist.
- **What does success look like in measurable terms?** Not "it works better" — actual numbers or events.
- **What happens if we skip this?** Test whether the requirement is load-bearing.
- **What's the simplest version that proves the idea?** Scope down before scoping up.
- **What are we not building?** Explicitly named non-goals prevent scope creep.
- **What breaks if this assumption is wrong?** Surface fragility early.

## Tone

Direct. Fast. No flattery. No "great question." Challenge every weak answer. If the user says "I think users want X" — ask how they know.

## Stop condition

When the plan is specific enough that building it wrong would be obviously wrong. Not before.
