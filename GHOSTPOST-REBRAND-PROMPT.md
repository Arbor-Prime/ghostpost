# GhostPost Complete UI Rebrand — Exhaustive Prompt

## READ THIS ENTIRE DOCUMENT BEFORE WRITING A SINGLE LINE OF CODE

You are rebranding the entire GhostPost frontend application. The codebase is a React SPA located at `/opt/ghostpost/client/src/`. There are 14 screens, 4 shared components, 1 global CSS file, and 14 static HTML design reference files. Every single file must be updated to match the new design language.

## REFERENCE SITES

The new design language is defined by two reference points:
1. **The GhostPost marketing site** at https://ghostpost-marketing-website-design.vercel.app/ — this is the PRIMARY design reference. Every decision should start here.
2. **Manus AI** at https://manus.im — this is the SECONDARY reference for layout patterns, whitespace philosophy, and interaction style.

## WHAT IS CHANGING

The current GhostPost app uses a "nuclear glassmorphism" dark-mode-first design with complex shadows, frosted glass cards, blue-purple gradient accents, DM Sans + JetBrains Mono typography, Font Awesome coloured icons, and heavy visual effects. ALL of this is being stripped out and replaced with a clean, light-theme, editorially restrained design that matches the marketing site.

This is not a tweak. It is a complete visual rebuild of every surface the user sees.

---

## GLOBAL DESIGN SYSTEM

### Typography
- **Font family**: Figtree from Google Fonts — load via `<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">`
- Figtree is the ONLY font used anywhere. There is NO secondary font. There is NO monospace font. There is NO serif font.
- Remove ALL references to `DM Sans`, `JetBrains Mono`, `var(--font-sans)`, and `var(--font-mono)` across every file.
- Where the old design used monospace for data, counters, timestamps, or code-like text, use Figtree at a slightly smaller size (typically 1px smaller) in a muted colour to differentiate. NEVER use a different typeface.
- CSS variable: `--font-sans: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`
- Remove `--font-mono` entirely. Replace every usage of `var(--font-mono)` or `font-family: 'JetBrains Mono'` with `var(--font-sans)`.
- Weight usage: 400 (body text, descriptions), 500 (secondary labels, metadata), 600 (sub-headings, button text, nav labels), 700 (section headings, card titles), 800 (page titles, hero text only).
- Letter-spacing: -0.02em on headings (700, 800), -0.01em on sub-headings (600), 0 on everything else.
- Class `.font-mono` must be removed from every JSX file and from the CSS. Replace with appropriate Figtree styling.

### Colour Palette — Light Theme ONLY

Remove ALL dark theme CSS. Remove the `[data-theme="dark"]` block entirely. Remove the theme toggle from the Sidebar. GhostPost is now light theme only.

