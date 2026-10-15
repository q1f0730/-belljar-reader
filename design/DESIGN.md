# Design System: The Bell Jar Reader

## 1. Visual Theme & Atmosphere
A quiet, gallery-airy reading surface in the spirit of a modern design tool (Google Stitch, Figma): a near-white canvas with a faint dot grid at the edges, the book page floating in the middle as a clean sheet, and all controls living in small floating pill toolbars with soft shadows. Density 3, Variance 5, Motion 6. Calm, precise, contemporary; no paper texture, no vintage ornaments, no drop caps.

## 2. Color Palette & Roles
- **Canvas** (#F7F7F8) — app background, with a 1px dot grid (#E4E4E7) at 20px spacing
- **Sheet** (#FFFFFF) — the reading page surface
- **Ink** (#18181B) — body text and the active-tool circle
- **Muted Steel** (#71717A) — metadata, page numbers, captions
- **Whisper Border** (#E4E4E7) — 1px hairlines and toolbar borders
- **Signal Coral** (#E5484D at 70% saturation) — the single accent: translated-word glosses, highlight dots, focus rings
- Highlighter pastels (only for user highlights): Butter #FBF3DB, Rose #FDEBEC, Sky #E1F3FE, Sage #EDF3EC
- Night mode: Canvas #111113, Sheet #18181B, Ink #EDEDEF

## 3. Typography Rules
- **Reading body (English):** Newsreader, 19px, line-height 1.75, max 66ch per column
- **Reading body (Chinese):** Noto Serif SC / Songti, 0.92em of the English size, letter-spacing 0.02em
- **UI:** Geist, 13px, medium weight for labels
- **Meta / page numbers:** Geist Mono, 12px
- **Banned:** Inter, Garamond, Georgia, small caps running heads, ornaments

## 4. Component Stylings
- **Tool rail:** a vertical floating pill (width 52px, radius 999px, white, 1px whisper border, shadow 0 8px 24px rgba(24,24,27,0.08)) fixed to the left edge, vertically centred. Icons 20px, Phosphor Bold. Active tool = solid Ink circle (36px) with white icon, like Stitch's selected cursor.
- **Translate sub-menu:** clicking the translate icon makes a second small vertical pill spring out of it, to the right, containing three circular buttons labelled 词 / 句 / 全. Items cascade in with 40ms stagger, scale 0.6 → 1 and translateY(-8px → 0), spring (stiffness 300, damping 22). Hover shows a tooltip chip with the mode name.
- **Top bar:** floating pill at top centre: chapter title, page "12 / 240" in Geist Mono, mode chip.
- **Word gloss:** tiny coral Chinese label floating above the word; the active word opens a white dictionary popover (radius 14px, whisper border, soft shadow) with headword, IPA in mono, lemma, definitions.
- **Sentence translation:** Chinese replaces the sentence inline, with a soft coral underline tint and a 300ms blur-to-sharp fade.
- **Highlights:** pastel marker band behind text; hidden-highlight marker = 8px coral-ringed dot with a slow pulse.
- **Panels (contents, highlights, settings):** floating sheets (radius 20px) that slide 12px from the rail, not full-height drawers.

## 5. Layout Principles
Reading sheet centred, max-width 1180px, two columns on wide screens, one below 860px. Generous 64–96px side gutters. Page-turn by horizontal slide. Mobile: rail becomes a bottom floating pill; sub-menu springs upward.

## 6. Motion & Interaction
Spring physics for toolbars and popovers; page turns 420ms cubic-bezier(0.16,1,0.3,1); transform/opacity only; perpetual micro-loop only on hidden-highlight dots; reduced-motion respected.

## 7. Anti-Patterns (Banned)
No emojis, no Inter, no pure black, no neon glows, no gradients on large areas, no vintage paper/ornaments, no drop caps, no full-height dark sidebar, no custom cursors.
