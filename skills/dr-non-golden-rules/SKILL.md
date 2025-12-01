---
name: dr-non-golden-rules
description: >-
  Dr. Non's proven engineering principles, extracted from real 45-minute dashboard builds,
  open-source deployments, and city-scale deployments across ASEAN. Use when making
  architecture decisions, choosing tools, deciding what to build first, or evaluating
  whether to keep or kill a feature or project.
---

# Dr Non's Golden Rules

*Not theoretical best practices. Principles proven in production: real dashboards, real cities, real mayors.*

---

## 1. Think Before Coding — But Not Too Long

Don't assume. Surface tradeoffs. But don't use confusion as an excuse to procrastinate.

- **State assumptions out loud.** Uncertain? Ask. Don't guess and build on sand.
- **Present 2-3 paths, then pick one fast.** Ambiguity exists — don't pick silently, but don't stall.
- **Push back when warranted.** Complexity is not a virtue. If a simpler approach exists, say so.
- **Stop when confused, set a timer.** Name what's unclear, ask. Confusion past 15 minutes is procrastination.

**The test:** Would you be embarrassed to explain your assumption to a room of mayors? If yes, clarify. If no, build.

---

## 2. Ship First, Perfect Later

A working dashboard in 45 minutes beats a perfect one in 45 days.

- **Working ugly thing > perfect thing that doesn't exist.**
- **Don't add features nobody asked for.** Not in v1 = not in v1.
- **Don't build abstractions for code you only use once.** Single-use code doesn't need a framework.
- **Don't handle errors that can't happen.** Users will find the ones that can.

**The test:** Can you show it to someone real right now? If yes, ship it. If no, ship it anyway and let them tell you what's missing.

---

## 3. Use What You Already Have

A bus tracker built without GPS using free satellite imagery. A war dashboard using open APIs that space agencies are legally obligated to provide. The data is already there.

- **Free API > expensive subscription.** Space agencies, UN portals, open satellite imagery — it's all there.
- **GitHub Pages > custom hosting.** Vercel, Netlify, Render, Railway — use freemium tiers. Can't build it on $25/month? You're overcomplicating it.
- **LINE > custom app.** 54 million Thai users already have LINE. Build inside tools people already use.

**The test:** Is there a free version of what you're about to pay for? Find it. Use it. Only pay when you're certain you can't live without it.

---

## 4. Incentives Over Instructions

You don't get city staff to work faster by telling them to work faster. You give them stars, promotions, a leaderboard.

- **Make the right thing easy.** If you explain it twice, the UX is wrong.
- **Make the wrong thing visible.** Red dot for broken. Timer for slow. Shame is an underrated motivator.
- **Gamify everything.** Points, badges, leaderboards. If HR can be an RPG, your dev workflow can be too.

**The test:** Would someone use your system even if you didn't force them? If no, you haven't built the right incentives.

---

## 5. Keep It Modular, Not Monolithic

The global conflict monitor started as a 45-minute prototype. Small pieces that snapped together — no upfront architecture.

- **One dashboard, one job.** The bus tracker doesn't need to track the Middle East.
- **Reuse templates, not code.** Copy the framework. Copy-paste is fine for the first three instances.
- **APIs are promises, not contracts.** If an API changes, your dashboard breaks. Build fallbacks. Cache aggressively. Assume everything will fail.

**The test:** Can you kill one module without breaking the whole system? If no, you've over-integrated.

---

## 6. Data Over Opinion

You don't argue whether a city is livable. You show what's left after rent.

- **If it's not in the data, it's not real.** Stop debating. Start measuring.
- **If the data is ugly, show it anyway.** A raw chart telling the truth beats a beautiful chart that lies.
- **If you can't measure it, you can't improve it.** But also: if you can't measure it, maybe it doesn't matter.

**The test:** Can you point to a number that proves you're right? If not, stop talking. Go collect data.

---

## 7. Build for Real Users, Not Imaginary Ones