**CSS Custom Properties (replace the entire `:root` block):**
```css
:root {
  /* Backgrounds */
  --bg-app: #f8f8fa;           /* Page background — very light warm grey */
  --bg-card: #ffffff;           /* Card/panel background — pure white */
  --bg-card-solid: #ffffff;     /* Same as bg-card, no transparency */
  --bg-sidebar: #ffffff;        /* Sidebar background — white */
  --bg-surface: #f3f4f6;       /* Inset surfaces, input fields, code blocks */
  --bg-hover: #f5f5f7;         /* Hover state for interactive elements */

  /* Borders */
  --border-card: #e5e7eb;      /* Card borders — light grey */
  --border-subtle: #e5e7eb;    /* Subtle dividers — same as card */
  --border-focus: #C9A84C;     /* Focus ring — gold accent */

  /* Shadows — minimal, no glassmorphism */
  --shadow-card: 0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02);
  --shadow-card-hover: 0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03);
  --shadow-glow: none;         /* Remove ALL glow effects */

  /* Text */
  --text-primary: #111111;     /* Near-black, warm */
  --text-secondary: #555555;   /* Medium grey for descriptions */
  --text-dim: #999999;         /* Light grey for metadata, timestamps */
  --text-placeholder: #bbbbbb; /* Input placeholders */

  /* Accent — Gold (used SPARINGLY) */
  --accent-gold: #C9A84C;
  --accent-gold-dim: #9e7d2e;
  --accent-gold-bg: rgba(201,168,76,0.08);
  --accent-gold-border: rgba(201,168,76,0.15);

  /* Functional colours */
  --accent-blue: #3b82f6;     /* Links, active states, interactive elements */
  --accent-green: #22c55e;    /* Success, connected, positive */
  --accent-red: #ef4444;      /* Errors, disconnected, destructive */
  --accent-amber: #eab308;    /* Warnings, pending */
  --success: #22c55e;
  --error: #ef4444;
  --warning: #eab308;

  /* Brand — NO gradient */
  --gradient-brand: #C9A84C;   /* Replace gradient with flat gold — used only for logo mark and primary CTA buttons */

  /* Radii — slightly smaller, cleaner */
  --radius-card: 12px;
  --radius-button: 8px;
  --radius-pill: 20px;
  --radius-input: 8px;

  /* Font */
  --font-sans: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

### Remove These CSS Patterns Everywhere
- `backdrop-filter: blur(...)` — remove from every element
- `background: rgba(255, 255, 255, 0.45)` or any translucent white — replace with `#ffffff`
- `background: rgba(255, 255, 255, 0.04)` or any translucent dark — replace with `#ffffff`
- `box-shadow` with more than 2 layers or containing `rgba(59,130,246` (blue glow) or `rgba(139,92,246` (purple glow) — replace with `--shadow-card`
- `var(--gradient-brand)` when used as a `background` on anything other than the logo mark — replace with `var(--accent-gold)` or `#111111` depending on context
- `inset` shadows — remove all
- Any animation with `glow`, `shimmer`, `pulse-glow` — remove
- `.glass-card` class — replace all usages with a clean card style: `background: var(--bg-card); border: 1px solid var(--border-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card);`
- `.ghost-gradient-text` — remove the gradient text effect. Replace with either `color: var(--accent-gold)` or `color: var(--text-primary)` depending on context.

---

## ICONS — CRITICAL

**The user mandate is: "WE USE MONOCHROME BRANDED ICONS ONLY EVER"**

The current codebase uses Font Awesome coloured icons everywhere (`<i className="fa-solid fa-ghost">`, `fa-solid fa-table-columns`, etc.). These must ALL be replaced with monochrome SVG icons.

