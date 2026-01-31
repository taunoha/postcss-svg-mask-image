# postcss-svg-mask-image

A PostCSS plugin that rewrites `mask-image: svg(...)` calls in your CSS into a complete, cross-browser mask setup (mask image, repeat, size, and optional color via background-color). It injects `:root` CSS variables for each SVG icon into the same file, so the SVG data is stored once and reused everywhere. 

**One icon can be used in any color and at any size** (via `color`/`background` and `width`/`height` or `mask-size`).

Best used with icons that are a single compound shape (solid silhouette). Multi-shape or multi-color SVGs can produce unexpected masking results.

## Description

This plugin processes CSS and SCSS files to transform `mask-image: svg()` function calls into standard CSS mask properties. It automatically:

- Converts SVG files to data URIs
- Injects CSS variables in `:root` for each icon (prepended or appended to the file)
- Replaces `svg()` calls with the appropriate CSS properties

## Installation

```bash
npm install postcss postcss-svg-mask-image --save-dev
```

### Basic Setup

Add the plugin to your PostCSS config (e.g. `postcss.config.js` or `postcss.config.cjs`):

```js
const path = require("node:path");

module.exports = {
  plugins: [
    require("postcss-svg-mask-image")({
      iconsDir: path.resolve(__dirname, "assets/icons"),
      // maskPositionValue: "center",
      // overwriteRootVars: true,
    }),
  ],
};
```

Subfolders are supported: `svg("arrows/arrow-right")` resolves to `assets/icons/arrows/arrow-right.svg`.

### Configuration Options

- `iconsDir` (string): Directory where SVG files are stored. Default: `path.resolve(process.cwd(), "icons")`
- `extension` (string): SVG file extension. Default: `".svg"`
- `functionName` (string): Name of the custom function in CSS (full mask + background injection). Default: `"svg"`
- `functionNameVar` (string | null): Var-only function: replaces with `var(--icon-*)` only, works on any property. Use this to mix full mask and var-only in one file. Set to `null` to disable. Default: `"svg-var"`
- `rootSelector` (string): Selector for the rule that holds icon variables. Default: `":root"`
- `insertRootAt` (`"top"` | `"bottom"`): Where to inject the `:root` rule. Default: `"top"`
- `overwriteRootVars` (boolean): Overwrite existing custom properties in `:root`. Default: `false`
- `iconVarPrefix` (string): Prefix for generated CSS variables. Default: `"--icon-"`
- `toVarKey` (function): Maps icon name to variable suffix. Default: replaces `/` and `\` with `-`
- `defaultColor` (string): Injected `background-color` when no second argument to `svg()`. Default: `"currentColor"`
- `maskRepeatValue`, `maskSizeValue` (string): Injected mask properties. Defaults: `"no-repeat"`, `"100% 100%"`
- `maskPositionValue` (string | null): Injected mask-position; `null` disables. Default: `null`
- `varOnly` (boolean): If `true`, treat `svg()` as var-only (same behavior as `svg-var()`). Use when you want var-only everywhere without changing CSS. Default: `false`
- `properties` (string[]): Declaration names to process for `svg()` (full injection). Default: `["mask-image", "mask"]`
- `doNotOverrideBackgroundColor` (boolean): Skip injecting background-color if the rule already has one. Default: `true`

### CSS Usage

#### Best practice: use `currentColor`

The main intended workflow is to theme icons via `color` and let the plugin use `background-color: currentColor` for the mask fill.

```css
.icon {
  width: 1em;
  height: 1em;
  mask-image: svg("arrow-right");
}

.icon.is-muted {
  color: var(--text-muted);
}

.icon.is-danger {
  color: var(--danger);
}
```

#### `svg()` function

In your CSS or SCSS files, use the `svg()` function. The optional second argument sets `background-color` (useful as an escape hatch; for most cases prefer `currentColor` as shown above).

```css
.a {
  width: 1em;
  height: 1em;
  mask-image: svg("arrow-right");
}

.b {
  mask-image: svg("arrow-right", "red");
}

.c {
  mask-image: svg("arrow-right", "var(--color-primary)");
}
```

The plugin will transform this to:

```css
:root {
  --icon-arrow-right: url("data:image/svg+xml,...");
}

.a {
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-image: var(--icon-arrow-right);
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
}

.b {
  background-color: red;
  mask-image: var(--icon-arrow-right);
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
}

.c {
  background-color: var(--color-primary);
  mask-image: var(--icon-arrow-right);
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
}
```

The `:root` declarations are injected into the same CSS file (at the top or bottom, see `insertRootAt`).

#### `svg-var()` — var-only (mix with `svg()`)

Use `svg-var()` when you want only the CSS variable replacement, no mask or background injection. It works on any property (e.g. `background-image`). You can mix `svg()` and `svg-var()` in the same file:

```css
.mask-icon {
  mask-image: svg("arrow");
}
.bg-icon {
  background-image: svg-var("arrow");
}
```

Becomes:

```css
:root {
  --icon-arrow: url("data:image/svg+xml,...");
}

.mask-icon {
  background-color: currentColor;
  mask-image: var(--icon-arrow);
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
}

.bg-icon {
  background-image: var(--icon-arrow);
}
```

Set `functionNameVar: null` to disable `svg-var()`.

#### `varOnly` option

With `varOnly: true`, every `svg()` call is treated as var-only (same as `svg-var()`). Use when you want var-only everywhere without changing your CSS to `svg-var()`.

Notes:

- To pass a CSS variable as the optional color argument, keep it quoted: `svg("arrow-right", "var(--color-primary)")`.
- If you need per-usage colors, you can also skip the second argument and set `color` (recommended) or `background-color` in regular CSS.

### SVG cleaning

Before encoding, the plugin strips from each SVG: XML declaration, comments, `<metadata>`, `<title>`, `<desc>`, editor namespaces (e.g. Inkscape/Sodipodi), `id`, and `data-*` attributes, so only rendering-relevant markup remains.

For full optimization (e.g. minifying paths, removing default attributes), run your SVGs through [SVGO](https://github.com/svg/svgo) before or alongside this plugin; SVGO is the standard Node.js SVG optimizer.

## Requirements

- PostCSS 8.0+
- Node.js 22+

## License

MIT
