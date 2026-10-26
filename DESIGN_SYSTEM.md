# Design system

A quiet, operational interface in the Engosoft identity. It is closer to Linear, Notion or modern Atlassian than to a marketing page: white surfaces, hairline borders, brand blue for action and selection, very little decoration.

Files:

| File | Contents |
| --- | --- |
| `src/styles/tokens.css` | All design tokens, light and dark |
| `src/styles/base.css` | Reset, typography, focus, `u-*` utilities, keyframes, reduced motion |
| `src/styles/components.css` | Shared components (`ui-*`) |
| `src/styles/shell.css` | Sidebar, header, page header, bottom navigation, command palette, notification center |
| `src/styles/pages.css` | Lists, boards, calendars and page-specific layouts |
| `src/legacy/styles/*` | The legacy publishing calendar, scoped with `@scope (.lg)` and re-coloured through a token adapter |

Components read semantic tokens only. A raw hex value in a component is a bug, except for the legacy calendar's adapter and the brand swatches on the Admin page.

## Colour

| Role | Light | Use |
| --- | --- | --- |
| `--brand` | `#0046FF` | Primary buttons, selected navigation, links, focus rings, the current step |
| `--brand-hover` / `--brand-active` | `#003BD6` / `#0033B8` | Hover and pressed states |
| `--brand-soft` | `#EBF0FF` | Selected rows and nav items, active filters |
| `--accent` | `#FF6600` | Sparse emphasis: the logo dot, unread counts, occasions on the calendar |
| `--bg` | `#F6F8FB` | App background |
| `--surface` | `#FFFFFF` | Cards, tables, drawers |
| `--surface-subtle` | `#F8FAFC` | Table headers, inset panels |
| `--border` / `--border-strong` | `#E5E9F0` / `#D6DCE5` | Hairlines / input borders |
| `--text` / `--text-muted` / `--text-subtle` | `#17191C` / `#5F6B7D` / `#8A94A6` | Body / secondary / tertiary |
| `--success` `--warning` `--danger` `--info` `--violet` | Each has `-soft` (background) and `-ink` (text) variants | Status only |

Blue never fills large areas. Orange never becomes the dominant colour. Platform brand colours (`--p-facebook` and so on) appear only as small icons.

Dark mode redefines the same roles under `:root[data-theme='dark']`. Light is the primary theme. `index.html` resolves the saved theme (or the system setting) before first paint.

### Status colours

| Tone | Content statuses | Task statuses |
| --- | --- | --- |
| neutral | Idea, Draft, Archived, Cancelled | To do, Cancelled |
| violet | In production | — |
| warning | Ready for review | Waiting |
| danger | Changes requested | — |
| brand | Scheduled | In progress |
| success | Approved, Published | Done |

Badges always pair the colour with a text label, so colour never carries meaning alone.

## Typography

- English: **Plus Jakarta Sans** (400–700).
- Arabic: **Almarai** (300–800).
- One stack, `'Plus Jakarta Sans', 'Almarai', …`: Latin glyphs, including product names inside Arabic sentences, render in Plus Jakarta Sans, and Arabic falls through to Almarai.
- Scale: 12 / 13 / 14 (body) / 16 / 18 / 22 (page title) / 28 (stat value).
- Arabic gets more line height (1.65 body, 1.45 headings) and no negative letter spacing.
- Numbers use Latin digits in both languages, with `font-variant-numeric: tabular-nums` (`u-tnum`) in tables and stats.

## Spacing, radii, shadows

- Spacing is a 4px base: `--sp-1` (4) … `--sp-10` (40). Pages use 24px between sections and 32px side padding (24 on laptops, 16 on phones).
- Radii: 6 (small controls), 8 (buttons, inputs), 12 (cards, tables), 16 (dialogs, palette), pill (badges, filters).
- Shadows: `--shadow-xs` on cards (barely visible), `--shadow-md` on menus, `--shadow-lg` on drawers, dialogs and toasts. No glows, no glass, no gradients.

## Layout