**Icon system**: Use Lucide icons (https://lucide.dev). They are clean, monochrome, stroke-based, and consistent. Import them as React components:
```jsx
import { LayoutDashboard, Compass, CheckSquare, Users, Drama, Sparkles, FlaskConical, Settings, Mic, Link, Target, Eye, Brain, Monitor, Clock, PenTool, Shield, BarChart3, Bell, Sun, Moon, ChevronLeft, ChevronRight, Plus, X, Search, Send, Paperclip, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
```

**Install**: `npm install lucide-react`

**Icon sizing**: 18px for sidebar nav, 16px for inline icons, 14px for small metadata icons, 20px for card header icons.

**Icon colour**: `var(--text-secondary)` default, `var(--text-primary)` on hover/active, `var(--accent-gold)` for the active sidebar item icon only.

**Remove**: Every `<i className="fa-solid ...">` and `<i className="fa-regular ...">` and `<i className="fa-brands ...">` from every JSX file. Replace with the equivalent Lucide icon component.

**Mapping** (Font Awesome → Lucide):
- `fa-table-columns` → `<LayoutDashboard />`
- `fa-compass` → `<Compass />`
- `fa-check-to-slot` → `<CheckSquare />`
- `fa-users-viewfinder` → `<Users />`
- `fa-masks-theater` → `<Drama />`
- `fa-wand-magic-sparkles` → `<Sparkles />`
- `fa-flask` → `<FlaskConical />`
- `fa-gear` → `<Settings />`
- `fa-ghost` → Replace with the gold "G" logo mark (a 24x24 div with border-radius 6px, background linear-gradient(135deg, #C9A84C, #9e7d2e), white bold "G" text centred inside)
- `fa-microphone` → `<Mic />`
- `fa-link` → `<Link />`
- `fa-bullseye` / `fa-crosshairs` → `<Target />`
- `fa-eye` → `<Eye />`
- `fa-brain` → `<Brain />`
- `fa-desktop` / `fa-display` → `<Monitor />`
- `fa-clock` → `<Clock />`
- `fa-pen` / `fa-pencil` → `<PenTool />`
- `fa-shield` → `<Shield />`
- `fa-chart-bar` / `fa-chart-simple` → `<BarChart3 />`
- `fa-bell` → `<Bell />`
- `fa-sun` → `<Sun />`
- `fa-moon` → `<Moon />`
- `fa-chevron-left` → `<ChevronLeft />`
- `fa-chevron-right` → `<ChevronRight />`
- `fa-plus` → `<Plus />`
- `fa-xmark` / `fa-times` → `<X />`
- `fa-search` / `fa-magnifying-glass` → `<Search />`
- `fa-paper-plane` → `<Send />`
- `fa-paperclip` → `<Paperclip />`
- `fa-play` → `<Play />`
- `fa-pause` → `<Pause />`
- `fa-backward` → `<SkipBack />`
- `fa-forward` → `<SkipForward />`
- `fa-check-circle` → `<CheckSquare />` or a simple `✓` character
- `fa-circle-xmark` → `<X />` or a simple `✕` character
- `fa-circle-info` → Use a simple info style (text or minimal icon)
- `fa-brands fa-x-twitter` → Use the text "X" styled in a 20x20 circle, or a simple monochrome X icon
- `fa-code` → `<Code />`
- `fa-mug-hot` → `<Coffee />`
- `fa-briefcase` → `<Briefcase />`
- `fa-burger` → Use `<UtensilsCrossed />` or similar food icon
- `fa-couch` → Use `<Sofa />` from Lucide

**Toast icons**: Replace Font Awesome toast icons with Lucide equivalents. Success toast: `<CheckCircle2 />`. Error toast: `<XCircle />`. Info toast: `<Info />`.

Also remove the Font Awesome CSS link from `client/public/index.html` — the `<link>` tag that loads the Font Awesome kit.

---

## COMPONENT-BY-COMPONENT REBRAND

### 1. `index.css` (742 lines — COMPLETE REWRITE)

Replace the entire file. The new CSS must:
- Remove ALL dark theme variables and `[data-theme="dark"]` block
- Remove ALL `.glass-card`, `.glass-sidebar`, `.ghost-gradient-text` classes
- Remove ALL keyframe animations related to glow, shimmer, pulse-glow
- Keep structural animations: `fadeIn`, `slideIn`, `pulse-dot` (for live indicators)
- Replace all colour values with the new CSS custom properties defined above
- Replace `--font-mono` usage with `--font-sans`
- Replace all complex shadow values with `--shadow-card`
- Replace all glassmorphic backgrounds with solid `--bg-card`
- Replace all `border-radius: 16px` with `var(--radius-card)` (12px)
- Replace all `border-radius: 12px` on buttons with `var(--radius-button)` (8px)
- The `.toast` classes should use solid white background, 1px border, no blur
- The `.toggle` component should use gold accent when active (`--accent-gold`)
- The `.modal-overlay` should use `rgba(0,0,0,0.3)` (lighter) not `rgba(0,0,0,0.6)`
- Remove the `@keyframes pulse-glow` and any shimmer/glow animations
- Keep `@keyframes pulse-dot` for live status indicators

### 2. `components/Sidebar.jsx` (260 lines — MAJOR REWORK)

Current: 72px wide icon-only sidebar with glassmorphic background, gradient active states, coloured Font Awesome icons, theme toggle at bottom.

New design:
- Width: 220px (expanded sidebar with icon + text label, like Manus's left panel)
- Background: `var(--bg-sidebar)` (#ffffff)
- Border-right: `1px solid var(--border-card)` (#e5e7eb)
- No backdrop-filter, no blur, no transparency
- Logo at top: The gold "G" square mark (24x24, border-radius 6px, gradient #C9A84C → #9e7d2e, white "G" inside) + "GhostPost" text in Figtree 14px weight 700 colour #111111. Padding 20px horizontal, 16px vertical.
- Nav items: Each item is a horizontal row containing a Lucide icon (18px, stroke-width 1.5) + text label in Figtree 13.5px weight 500. Height: 36px. Padding: 8px 16px. Border-radius: 8px. Margin: 2px 12px (so items have horizontal padding from sidebar edges).
- Default state: icon colour `var(--text-dim)` (#999), text colour `var(--text-secondary)` (#555).
- Hover state: background `var(--bg-hover)` (#f5f5f7), icon colour `var(--text-secondary)`, text colour `var(--text-primary)`.
- Active state: background `var(--accent-gold-bg)` (rgba(201,168,76,0.08)), icon colour `var(--accent-gold)` (#C9A84C), text colour `var(--text-primary)` (#111), font-weight 600. Left border accent: 2px solid `var(--accent-gold)` on the left edge of the item.
- Approval badge: Small gold pill showing pending count (e.g. "3"), background `var(--accent-gold)`, colour white, font-size 10px, weight 700, padding 1px 6px, border-radius 10px. Positioned to the right of the label text.
- Remove theme toggle entirely (no dark mode)
- Bottom of sidebar: A small "System" status indicator — a 6px green dot + "Online" text in 11px Figtree weight 500, colour `var(--text-dim)`. Padding 16px.
- No tooltip popovers needed (labels are visible)
- Mobile: Sidebar collapses to 56px wide, showing only icons (no labels). Active state uses gold background tint only.

### 3. `components/Header.jsx` (complete — RESTYLE)

Current: Transparent header with clock, live indicator, notification bell.

New design:
- Height: 56px
- Background: `var(--bg-card)` (#ffffff)
- Border-bottom: `1px solid var(--border-card)`
- Left: Page title in Figtree 18px weight 700 colour `var(--text-primary)`. No subtitle.
- Right: Live connection indicator (6px dot + "LIVE" or "OFFLINE" in Figtree 11px weight 600), clock in Figtree 12px weight 500 colour `var(--text-dim)` with background `var(--bg-surface)` padding 4px 10px border-radius 6px, notification bell as Lucide `<Bell />` icon in 16px `var(--text-dim)` inside a 32x32 button with `var(--bg-surface)` background border-radius 8px.
- Remove all glassmorphic styling.

### 4. `components/OnboardingLayout.jsx` — If it exists, restyle to white background, centred content, same Figtree typography.

### 5. `components/LogoHeader.jsx` — Replace ghost icon with the gold "G" square mark + "GhostPost" text.

---

## SCREENS — ALL 14

### 6. `screens/Welcome.jsx`
- Remove background glows (`glowTopRight`, `glowBottomLeft`)
- Replace ghost icon logo with gold "G" mark
- Replace `.ghost-gradient-text` with `color: var(--accent-gold-dim)` (#9e7d2e)
- Background: `var(--bg-app)` (#f8f8fa), centred content
- "Before we set anything up, I need to get to know you." — heading in Figtree 32px weight 700 colour `var(--text-primary)`, the highlight phrase in `var(--accent-gold-dim)`
- List items: Clean white cards with 1px border, Lucide icons in `var(--text-dim)`, padding 20px, border-radius 12px
- CTA button: Background `var(--accent-gold)`, colour white, Figtree 14px weight 600, padding 12px 28px, border-radius 8px
- Remove all gradient backgrounds and glow effects

### 7. `screens/Recording.jsx`
- Microphone visualisation: Keep the waveform but restyle — the recording circle should be a clean bordered circle (1px solid `var(--border-card)`) with a gold pulsing ring when recording (`--accent-gold` border, subtle shadow)
- Prompts: Figtree 16px weight 400 colour `var(--text-secondary)`, centred
- Timer: Figtree 24px weight 700 colour `var(--text-primary)`
- Buttons: Consistent with new button styles — primary gold, secondary outlined
- Background: White, no gradients

### 8. `screens/Processing.jsx`
- Steps list: Each step is a row with a Lucide icon (16px), text in Figtree 14px, and a checkmark or spinner
- Completed steps: Green check `<CheckCircle2 />`, text in `var(--text-primary)`
- Active step: Gold spinner/pulse, text in `var(--accent-gold)`
- Pending steps: Grey, text in `var(--text-dim)`
- Progress bar: Background `var(--bg-surface)`, fill `var(--accent-gold)`, height 4px, border-radius 2px
- No gradient, no glow, no glass

### 9. `screens/VoiceProfile.jsx`
- Card style: White background, 1px border `var(--border-card)`, border-radius 12px, shadow `var(--shadow-card)`
- Sliders: Track in `var(--bg-surface)`, thumb in `var(--accent-gold)`, filled track in `var(--accent-gold)`
- Topic bubbles: Background `var(--bg-surface)`, border 1px solid `var(--border-card)`, text `var(--text-primary)`, Figtree 13px weight 500
- Signature words: Gold-tinted background `var(--accent-gold-bg)`, gold border `var(--accent-gold-border)`, gold text
- Anti-words: Red-tinted background `rgba(239,68,68,0.06)`, red text
- Emotion bars: Fill colour `var(--accent-gold)`, background `var(--bg-surface)`
- Confirm button: Gold CTA

### 10. `screens/PersonaSchedule.jsx`
- Timeline visualisation: Clean bordered bars on a white background. Each persona block is a coloured bar BUT the colours should be muted/pastel versions, not saturated
- Persona cards: White cards with 1px border, Lucide icons (monochrome), text in Figtree
- "Quick adjust" buttons: Outlined buttons with 1px border, Lucide icons
- Sleep pattern stripe: Keep but use `var(--bg-surface)` as base
- Remove saturated colours — use muted tints: instead of `#f472b6` use `rgba(244,114,182,0.15)` for backgrounds, keep `#f472b6` for small accent dots only

### 11. `screens/XAuth.jsx`
- X icon: Monochrome "X" text in a circle, not `fa-brands fa-x-twitter`
- Input fields: Background `var(--bg-surface)`, border 1px solid `var(--border-card)`, border-radius 8px, Figtree 14px, focus border `var(--accent-gold)`
- Connect button: Gold CTA
- Status badges: Connected = green dot + "Connected" text; Expired = amber dot + "Expired"
- Info boxes: White background, 1px border, Lucide `<Info />` icon in `var(--text-dim)`

### 12. `screens/Dashboard.jsx`
- Stat cards: White background, 1px border, border-radius 12px. Number in Figtree 28px weight 700. Label in Figtree 12px weight 500 colour `var(--text-dim)`.
- Charts (recharts): Use `var(--accent-gold)` as primary chart colour, `var(--accent-blue)` as secondary. Grid lines in `var(--border-card)`. Background white.
- Activity feed: Each item is a clean row with Lucide icon, text in Figtree, timestamp in `var(--text-dim)` right-aligned.
- Current persona indicator: Small card with Lucide icon (monochrome), persona name in Figtree 14px weight 600, mood in 12px `var(--text-secondary)`
- Live events from socket: Clean text entries, no heavy styling. Green dot for live indicator.
- Remove all glass card styling from stat panels.

### 13. `screens/BrowserView.jsx`
- This is the Manus-style two-panel view. Match the layout from the marketing site demo section exactly.
- Left panel: Action log with small icon circles (16px, background `var(--bg-surface)`, monochrome Lucide icons or single-character symbols), text in Figtree 12.5px. Progress lines in `var(--text-dim)`.
- Right panel: Browser viewport with address bar, navigation buttons, URL field. Same layout as marketing site demo.
- Status bar at bottom: Progress bar, page counter, green "live" badge.
- Input bar at bottom of left panel: 1px border, border-radius 10px, Lucide `<Paperclip />` icon, placeholder "Message GhostPost" in Figtree 13px.
- Replace all scan log entries to use the clean dot + text pattern from the marketing site action log.
- Remove the `ScanLogEntry` component's coloured verdict badges — replace with minimal text indicators.

### 14. `screens/Approvals.jsx`
- Draft cards: White background, 1px border, border-radius 12px. Tweet content in Figtree 14px, reply draft in Figtree 14px weight 500, metadata (author, time, word count) in Figtree 12px `var(--text-dim)`.
- Action buttons: Approve = outlined green button with `<CheckCircle2 />`. Reject = outlined red button with `<X />`. Edit = outlined grey button with `<PenTool />`. Regenerate = outlined gold button with `<Sparkles />`.
- Status pills: Pending = gold background, approved = green background, rejected = red background. All with white text, Figtree 11px weight 600, border-radius 20px.
- Tweet preview: Clean card embed style — author avatar placeholder (grey circle), handle in `var(--text-dim)`, content in `var(--text-primary)`.
- Modals: White background, border-radius 12px, shadow `0 20px 60px rgba(0,0,0,0.1)`. Overlay `rgba(0,0,0,0.3)`.

### 15. `screens/TrackedProfiles.jsx`
- Profile cards: White background, 1px border. Profile handle in Figtree 15px weight 600. Stats (tweets scanned, opportunities found) in Figtree 13px `var(--text-secondary)`. Last scanned timestamp in `var(--text-dim)`.
- Priority indicator: Small gold dot for high priority, grey for normal.
- Add profile button: Outlined with `<Plus />` Lucide icon.
- Scan button: Gold CTA per card with `<Play />` icon.
- Remove all coloured backgrounds on profile cards.

### 16. `screens/Personas.jsx`
- Persona blocks: White cards, 1px border. Persona name in Figtree 15px weight 600, time range in `var(--text-dim)`, description in `var(--text-secondary)`.
- Energy level: Thin horizontal bar, `var(--bg-surface)` background, fill in `var(--accent-gold)`.
- Mood indicator: Text only — e.g. "Focused · 8/10 energy" in Figtree 12px `var(--text-secondary)`.
- Circadian timeline: Clean horizontal bar visualisation. Blocks use muted pastel fills corresponding to mood, not saturated colours. Labels below in Figtree 10px.
- Remove the `MOOD_CONFIG` coloured icons — replace with monochrome Lucide icons.

### 17. `screens/AIComposition.jsx`
- Content themes: Clean horizontal bar chart, bars filled with `var(--accent-gold)` (primary), `var(--accent-blue)` (secondary). Labels in Figtree 13px.
- Heatmap: Use `var(--accent-gold)` opacity scale (0.1 to 1.0) instead of blue/green/amber. Background `var(--bg-surface)`.
- Draft generation controls: Clean form fields with white backgrounds, 1px borders, Figtree labels.
- Generated drafts: Same card style as Approvals screen.
- Remove all coloured accent bars — use gold only.

### 18. `screens/Simulation.jsx`
- Currently a placeholder. Keep the placeholder but restyle: White card, 1px border, Lucide `<FlaskConical />` icon in `var(--text-dim)`, heading in Figtree 20px weight 700, description in 14px `var(--text-secondary)`.
- Score ring placeholders: Simple circles with `var(--border-card)` stroke, labels in Figtree 11px.
- Remove all glass card styling.

### 19. `screens/Settings.jsx`
- Settings categories: Left sidebar list (within the settings page) with Figtree 13px weight 500 labels. Active item has gold left border + `var(--accent-gold-bg)` background.
- Form fields: `var(--bg-surface)` background, 1px border `var(--border-card)`, border-radius 8px, Figtree 14px text.
- Toggles: Track `var(--bg-surface)`, active track `var(--accent-gold)`, thumb white with shadow.
- Service health rows: Clean rows with Lucide icon, service name in Figtree 13px weight 500, status dot (green/red) + status text.
- Cookie/auth section: Same clean card style. Status badges as pills.
- Danger zone: Red-tinted border (rgba(239,68,68,0.2)), red accent button.

---

## App.jsx — LAYOUT CHANGES

Current: `marginLeft: 72` (for 72px icon sidebar).
New: `marginLeft: 220` (for 220px sidebar with labels).

The main layout container:
```jsx
<div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: 'var(--bg-app)' }}>
  <Sidebar />
  <main style={{
    flex: 1,
    marginLeft: 220,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-app)',
  }}>
```

---

## STATIC DESIGN FILES (`/designs/*.html`)

There are 14 HTML files in the `/designs/` directory that serve as reference mockups. These do NOT need to be edited for the app to work — they are static references. However, they should ALSO be updated to reflect the new design language so they remain accurate references. Apply the same colour palette, typography, icon, and layout changes to each HTML file.

---

## WHAT NOT TO CHANGE

- Do NOT change any API calls, data fetching, or business logic
- Do NOT change route paths or navigation structure
- Do NOT change Socket.io event handling
- Do NOT change any data structures or state management
- Do NOT rename any files
- Do NOT add new screens or remove existing screens
- Do NOT change the build system or package.json (except adding `lucide-react`)

---

## CHECKLIST

Before marking this complete, verify every item:

- [ ] Figtree loaded in index.html, every `font-family` reference updated
- [ ] Every `DM Sans` reference removed
- [ ] Every `JetBrains Mono` reference removed
- [ ] Every `var(--font-mono)` replaced with `var(--font-sans)`
- [ ] Every `.font-mono` class removed from JSX
- [ ] Dark theme CSS block removed entirely
- [ ] Theme toggle removed from Sidebar
- [ ] Every `<i className="fa-...">` replaced with Lucide component
- [ ] Font Awesome link removed from index.html
- [ ] `lucide-react` installed and imported in every file that uses icons
- [ ] Every `backdrop-filter` removed
- [ ] Every complex shadow replaced with `--shadow-card`
- [ ] Every glassmorphic background replaced with solid white
- [ ] Every gradient (except logo mark) removed
- [ ] `.glass-card` class removed from CSS and every JSX usage
- [ ] `.ghost-gradient-text` class removed from CSS and every JSX usage
- [ ] Sidebar widened to 220px with icon + text labels
- [ ] `marginLeft: 72` changed to `marginLeft: 220` in App.jsx
- [ ] All 14 screens visually consistent with new design system
- [ ] All card backgrounds are `#ffffff` with 1px `#e5e7eb` border
- [ ] All accent colours match the new palette
- [ ] Gold (#C9A84C) used sparingly — logo, CTA buttons, active states only
- [ ] Blue (#3b82f6) used for links and interactive elements
- [ ] Green (#22c55e) used for success/connected states only
- [ ] No coloured icons anywhere — all Lucide, all monochrome
- [ ] All 14 design HTML files updated to match
- [ ] App builds without errors: `cd client && npm run build`

---

## SUMMARY

You are transforming GhostPost from a glassmorphic dark-mode dashboard with coloured icons and complex shadows into a clean, light-theme, editorially confident product that looks like it belongs alongside Manus, Linear, and Notion. Every surface is white or near-white. Every icon is monochrome. Every accent is restrained gold. Every font is Figtree. Every shadow is minimal. Every border is light grey. The product should feel quiet, confident, and premium — not flashy, not decorated, not dark.

The marketing site at https://ghostpost-marketing-website-design.vercel.app/ is the north star. Every design decision should make the app feel like the natural next step after clicking "Get early access" on that site.
