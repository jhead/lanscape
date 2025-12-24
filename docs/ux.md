# Lanscape UI/UX Design Principles

## Philosophy

Lanscape's interface follows a **compact, sleek, modern** design language inspired by contemporary chat and gaming applications. The goal is to feel fast, focused, and premium without visual clutter.

---

## Core Principles

### 1. Unified Containers

UI elements should feel **integrated**, not floating separately. For example:
- Text inputs are seamlessly embedded within their surrounding container
- Buttons sit inside the same box as inputs, not adjacent to them
- Avoid double borders or redundant visual boundaries

**Bad:** Input field with its own border + separate send button with its own border  
**Good:** Single container with rounded corners containing both input and button

### 2. Consistent Alignment

Adjacent UI regions should **align visually**:
- Sidebar footer and main content footer share the same height (52px)
- Horizontal padding is consistent across regions (1rem)
- Elements at the same vertical level should feel like a single cohesive row

### 3. Purposeful Spacing

Every pixel of padding should serve a purpose:
- No decorative margins or "breathing room" that fragments the interface
- Compact by default; density conveys efficiency
- Padding exists for touch targets and readability, not aesthetics alone

### 4. Consistent Corner Radius

Use a unified `border-radius` scale:
- **4px** — Small elements (buttons, input wrappers, tags)
- **8px** — Medium containers (cards, modals)
- **12px** — Large containers (main cards, dialogs)

Avoid mixing rounded and square corners on adjacent elements.

---

## Color System

### Base Palette (Dark Theme)

| Role | Hex | Usage |
|------|-----|-------|
| Background | `#0a0a0a` | App background |
| Surface | `#18181b` | Panels, sidebars |
| Surface Elevated | `#1a1a1d` | Headers, footers |
| Container | `#27272a` | Input backgrounds, cards |
| Container Hover | `#2d2d30` | Focus/hover states |
| Border | `#27272a` | Dividers, separators |
| Border Subtle | `#3f3f46` | Secondary borders |

### Text

| Role | Hex | Usage |
|------|-----|-------|
| Primary | `#e4e4e7` | Body text |
| Secondary | `#a1a1aa` | Muted text |
| Tertiary | `#71717a` | Placeholders, hints |
| Inverse | `#ffffff` | Text on accent backgrounds |

### Accent Colors

| Role | Hex | Usage |
|------|-----|-------|
| **Brand Green** | `#50fa7b` | Primary action, send buttons, online status |
| Brand Green Hover | `#69ff90` | Hover state |
| Brand Green Muted | `rgba(80, 250, 123, 0.15)` | Subtle hover backgrounds |
| Blue | `#3b82f6` | Links, secondary actions |
| Red | `#f87171` | Destructive actions, errors |
| Yellow | `#fbbf24` | Warnings, offline states |

---

## Component Patterns

### Input + Action Containers

```
┌──────────────────────────────────────────────────┐
│  [placeholder text...]                      [▶]  │
└──────────────────────────────────────────────────┘
```

- Container: `background: #27272a`, `border-radius: 4px`, `height: 36px`
- Input: Transparent background, no border, vertically centered
- Action button: Icon only, no background, accent color on enabled state
- Focus state: Container background lightens slightly (`#2d2d30`)

### Footer Bars

- Fixed height: `52px`
- Background: `#1a1a1d`
- Border: `1px solid #27272a` on the separating edge
- Content vertically centered with `padding: 0 1rem`

### Buttons

| Type | Style |
|------|-------|
| Icon Button | Transparent, 24×24px, icon color as accent |
| Primary | Brand green background, white text |
| Secondary | Container background, primary text |
| Destructive | Container background, red text on hover |

---

## Typography

- **Font Family:** System fonts (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- **Base Size:** `0.8125rem` (13px) for compact UI, `0.9375rem` (15px) for comfortable
- **Line Height:** 1.375 for single-line, 1.5 for multi-line

---

## Interaction States

### Enabled
- Full opacity
- Accent color for actionable elements

### Disabled
- Reduced opacity or muted colors (`#3f3f46`)
- `cursor: not-allowed`

### Hover
- Subtle background change or color brighten
- Avoid dramatic transforms (scale max: 0.95 on active)

### Focus
- Container-level focus indication (background shift)
- Avoid outline rings; prefer integrated visual feedback

---

## Anti-Patterns

❌ **Double borders** — Input inside container both having visible borders  
❌ **Floating elements** — Buttons or inputs with padding/margin creating visual gaps  
❌ **Inconsistent radii** — Mixing 4px and 8px corners on adjacent elements  
❌ **Heavy shadows** — Drop shadows on interactive elements (prefer flat)  
❌ **Bright backgrounds** — Avoid light/white surfaces in dark theme  
❌ **Decorative spacing** — Padding that exists only for "breathing room"

---

## Implementation Notes

### Overriding Global Styles

When component styles conflict with global resets, use targeted overrides:

```css
.my-input {
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

.my-button {
  min-width: 24px; /* Override global min-width */
}
```

### CSS Custom Properties

Consider migrating to CSS variables for consistency:

```css
:root {
  --color-bg: #0a0a0a;
  --color-surface: #18181b;
  --color-container: #27272a;
  --color-accent: #50fa7b;
  --radius-sm: 4px;
  --radius-md: 8px;
  --height-footer: 52px;
}
```

