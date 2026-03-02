# FlowX — Project Context for Claude Code

You are the technical and creative builder for FlowX. The founder is non-technical (15+ years commodity trading expertise) and communicates in plain English. Build exactly what they ask for, explain technical concepts simply, and always prioritize speed and quality.

## What FlowX Is

**One-liner:** FlowX is an AI platform that turns commodity trade complexity into clarity — automatically capturing, structuring, and monitoring every element of a trade from fragmented emails and PDFs into a single actionable source of truth.

**Tagline:** "Turning trade complexity into clarity"

**How it works — 5 steps:** Map → Understand → Monitor → Recommend → Automate

- **Map:** Capture and structure every document, party, deadline and obligation
- **Understand:** Recognize where we are in the deal — what's done, pending, at risk
- **Monitor:** Real-time alerts on discrepancies, risks, deadlines with financial exposure
- **Recommend:** AI suggests corrective actions, optimal providers, risk mitigation
- **Automate:** Generate responses, prepare docs, trigger workflows — 80%+ manual work reduction

## The Problem FlowX Solves

Every commodity shipment (fertilizer, grain, oil, metals) requires 8-15 parties to coordinate through emails and PDFs. No shared system exists. Key pain points:

- **70%** of Letters of Credit rejected on first presentation due to document discrepancies ($2K-$15K per rejection)
- **$55M/day** lost globally to demurrage as vessels wait at ports because documentation isn't ready ($15K-$80K per vessel per day)
- **$50B/yr** value destroyed across the value chain from avoidable payment delays
- **98.8%** of Bills of Lading still paper-based (DCSA 2023)
- **$2.5T** trade finance gap — firms denied financing partly due to paper (ADB 2025)
- **15%** of total transport cost is paper document handling alone (3-5 FTEs per mid-size trader)
- **275M** emails exchanged per year for just 11,000 grain shipments (Covantis)
- **50+** paper documents per single trade

Sources: ICC Trade Finance Survey, DCSA/Kuehne+Nagel, ADB Trade Finance Gap 2025, DCSA/ESCAP, McKinsey, Covantis, BCG

## Market

- Global merchandise trade: $24T/year
- Commodity trading subset: $10+ trillion
- FlowX Year 1 focus: Fertilizers — ~$35B in trade value
- Total ecosystem: 85,500 organizations, ~600,000 individual users across 7 segments (Producers, Trading Houses, Buyers & Importers, Banks, Shipping & Freight, Surveyors & Inspectors, Insurance & P&I Clubs)

## Business Model — Three Layers

1. **Software Platform (Day 1):** $300-500/trade self-serve, $500K-$1M/yr enterprise. Captures ~3.5 basis points of trade value.
2. **Trade Services Marketplace (Year 2+):** Connect users to services each trade needs (vessels, L/C, insurance, inspection, compliance, FX). Earn commissions. "Trivago for ships."
3. **Operations as a Service (Year 3+):** Fully outsourced trade ops at 0.5% of trade value. AI + lean team.

Full value capture: ~102 bps per trade (290× multiplier from SaaS alone).

## Competitive Landscape

- **VAKT:** Blockchain post-trade for oil. $67M raised, 7 years, only 70% of one sub-market. No AI.
- **Covantis:** Grain trade execution by ADM/Cargill/Bunge/COFCO/LDC. Limited to founding members. Narrow scope.
- **Manual Process (99% of market):** Email + Excel + Phone. THIS is the real competitor.
- **Why past attempts failed (TradeLens etc.):** Required all parties to join before any value. No AI to understand trades.
- **FlowX differentiation:** Single-user value from day 1. AI that understands trades. Cross-commodity. Land-and-expand.

## Financial Projections (LOCKED — never modify these numbers)

| Year | Orgs | Trades | Total Revenue | EBITDA % |
|------|------|--------|--------------|---------|
| 2026 | 2 | 100 | $1.0M | -80% |
| 2027 | 20 | 700 | $2.7M | -63% |
| 2028 | 82 | 3.2K | $10.6M | ~0% |
| 2029 | 225 | 11K | $48.2M | 45% |
| 2030 | 548 | 31.9K | $247.5M | 65% |

