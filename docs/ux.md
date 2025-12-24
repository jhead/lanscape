# Lanscape UI / UX Style Guide

## Design Intent

Lanscape blends modern chat UX (Discord, Slack) with restrained terminal and late-90s/early-2000s counter-culture aesthetics.
The interface is **dark, dense, and utilitarian**, with subtle retro cues: contrast, glow, precision, and immediacy.
Avoid novelty terminal tropes. No neon overload. No monospaced dominance. Everything feels engineered, not styled.

---

## Core Principles

### 1. Integrated Surfaces

UI elements live inside **single, continuous containers**.

* Inputs, actions, and metadata share one surface
* One border or background per region, never layered
* Containers define hierarchy, not shadows

### 2. Density by Default

The product should feel **fast and information-rich**.

* Compact spacing communicates power and fluency
* Empty space must justify itself functionally
* Touch targets remain accessible, not inflated

### 3. Alignment Is Structure

Alignment communicates system logic.

* Shared edges across panels
* Identical heights for parallel regions
* Horizontal rhythm is consistent across the app

### 4. Controlled Contrast

High contrast without harshness.

* Dark surfaces, light text
* Accents are deliberate and sparse
* Visual noise is treated as a bug

---

## Color System

### Base (Dark)

| Token            | Value     | Usage                    |
| ---------------- | --------- | ------------------------ |
| Background       | `#0a0a0a` | App root                 |
| Surface          | `#18181b` | Primary panels           |
| Surface Elevated | `#1a1a1d` | Headers, footers         |
| Container        | `#27272a` | Inputs, message composer |
| Container Hover  | `#2d2d30` | Focus / hover            |
| Border           | `#27272a` | Dividers                 |
| Border Subtle    | `#3f3f46` | Secondary separators     |

### Text

| Token     | Value     | Usage                    |
| --------- | --------- | ------------------------ |
| Primary   | `#e4e4e7` | Core content             |
| Secondary | `#a1a1aa` | Metadata                 |
| Muted     | `#71717a` | Placeholders, timestamps |
| Inverse   | `#ffffff` | On accent fills          |

### Accents

Accents reference terminal culture without mimicking it.

| Token             | Value                   | Usage                   |
| ----------------- | ----------------------- | ----------------------- |
| Brand Green       | `#50fa7b`               | Primary actions, online |
| Brand Green Muted | `rgba(80,250,123,0.15)` | Subtle highlights       |
| Blue              | `#3b82f6`               | Links                   |
| Red               | `#f87171`               | Errors, destructive     |
| Yellow            | `#fbbf24`               | Warnings, idle          |

---

## Typography

* **Primary:** System UI stack
* **Optional Accent:** Neutral grotesk or humanist sans for headers
* **No default monospace**; reserve monospace strictly for code/log output

| Usage          | Size      |
| -------------- | --------- |
| Dense UI       | 13px      |
| Comfortable UI | 15px      |
| Line Height    | 1.375–1.5 |

Text should feel technical, not playful.

---

## Layout Regions (Chat App)

### Sidebar (Servers / Channels)

* Fixed width
* Surface background
* Vertical lists are compact, scroll-first
* Active state uses background fill, not pills

### Chat Timeline

* Flush top to bottom
* Messages stack tightly
* Avatars optional; when present, fixed and aligned
* Timestamps are muted and secondary

### Composer (Message Input)

Single integrated container.

```
┌──────────────────────────────────────────────┐
│ > type message…                        [↵]   │
└──────────────────────────────────────────────┘
```

* Height: `36px`
* Background: Container
* Input: Transparent, borderless
* Action: Icon only, accent on enabled
* Focus: Background shift, no outline

---

## Common Components

### Buttons

* **Icon Button:** 24×24, transparent
* **Primary:** Brand green fill
* **Secondary:** Container background
* **Destructive:** Neutral until hover, then red text

No gradients. No shadows.

### Lists

* Row height is consistent
* Hover state is subtle fill
* Active state is persistent, not animated

### Modals / Dialogs

* Radius: 8px
* No drop shadow or minimal ambient only
* Content density matches main UI

---

## Interaction States

* **Hover:** Slight background lift or text brighten
* **Active:** Minor opacity or scale (≤ 0.95)
* **Focus:** Container-level change only
* **Disabled:** Muted text, reduced contrast

No glow rings. No animated borders.

---

## Corner Radius Scale

* 4px — Inputs, buttons, tags
* 8px — Cards, modals
* 12px — Rare, large containers only

Never mix radii within a single component.

---

## Anti-Patterns

* Double borders
* Floating, detached buttons
* Heavy shadows or neumorphism
* Bright or light surfaces
* Decorative spacing
* Terminal cosplay (green text, scanlines, CRT effects)

---

## Implementation Notes

* Prefer flat color tokens over ad-hoc values
* Override global styles aggressively when needed
* Migrate to CSS variables for all color, radius, and sizing primitives

The interface should feel like a **tool**, not a theme.
