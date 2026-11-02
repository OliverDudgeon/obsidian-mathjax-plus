# MathJax Plus

Font selection, equation layout, and a shared LaTeX preamble for **Obsidian 1.15.0 or later** on desktop.

Obsidian already includes MathJax 4. This plugin configures that runtime; it no longer bundles its own MathJax engine or replaces the global conversion functions.

## Features

- New Computer Modern, STIX Two, TeX Gyre Pagella, and Fira Math, with font files bundled for offline use. “Obsidian default” and “TeX (classic MathJax)” use Obsidian’s built-in font.
- Line breaking, scaling, scrolling, or overflow for wide display equations.
- Configurable line-break width and display alignment, with an optional preference for breaks at relations and binary operators.
- A vault-wide `.sty` preamble with custom macros and native `\require{…}` support.

The default preamble is `preamble.sty` in the vault root. For example:

```tex
\require{physics}
\newcommand{\R}{\mathbb{R}}
\newcommand{\Ep}[1]{e^{i#1}}
```

Editing, creating, deleting, or renaming the configured preamble automatically refreshes math. Use **MathJax Plus: Reload preamble and refresh math** to reload manually. An empty path disables the preamble; a missing file is treated as empty. Invalid preambles show a notice and leave the last working configuration active.

Settings from version 0.1 retain their existing keys and values. Changes refresh open Markdown views, including Live Preview. Disabling the plugin restores the MathJax objects captured when it loaded, including the original preamble state.

Line-break percentages refer to MathJax’s conversion container width. Obsidian’s `renderMath()` does not pass the note element’s measured width, so `100%` is not a guarantee that math follows a resized pane. Use a fixed width such as `30em` when appropriate.

## Build and install

Requires Node.js 22 or later and the pinned pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm check
```

Copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/mathjax-plus/`, then enable MathJax Plus in Obsidian’s Community plugins settings. For this repository’s demo vault, copy them into `test-vault/.obsidian/plugins/mathjax-plus/`. Generated bundles and local vault configuration are ignored by Git.

`pnpm dev` watches source files. `pnpm generate:fonts` regenerates the font imports after font package changes. The font helper imports are resolved to Obsidian’s classes at build time; importing any unmapped MathJax module fails the build rather than silently bundling another engine.

## Verification and integration details

`pnpm check` typechecks, runs native MathJax integration tests, and builds the plugin. The portable tests use MathJax 4.1.3 components configured like Obsidian. To test the exact installed Obsidian bundle instead:

```sh
OBSIDIAN_ASAR="/path/to/obsidian-1.15.0.asar" pnpm test
```

Tests cover all fonts, offline font CSS, native package loading, macro replacement, preamble errors, safe-link filtering, layout settings, unchanged conversion functions, and restoration on unload.

The plugin uses Obsidian’s native TeX/CommonHTML classes and document constructor, retaining its safety and accessibility mixins. It switches the native startup document/input/output references only after the candidate configuration succeeds. It does not change the global loader or force synchronous loading. Preamble packages that Obsidian does not include remain subject to its loader and package restrictions; the extra fonts themselves need no network access.

These MathJax runtime objects and Obsidian’s Markdown view rebuild method are internal integration points. The plugin checks for MathJax 4 and CommonHTML, falls back to Reading view refresh if full view rebuilding is unavailable, and avoids restoring over a document installed by another plugin. Avoid running multiple plugins that replace/configure the MathJax document at the same time.

The Obsidian API package used for typechecking is 1.14.4, the latest published typings available during this rebuild. Runtime compatibility is targeted and tested against Obsidian 1.15.0. See the [Obsidian changelog](https://obsidian.md/changelog/) for the native MathJax upgrade.