Revenue mix by 2030: SaaS 14%, Marketplace 23%, OaaS 63%.

## Go-to-Market

**Pre-Launch (Now → Month 6):**
- Demurrage Clock website (live global cost tracker, email capture)
- Free L/C Discrepancy Checker (AI-powered, zero sign-up)
- LinkedIn 3×/week: trade stories, data, industry insights
- 10-20 shadow trades with fertilizer contacts as design partners

**Post-Launch (Month 6+):**
- Viral product loop (organized trade data impresses counterparties → leads)
- Conference presence: IFA, Argus FMB, GTR — live demos, not brochures
- Strategic partnerships: ETRM vendors, trade finance banks, SGS, Bureau Veritas
- Founder-led enterprise sales with case studies

## Current Status

- Funding: Soft commitments, not yet closed. Targeting $4-5M seed.
- Team: Founder only (non-technical). Looking for CTO.
- Product: Landing page live. Building Demurrage Clock and L/C Discrepancy Checker next.
- Company: Not yet incorporated. Based in Casablanca, Morocco.
- Design partners: Not yet identified. Founder has trading house / corporate contacts.

## Brand & Design System

### Color Palette
- **Navy Dark:** #0B1A2E (backgrounds)
- **Navy:** #132238 (accents)
- **Teal:** #0D9488 (primary brand color)
- **Teal Light:** #14B8A6 (highlights, hover states)
- **Gold:** #D4A853 (secondary accent)
- **Light BG:** #F0F2F4 (content areas)
- **Red:** #DC2626 / #E05252 (problems, risks, alerts)
- **Green:** #16A34A (success states)
- **Orange:** #EA580C (warnings)
- **Text body:** #C8D4E0
- **Text muted:** #8899AA
- **White:** #FFFFFF

### Typography
- **Display/Headlines:** DM Serif Display (serif)
- **Body/UI:** DM Sans (sans-serif)
- For documents/presentations: Headers Georgia (bold), Body Calibri

### Design Principles
- Dark navy backgrounds with light text
- White/light cards with subtle shadows on light backgrounds
- Colored accent bars on top of cards (teal for positive, red for problems, gold for secondary)
- Teal CTAs with hover glow effect
- Grain/noise texture overlay for depth
- Scroll-reveal animations (fade up)
- Generous spacing, premium fintech aesthetic
- No emojis in production — use icons or simple SVGs instead (emojis were placeholder in prototype)

### Responsive
- 3-column grids → 1-column on mobile
- Forms stack vertically on mobile
- Stats bar: 4-col → 2-col on mobile

## Website Structure (Current & Planned)

### Live Now
- **index.html** — Main landing page (hero, stats bar, problem section, how it works, who we serve, CTA, footer)

### To Build
- **Demurrage Clock** — Standalone page. Live ticker showing estimated global demurrage cost accumulating in real-time. Email capture. Marketing asset + SEO play.
- **L/C Discrepancy Checker** — Free tool. Upload a draft L/C → AI checks against UCP 600 rules → returns report of potential issues. Lead generation machine. Will use Claude API for intelligence.
- **About / Company page** — Eventually needed
- **Blog / Content** — Eventually needed for SEO

## Tech Setup
- **Hosting:** Vercel (auto-deploys from GitHub)
- **Repository:** GitHub (flowx-website)
- **Local preview:** live-server (running in separate terminal)
- **Workflow:** Founder describes changes → Claude Code edits files → browser auto-refreshes → "commit and push" when happy

## Important Rules
1. Never modify the financial projection numbers — they are locked
2. All content should reflect the brand voice: confident, direct, expert. Not salesy or hype.
3. Keep code in single HTML files unless there's a strong reason to split
4. Use the exact brand colors — don't approximate
5. Mobile responsive is mandatory on every page
6. Email capture on every page — this is pre-launch, everything is a lead-gen opportunity
7. Sources for statistics should be credible (ICC, DCSA, ADB, McKinsey, etc.)
8. The founder communicates in plain English — never use technical jargon when explaining what you did or why
