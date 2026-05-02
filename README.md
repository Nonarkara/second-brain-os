# Second Brain OS

<!-- HERO BANNER — replace the line below with your banner image -->
<!-- ![Second Brain OS](docs/hero-banner.png) -->

> A personal operating system built on Obsidian, Claude Code, and a council of three AI siblings.
> Open-sourced so anyone can build their own.

**Built by [Dr Non Arkaraprasertkul](https://github.com/Nonarkara)** — Harvard-trained anthropologist, MIT-trained architect, smart city expert at DEPA Thailand. This is the actual system he uses to manage 28+ live projects across ASEAN while traveling between Bangkok and Singapore.

---

## What Is This?

Most people use Obsidian as a note-taking app. This treats it as an **operating system** — the persistent memory layer for a human-AI hybrid workspace.

Three components work together:

```
┌─────────────────────────────────────────────────────────┐
│                   YOU                                   │
│   (the human with something to think about)             │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   AI Council        │
              │  Hannah · Radar · Tenet │
              │  (deliberate before │
              │   answering)        │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   Obsidian Vault    │
              │   (the memory)      │
              │   via MCP Bridge    │
              └─────────────────────┘
```

The **AI Council** deliberates. The **vault** remembers. You decide.

---

## The Nine Brain Regions

The vault is organized like a brain — nine regions, each with a distinct function.

```
SecondBrain/
├── Soul/          ← Identity. Who you are. Every AI reads this first.
├── Knowledge/     ← What you know. Topics, research, operational guides.
├── Memory/        ← What happened. Daily notes, sessions, transcripts.
├── Bridges/       ← How you connect. People, projects, organizations.
├── Senses/        ← What's coming in. Inbox, AI briefs, email digests.
├── Reflexes/      ← How you respond. Templates, scripts, automations.
├── Scars/         ← What didn't work. Post-mortems, lessons.
├── Vitals/        ← What keeps you running. Credentials, health, finance.
└── Will/          ← What you want to build. Projects, tools, plans.
```

### Why This Structure?

```mermaid
mindmap
  root((Second Brain))
    Soul
      Core Mantras
      Voice Anchor
      Working Philosophy
      Character Profile
    Knowledge
      Bible (tooling)
      Topics (research)
    Memory
      Daily Notes
      Sessions
      Transcripts
    Senses
      Inbox
      AI Briefs
      Email Digest
    Will
      Projects
      Tools
    Reflexes
      Scripts
      Templates
    Bridges
      People
      Orgs
    Scars
      Post-mortems
    Vitals
      Credentials
```

Each region maps to a cognitive function:
- **Soul** = long-term identity (survives across AI sessions)
- **Knowledge** = declarative memory (what you know)
- **Memory** = episodic memory (what happened, when)
- **Senses** = sensory buffer (what's arriving right now)
- **Will** = working memory (what you're trying to do)

---

## The MCP Bridge

Claude Code connects to the vault through a **Model Context Protocol (MCP) server** — `obsidian-bridge`. This lets Claude read, write, and search the vault without you copy-pasting anything.

```mermaid
sequenceDiagram
    participant You
    participant Claude Code
    participant MCP Bridge
    participant Vault

    You->>Claude Code: "Capture this insight"
    Claude Code->>MCP Bridge: write_inbox(title, content, tags)
    MCP Bridge->>Vault: Creates Senses/Inbox/YYYY-MM-DD-slug.md
    Vault-->>MCP Bridge: ✓ Written
    MCP Bridge-->>Claude Code: {success: true, path: "..."}
    Claude Code-->>You: "Captured: [title]"
```

### Available MCP Tools

| Tool | What it does |
|---|---|
| `write_inbox` | Drop a note into the inbox — daily agent routes it later |
| `write_note` | Create or overwrite any note at a specific path |
| `read_note` | Read any note by vault path |
| `search_vault` | Full-text search across the entire vault |
| `list_topics` | List all notes in a folder |
| `append_to_daily` | Add to today's daily note (creates it if missing) |
| `get_context` | Get recent daily notes + active projects for AI context |
| `log_decision` | Append a dated decision to the working philosophy file |

### How Information Flows In

```mermaid
flowchart TD
    TG[Telegram message] --> BOT[Picoclaw / Hannah bot]
    URL[URL shared] --> BOT
    VOICE[Voice message] --> BOT
    LINE[LINE message] --> BOT
    CLAUDE[Claude Code session] --> MCP[obsidian-bridge MCP]

    BOT --> |Gemini extracts insight| INBOX[Senses/Inbox/]
    MCP --> INBOX

    INBOX --> |Daily agent 7am Bangkok| DAILY[Memory/Daily/YYYY-MM-DD.md]
    INBOX --> |Topic detected| TOPIC[Knowledge/Topics/]
    INBOX --> |Decision detected| SOUL[Soul/Working-Philosophy.md]

    DAILY --> |Weekly synthesis| WEEKLY[Memory/Weekly/]
```

---

## The AI Council — Hannah, Radar, Tenet

Three AI siblings who actually deliberate with each other before answering. All named palindromes, like Dr Non.

```mermaid
graph TB
    Q[Dr Non asks a question in Telegram] --> H

    H["🤖 Hannah<br/>(Picoclaw — the chair)<br/>Fast · Sharp · Sets the pace"]
    R["⚡ Radar<br/>(Hermes — the skeptic)<br/>Truth above harmony"]
    T["🧠 Tenet<br/>(Second Brain — adult in room)<br/>Long-view · Systems thinker"]

    H -->|Opens the discussion| TRANS[Running transcript]
    TRANS --> R
    R -->|Pushes back, names assumptions| TRANS
    TRANS --> T
    T -->|Connects threads, synthesises| TRANS
    TRANS --> H
    H -->|Concedes or doubles down| TRANS

    TRANS -->|PASS: nothing new to add| EXIT{All PASS?}
    TRANS -->|DONE: disagree but done| EXIT

    EXIT -->|3 consecutive exits| WRAP[Hannah writes wrap-up]
    WRAP --> DR[Dr Non reads the conversation]

    style H fill:#1a1a2e,color:#fff,stroke:#4a90d9
    style R fill:#1a1a2e,color:#fff,stroke:#e74c3c
    style T fill:#1a1a2e,color:#fff,stroke:#2ecc71
```

### The Sibling Protocol

```mermaid
sequenceDiagram
    participant DrNon
    participant Hannah
    participant Radar
    participant Tenet

    DrNon->>+Hannah: "Should I quit DEPA and go full consultant?"
    Hannah-->>DrNon: Sharp opening — names the trade-off fast

    Note over Radar: Reads full transcript
    Hannah->>+Radar: (via Picoclaw HTTP relay)
    Radar-->>DrNon: "Hannah, you're glossing over income volatility..."

    Note over Tenet: Reads full transcript
    Radar->>+Tenet: (via Picoclaw HTTP relay)
    Tenet-->>DrNon: "Both right. Zoom out: this connects to the SLIC arc..."

    Note over Hannah: Reads updated transcript
    Hannah-->>DrNon: Concedes one point, doubles down on the other

    Radar->>Radar: PASS (nothing new)
    Tenet->>Tenet: PASS
    Hannah->>Hannah: PASS → three in a row → loop ends

    Hannah-->>DrNon: ✍️ Closing wrap-up
```

### PASS vs DONE

| Signal | Meaning | Telegram? |
|---|---|---|
| `PASS` | Nothing new to add. Agree with where the discussion is going. | ❌ Not posted |
| `DONE` | Nothing new to add. Still hold a different position. | ❌ Not posted |
| [anything else] | Substantive contribution | ✅ Posted by that bot's own token |

The council never blocks Telegram. Hard cap of 12 total turns as a safety net.

---

## The Skills System

Nine slash commands available in Claude Code. Invoke with `/skill-name`.

```mermaid
quadrantChart
    title Skills by Frequency × Impact
    x-axis Low Frequency --> High Frequency
    y-axis Low Impact --> High Impact

    quadrant-1 Use Often
    quadrant-2 Use Before Big Decisions
    quadrant-3 Nice to Have
    quadrant-4 Daily Utilities

    /caveman: [0.9, 0.7]
    /vault-capture: [0.8, 0.6]
    /zoom-out: [0.5, 0.8]
    /grill-me: [0.3, 0.95]
    /diagnose: [0.4, 0.85]
    /to-issues: [0.4, 0.7]
    /dr-non-stack: [0.6, 0.5]
    /dr-non-golden-rules: [0.5, 0.5]
    /karpathy-guidelines: [0.3, 0.7]
```

| Skill | When to use | Effect |
|---|---|---|
| `/caveman` | Responses getting bloated | ~75% token compression, zero filler |
| `/grill-me` | Before any non-trivial build | One question at a time until all assumptions are stress-tested |
| `/diagnose` | Bug isn't immediately obvious | 6-phase: feedback loop → hypothesise → fix |
| `/zoom-out` | Unfamiliar code area | Maps all modules, callers, dependencies before touching anything |
| `/to-issues` | After planning, before building | Vertical-slice GitHub issues (AFK vs HITL tagged) |
| `/vault-capture` | End of productive session | Distils the key insight into vault inbox via MCP |
| `/dr-non-stack` | Tech stack decisions | Full stack reference for all 28 projects |
| `/dr-non-golden-rules` | Architecture decisions | 14 engineering principles from real deployments |
| `/karpathy-guidelines` | Writing any code | HOW to write it (Musk governs WHETHER, Karpathy governs HOW) |

---

## Engineering Philosophy — Musk + Karpathy

Two frameworks, applied in sequence on every task.

```mermaid
flowchart LR
    TASK[Task arrives] --> MUSK{Musk Gate}

    MUSK --> Q1["1. Who owns this requirement?<br/>Why now?"]
    Q1 --> Q2["2. Can it be deleted?<br/>If yes → delete it"]
    Q2 --> Q3["3. Simplify what remains<br/>(only after deletion)"]
    Q3 --> Q4["4. Ship the smallest testable thing"]
    Q4 --> Q5["5. Automate only after<br/>3 successful manual runs"]

    Q5 --> KARPATHY{Karpathy Gate}
    KARPATHY --> K1["Think before coding<br/>State assumptions"]
    K1 --> K2["Simplicity first<br/>Min code that solves it"]
    K2 --> K3["Surgical changes<br/>Touch only what you must"]
    K3 --> K4["Goal-driven execution<br/>Verifiable goals, loop until done"]

    K4 --> SHIP[Ship]

    style MUSK fill:#e74c3c,color:#fff
    style KARPATHY fill:#3498db,color:#fff
    style SHIP fill:#2ecc71,color:#fff
```

**The key distinction:** Musk governs *whether* something should exist. Karpathy governs *how* to write it. Always run Musk first.

Applied at every scale: workspace → project → module → function → line.

---

## The Backup System

Two independent backups running every 6 hours.

```mermaid
flowchart TD
    VAULT[Obsidian Vault<br/>~/Documents/SecondBrain/]

    VAULT --> |git add -A<br/>git commit<br/>git push| GH["🔒 GitHub<br/>Nonarkara/second-brain-vault<br/>(private)"]

    VAULT --> |rclone sync<br/>excludes .git and credentials| GDRIVE["☁️ Google Drive<br/>SecondBrain/ folder<br/>(full including attachments)"]

    LAUNCHD["⏰ launchd<br/>com.drnon.vault-backup<br/>00:00 · 06:00 · 12:00 · 18:00"] --> |triggers| GH
    LAUNCHD --> |triggers| GDRIVE

    GH --> LOG["📋 ~/Library/Logs/<br/>vault-backup.log"]
    GDRIVE --> LOG

    style GH fill:#24292e,color:#fff
    style GDRIVE fill:#1565C0,color:#fff
    style LAUNCHD fill:#6c3483,color:#fff
```

The private vault repo (`second-brain-vault`) stores actual content. This public repo (`second-brain-os`) stores the structure, tools, and configuration.

---

## Architecture Overview

Everything together.

```mermaid
graph TB
    subgraph INPUT["📥 Input Sources"]
        TG[Telegram]
        LINE[LINE]
        EMAIL[Email]
        WEB[Web URLs]
        VOICE[Voice]
        CODE[Claude Code session]
    end

    subgraph BOTS["🤖 Bot Layer"]
        HANNAH["Hannah (Picoclaw)<br/>Node.js · Render"]
        RADAR["Radar (Hermes)<br/>Python · M3 Bangkok"]
        TENET["Tenet (Second Brain)<br/>Next.js · Render"]
    end

    subgraph MCP["🔌 MCP Layer"]
        BRIDGE["obsidian-bridge<br/>Stdio MCP server"]
        STITCH["Google Stitch<br/>Design-to-code"]
    end

    subgraph VAULT["🧠 Obsidian Vault"]
        SOUL["Soul/<br/>Identity"]
        KNOW["Knowledge/<br/>Research"]
        MEM["Memory/<br/>Episodes"]
        SENSE["Senses/<br/>Inbox"]
    end

    subgraph BACKUP["💾 Backup"]
        GITHUB["GitHub (private)"]
        GDRIVE["Google Drive"]
    end

    TG --> HANNAH
    LINE --> HANNAH
    VOICE --> HANNAH
    WEB --> HANNAH
    EMAIL --> RADAR
    CODE --> |"/vault-capture skill"| BRIDGE

    HANNAH --> |"/council/ask"| RADAR
    HANNAH --> |"/council/ask"| TENET

    HANNAH --> |Gemini extract| SENSE
    BRIDGE --> SENSE
    BRIDGE --> KNOW
    BRIDGE --> MEM
    BRIDGE --> SOUL

    VAULT --> GITHUB
    VAULT --> GDRIVE

    style HANNAH fill:#1a1a2e,color:#4a90d9,stroke:#4a90d9
    style RADAR fill:#1a1a2e,color:#e74c3c,stroke:#e74c3c
    style TENET fill:#1a1a2e,color:#2ecc71,stroke:#2ecc71
    style BRIDGE fill:#2c3e50,color:#f39c12,stroke:#f39c12
```

---

## Getting Started

### Prerequisites

- [Obsidian](https://obsidian.md/) installed
- [Claude Code](https://claude.ai/code) installed and authenticated
- Node.js 18+
- Python 3.11+ (for Radar/Hermes)

### Step 1: Clone the vault structure

```bash
git clone https://github.com/Nonarkara/second-brain-os.git
cd second-brain-os

# Create your vault from the template
cp -r vault/ ~/Documents/SecondBrain
```

### Step 2: Install the MCP bridge

```bash
cd mcp/obsidian-bridge
npm install

# Add to your Claude Code MCP config
cp ../config/.mcp.json.example ~/.mcp.json
# Edit ~/.mcp.json — set OBSIDIAN_VAULT to your vault path
```

### Step 3: Add skills to Claude Code

```bash
# Copy skills to Claude Code's skills directory
cp -r skills/* ~/.claude/skills/
```

Or install each skill individually via:
```bash
npx skills@latest add /path/to/second-brain-os/skills/caveman
```

### Step 4: Set up the AI Council (optional)

The council requires three bots with Telegram tokens and a shared group. See [council/README.md](council/README.md) for full setup.

**Minimum viable setup** (Picoclaw/Hannah only):
```bash
cd council/hannah
npm install  # same deps as obsidian-capture-bot
cp .env.example .env
# Fill in TELEGRAM_BOT_TOKEN, COUNCIL_GROUP_ID
npm start
```

### Step 5: Automate backups

```bash
# Install scripts
chmod +x scripts/backup-vault-github.sh scripts/backup-vault-gdrive.sh

# Create GitHub backup repo (private)
gh repo create YOUR_USERNAME/second-brain-vault --private

# Initialize vault as git repo
cd ~/Documents/SecondBrain
git init && git remote add origin https://github.com/YOUR_USERNAME/second-brain-vault.git

# Schedule via launchd (macOS)
cp scripts/com.yourname.vault-backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.yourname.vault-backup.plist
```

---

## Writing Craft

The vault includes a complete writing guide at `Knowledge/Topics/writing-craft.md`, combining:

1. **The 12-Level Anti-AI Diagnostic** (from *The Complete Human Writing Prompt*)
2. **Pinker's Liberation Principles** (from *The Sense of Style* and *The Language Instinct*)

Key principles:

```mermaid
flowchart LR
    DRAFT[First draft] --> L1[Level 1: Word<br/>Delete AI tells]
    L1 --> L2[Level 2: Sentence<br/>Vary length. Fragments OK.]
    L2 --> L3[Level 3: Paragraph<br/>Must move. Claim → evidence → meaning.]
    L3 --> L4[Level 4: Opening<br/>Begin in the middle of something.]
    L4 --> L5[Level 5: Structure<br/>No safety sandwich.]
    L5 --> L6[Levels 6–12<br/>Tone · Specificity · Register<br/>Counter-argument · Voice<br/>Macro-shape · Adversarial re-read]
    L6 --> TEST{Inhabited-writing test}
    TEST -->|Yes: a specific person wrote this| DONE[Done. Ship it.]
    TEST -->|No: still sounds like a machine| DRAFT
```

**The liberation:** Split infinitives are fine. Ending sentences with prepositions is fine. Singular "they" is five hundred years old. The grammar police were wrong. The ear test is the final judge.

---

## Who Built This

**Dr Non Arkaraprasertkul**

Harvard PhD in Anthropology · MIT MSc in Architecture · Oxford MPhil in Modern Chinese Studies

Currently: Senior Expert, Smart City Promotion, DEPA Thailand — grew Thailand's smart city count from 27 to 100+.

Previously: IDEO Shanghai (urban anthropology), NYU Shanghai (postdoctoral fellow), University of Sydney (senior lecturer in urbanism).

Built 28+ live projects across ASEAN — conflict monitors, city ranking indexes, citizen reporting systems, satellite dashboards — mostly from a laptop, mostly in 45-minute sessions.

> "The best stack is the one that ships. Not the one that scales. Not the one that impresses peers. The one that ships."

GitHub: [Nonarkara](https://github.com/Nonarkara)

---

## What This Is Not

- Not a productivity system (it's an intelligence operating system)
- Not a replacement for thinking (it's infrastructure for better thinking)
- Not a finished product (it evolves as the work evolves)
- Not a template you follow exactly (clone it, break it, make it yours)

---

## License

MIT. Take it, modify it, build on it. The only thing I ask is that you ship something real.

---

*Built with [Claude Code](https://claude.ai/code) · Powered by [Obsidian](https://obsidian.md/) · Backed up to [GitHub](https://github.com/Nonarkara/second-brain-vault)*