- Sidebar: 288px expanded, 64px rail. The state is remembered. The rail shows icon tooltips and keeps counts as small badges.
- Header: 60px, sticky, with the sidebar toggle, breadcrumbs, search (`⌘K`) and notifications.
- Page header: optional meta line, title, one-line description, actions on the end side.
- Content width: up to 1480px.
- Below 960px the sidebar becomes a drawer opened from the header. Below 640px a five-item bottom navigation appears (Home, My Work, Content, Calendar, Tasks), drawers become bottom sheets, and filters become a single swipeable row.

## Components

| Component | Class / file | Notes |
| --- | --- | --- |
| Button | `ui-btn` (`primary`, `secondary`, `ghost`, `subtle`, `danger`; `sm`, `md`) | One primary action per area |
| Icon button | `ui-icon-btn` | Always has an accessible label and tooltip |
| Badge | `ui-badge--{tone}` | Status, priority, approval |
| Demo / Live badge | `ui-demo-badge`, `ui-live-badge` | Marks where a record comes from |
| Card | `ui-card`, `CardHeader`, `CardBody` | Lists placed straight after a header pad to the card edge |
| Stat | `ui-stat` | Number, label, optional hint and link. No giant KPI cards. |
| Source line | `ui-source` | "Source · account · updated 12 min ago" under every live number |
| Data notice | `ui-notice--{error,needs_setup,stale,partial}` | The non-ready states of external data |
| Empty state | `ui-empty` | Says what happened and what to do next |
| Table | `DataTable` | Sticky header, sortable columns, selection with bulk actions, pagination, row click and Enter, secondary columns hidden under 900px |
| Tabs / Segmented | `ui-tabs`, `ui-segmented` | Arrow keys follow the reading direction |
| Filter chip | `ui-filter` | A labelled select that reads as one chip; blue when active |
| Drawer / Dialog | `Drawer`, `Dialog` | Focus trap, Escape closes, focus returns, scrim click closes |
| Menu | `Menu` | Arrow keys, Escape, focus return |
| Toast | `useToast()` | One system for the whole app; undo actions stay longer |
| Progress | `ui-progress--{tone}` | Always next to the number it represents |

## RTL and bilingual text

- Arabic is the default. The language toggle sets `lang` and `dir` on `<html>`, and `index.html` applies the saved choice before first paint.
- All layout uses logical properties (`margin-inline-start`, `inset-inline-end`, `border-inline-start`), so RTL needs no mirrored stylesheet.
- Directional icons (chevrons, arrows, the sidebar toggle) carry `u-flip`.
- User text (titles, captions, comments) uses `dir="auto"`. Multi-line bodies (`.caption`, `.prose`, comments, approval notes, textareas) use `unicode-bidi: plaintext`, so each line takes its own direction: an English line and an Arabic line in the same caption both read correctly.
- Ratios such as `10 / 12` go through `ratio()` from `useI18n()`, which wraps them in a left-to-right isolate so they never read as `12 / 10` in Arabic.
- Product and platform names stay in English (Facebook, LinkedIn, CFM, PMP).
- Phone weekday headers use the narrow form (س ح ن …) instead of truncating.

## Motion

| Interaction | Duration |
| --- | --- |
| Hover, focus | 100–150ms |
| Page change | 180ms fade and 6px rise (exit 100ms) |
| Drawer | 240ms in, 160ms out |
| Dialog, palette | 180–200ms |
| Toast | 200ms |

Motion only explains a change of state. `MotionConfig reducedMotion="user"` and the `prefers-reduced-motion` block in `base.css` turn it off for people who ask.

## Accessibility

- Visible focus ring (2px brand outline) on every interactive element.
- A skip link to the main content.
- Semantic landmarks (`aside`, `nav`, `header`, `main`), breadcrumbs as an ordered list with `aria-current`.
- Dialogs and drawers are `aria-modal`, trap focus and return it.
- Tables have captions and `aria-sort`. Charts have a hidden data table.
- Text colours meet WCAG AA on their surfaces in both themes.