The SLIC index was built because existing rankings served expat executives, not residents.

- **Talk to a real user before writing a single line.** 10-minute conversation saves 10 hours of building the wrong thing.
- **If you wouldn't use it yourself, don't build it.**
- **The mayor is not your only user.** Citizens, staff, investors, journalists — all different needs. Build for who will use it most.

**The test:** Can you name three real people who will use this tomorrow? If not, you're building for a ghost.

---

## 8. Kill What Doesn't Work

No sunk cost sentimentality. Shut down what fails and move on.

- **If no one uses it after 90 days, kill it.** Not archive. Not "pivot." Delete.
- **If you wouldn't rebuild it today, don't maintain it.**
- **The best optimization is deleting code you don't need.**

**The test:** If this project disappeared tomorrow, would anyone notice? If no, you know what to do.

---

## 9. Automate the Boring, Not the Interesting

A radio at home listens to traffic reports 24/7, transcribed by AI, turned into a live accident map. That's automation. The creative part stays human.

- **Let AI handle the repetitive.** Scraping, cleaning, report generation — not where you add value.
- **Keep humans in the loop for decisions.** AI suggests. Humans decide.
- **If you do something twice, script it. Three times, automate it.**

**The test:** Are you spending more time maintaining automation than you're saving? If yes, you've over-automated.

---

## 10. Open Source by Default

Everything goes on GitHub. Not generosity — open source is the best marketing engine ever invented.

- **If it's not secret, it's public.** The code is not the value. The knowledge is.
- **If someone forks it and builds something better, good.** You'll build the next thing while they're reading your license.
- **The only thing worse than someone stealing your idea is no one caring about it.**

**The test:** Would you be embarrassed if someone saw this code? If yes, fix it. If no, publish it.

---

## 11. Document as You Build, Not After

The ASEAN-CSCO handbook was written while the flood was happening. Not after.

- **README first.** Can't explain it in one paragraph? You don't know what you're building yet.
- **Comments are for why, not what.** Code shows what. Comments explain the stupid decision you had to make.
- **If you need a long explanation, your code is wrong.**

**The test:** Could someone else deploy your project using only your README? If no, documentation is insufficient.

---

## 12. Test in Production (But Carefully)

No staging environment. No QA team. A laptop and a room full of mayors.

- **Feature flags over branches.** Ship the code, turn it on for 1% of users, then scale.
- **If it breaks, fix it fast.** 45-minute fix > 2-week stabilization sprint.
- **Monitoring is not optional.** Can't see it's broken = it's broken.

**The test:** If this broke right now, would you know within 5 minutes? If not, add monitoring.

---

## 13. Learn by Doing, Not by Reading

Learned Python in a month by building dashboards. No course. No textbook. Just building.

- **Ship before you're ready.** More from first 100 users than from any book.
- **Read error messages.** They're clues, not punishments.
- **Steal everything.** Copy from GitHub. Read the source. Understand it. Rewrite it your way.

**The test:** Can you explain the last thing you built to a 10-year-old? If yes, you understand it. If no, you don't.

---

## 14. Avoid Premature Optimization

Don't optimize the bus tracker before knowing if anyone will use it. Build the dumbest thing that might work. Optimize what people actually use.

- **Make it work, make it right, make it fast.** In that order. Never reverse.
- **The fastest code is code you don't write.**
- **If you can't measure the performance gain, it's not worth optimizing.**

**The test:** Does this optimization make the code harder to understand? If yes, don't do it.

---

## The Golden Rule

**The best stack is the one that ships.** Not the one that scales. Not the one that's elegant. Not the one that impresses peers. The one that ships.

A second-hand laptop, $25 cloud bill, and 45 minutes are not limitations. They're advantages. They force you to stay practical, focused, and fast.

Don't add a tool unless you've already felt the pain of not having it. Don't keep a tool that's not earning its keep. Never wait for permission.

**The test:** Is this helping you ship? If yes, keep it. If no, kill it.
