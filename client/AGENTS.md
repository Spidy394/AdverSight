# Client-Side Frontend Guidelines

Applies to all code under `client/` (React 19 + Vite 8 + Tailwind v4 + TypeScript, Bun).

Path alias: `@/*` → `client/src/*` (defined in `client/tsconfig.json`, `client/tsconfig.app.json`, and `client/vite.config.ts`).

## 1. UI components — shadcn/ui (base-nova, Base UI)

The shadcn `base-nova` preset is installed. Primitives live in `client/src/components/ui/`.

- **Always reuse before authoring.** Before writing a new control, check `client/src/components/ui/` for an existing primitive. Prefer composing `Button`, `Card`, `Dialog`, `Sheet`, `Drawer`, `DropdownMenu`, `Tabs`, `Table`, `Input`, `Select`, `Combobox`, `Badge`, `Field`, `Item`, `Empty`, `Skeleton`, `Tooltip`, `Sonner`/toast, etc.
- **Do not hand-roll** listbox, popover, dialog, accordion, carousel, calendar, or combobox behaviour when a primitive exists.
- **Missing primitive → install it, don't clone it:**
  ```powershell
  # from client/
  bunx shadcn add <component>
  ```
  The CLI is a local devDependency (`shadcn`), so no `npx`/`bunx --bun` network fetch is needed. Always run it from `client/`.
- **Do not edit files in `src/components/ui/`** to change appearance or behaviour of a primitive. These are vendored registry files and will be overwritten on update. Wrap or extend them from `src/components/` instead.
- Class merging goes through `cn` from `@/lib/utils` (re-exported from the `cn` package). Never concatenate class strings by hand.
- Base UI primitives (not Radix) back this preset — respect the props the primitive actually exposes rather than assuming Radix APIs.

## 2. Animation standards

Use **Motion** for component motion and **GSAP** for scroll/narrative motion. Both are installed.

### Motion (`motion/react`) — default choice

Import from `motion/react`. Use for:

- Declarative enter/exit and layout transitions
- Hover, tap, and drag micro-interactions (springs via `transition: { type: "spring" }`)
- `<AnimatePresence>` for unmount/mount transitions, including exit animations
- Animated `Dialog` / `Sheet` / `Drawer` / dropdown and menu content
- `layoutId` shared-element transitions, `useScroll`, `useTransform`, `useSpring` for scroll-linked (non-timeline) values
- `useReducedMotion()` must be honoured for any non-essential motion

### GSAP (`gsap` + `@gsap/react`) — scroll & orchestration

Use for:

- `ScrollTrigger`: scrubbed reveals, pinning, snap, and scroll-linked timelines
- Multi-step choreographed timelines with labels and nested timelines
- Continuous/infinite loops, complex stagger/grid choreography
- SVG path morphing (`MorphSVG`), high-perf canvas motion
- Anything needing a timeline scrubbed by scroll position

`@gsap/react`'s `useGSAP()` hook is installed — prefer it over manual `useLayoutEffect` + `context()` cleanup for component-scoped timelines.

GSAP `3.15` ships its own TypeScript types. **Do not install `@types/gsap`.** Register plugins once at module scope:

```ts
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)
```

### Avoid

- Bespoke CSS `@keyframes` / `animation:` for anything Motion or GSAP covers. Raw CSS animation is acceptable only for trivial, static, infinite ambient loops (e.g. a single pulsing dot).
- Animating `width`, `height`, `top`, or `left`. Animate `transform` and `opacity`.
- Mounting ScrollTriggers without cleanup — every timeline and ScrollTrigger must be scoped and reverted on unmount.
- Combining Motion and GSAP on the same property of the same element; pick one owner per property.

## 3. Conventions

- **Styling**: Tailwind v4 utilities + design tokens. Do not write new raw CSS in `src/index.css` for components; tokens and theme variables live there only.
- **File layout**: route/feature components in `src/components/` or `src/features/`; shared primitives in `src/components/ui/`; helpers in `src/lib/`.
- **Icons**: `lucide-react` (wired up as `iconLibrary: lucide` in `components.json`). Do not add another icon set.
- **Lint scope**: `src/components/ui` is excluded in `eslint.config.js` (registry files export `cva` variants alongside components, which trips `react-refresh/only-export-components`). Lint still applies everywhere else.
- **Verify before finishing**:
  ```powershell
  # from client/
  bun run lint
  bun run build
  ```
  `bun run build` runs `tsc -b` first, so type errors fail the build.