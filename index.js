const fs = require("node:fs/promises");
const path = require("node:path");
const postcss = require("postcss");

module.exports = function postcssMaskSvgIcons(opts = {}) {
  const {
    // syntax
    functionName = "svg",

    // where to look for icons
    iconsDir = path.resolve(process.cwd(), "icons"),
    extension = ".svg",

    // :root mapping
    rootSelector = ":root",
    insertRootAt = "top", // 'top' | 'bottom'
    overwriteRootVars = false,

    // var naming
    iconVarPrefix = "--icon-",
    // Convert icon name ("arrows/arrow-right") into CSS custom prop suffix.
    // default: replace "/" with "-" => --icon-arrows-arrow-right
    toVarKey = (iconName) => iconName.replace(/[\\/]/g, "-"),

    // injected block
    defaultColor = "currentColor",
    maskRepeatValue = "no-repeat",
    maskSizeValue = "100% 100%",
    maskPositionValue = null, // e.g. 'center' if you want; null disables injection

    // which declarations to handle
    properties = ["mask-image", "mask"],

    // background-color handling
    doNotOverrideBackgroundColor = true,
  } = opts;

  // key: iconName (original, possibly with subfolders)
  // value: { iconName, varKey, varName, filePath, urlValue }
  const needed = new Map();
  const warnings = [];

  return {
    postcssPlugin: "postcss-mask-svg-icons",

    async Once(root, { result }) {
      // 1) Rewrite decls and collect needed icons
      root.walkDecls((decl) => {
        if (!properties.includes(decl.prop)) return;
        if (typeof decl.value !== "string") return;
        if (!decl.value.includes(functionName + "(")) return;

        const parsed = parseSvgFunctionWholeValue(decl.value, functionName);
        if (!parsed) return;

        const { iconName, color } = parsed;

        // Compute custom prop
        const varKey = toVarKey(iconName);
        const varName = `${iconVarPrefix}${varKey}`;

        if (!needed.has(iconName)) {
          const filePath = resolveIconPathSafe(iconsDir, iconName, extension);
          needed.set(iconName, {
            iconName,
            varKey,
            varName,
            filePath,
            urlValue: null,
          });
        }

        // 1a) Inject background-color
        const bgColor = color ?? defaultColor;
        if (
          !(
            doNotOverrideBackgroundColor &&
            hasDecl(decl.parent, "background-color")
          )
        ) {
          decl.cloneBefore({ prop: "background-color", value: bgColor });
        }

        // 1b) Rewrite property
        // For mask shorthand, we convert to mask-image (simpler + matches your expected output).
        const newValue = `var(${varName})`;

        if (decl.prop === "mask" || decl.prop === "-webkit-mask") {
          // Replace shorthand decl with mask-image decl
          const maskImageProp =
            decl.prop === "-webkit-mask" ? "-webkit-mask-image" : "mask-image";
          decl.cloneBefore({ prop: maskImageProp, value: newValue });
          decl.remove();
        } else {
          // mask-image or -webkit-mask-image
          decl.value = newValue;
        }

        // 1c) Ensure repeat/size/(position)
        // Insert after the last mask-image-ish decl we just created/edited.
        // We use decl (even if removed, we already cloned before; easiest is to operate on parent).
        const rule = decl.parent;

        ensureDecl(rule, "mask-repeat", maskRepeatValue);
        ensureDecl(rule, "mask-size", maskSizeValue);
        if (maskPositionValue != null) {
          ensureDecl(rule, "mask-position", maskPositionValue);
        }

      });

      if (needed.size === 0) return;

      // 2) Read SVGs from disk and build url(data:...) values
      await Promise.all(
        [...needed.values()].map(async (entry) => {
          try {
            const svg = await fs.readFile(entry.filePath, "utf8");
            const dataUri = svgToMiniDataUri(svg);
            entry.urlValue = `url("${dataUri}")`;
          } catch (e) {
            warnings.push(
              `postcss-mask-svg-icons: Failed to read "${entry.iconName}" at ${
                entry.filePath
              } (${e && e.message ? e.message : String(e)})`
            );
          }
        })
      );

      // 3) Ensure :root rule
      const rootRule = ensureRootRule(root, rootSelector, insertRootAt);

      // 4) Add/update variables in :root
      for (const entry of needed.values()) {
        if (!entry.urlValue) continue;

        const existing = findDecl(rootRule, entry.varName);
        if (existing) {
          if (overwriteRootVars) existing.value = entry.urlValue;
        } else {
          rootRule.append({ prop: entry.varName, value: entry.urlValue });
        }
      }

      // 5) warnings
      for (const w of warnings) result.warn(w);
    },
  };
};

module.exports.postcss = true;

/**
 * Accepts ONLY when the entire value is exactly svg("name") or svg("name", "color")
 */
function parseSvgFunctionWholeValue(value, functionName) {
  const raw = value.trim();
  if (!raw.startsWith(functionName + "(") || !raw.endsWith(")")) return null;

  const inside = raw.slice(functionName.length + 1, -1); // between (...)
  const args = splitArgs(inside)
    .map((s) => s.trim())
    .filter(Boolean);
  if (args.length < 1 || args.length > 2) return null;

  const iconName = unquote(args[0]);
  if (!iconName) return null;

  const color = args.length === 2 ? unquote(args[1]) : null;
  return { iconName, color };
}

/**
 * Split comma-separated args, respecting quotes and nested parentheses.
 * Handles: "var(--x)" and similar.
 */
function splitArgs(s) {
  const out = [];
  let cur = "";
  let quote = null;
  let depth = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (quote) {
      cur += ch;
      if (ch === quote && s[i - 1] !== "\\") quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }

    if (ch === "(") {
      depth++;
      cur += ch;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      cur += ch;
      continue;
    }

    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  if (cur) out.push(cur);
  return out;
}

function unquote(s) {
  const t = s.trim();
  const m = t.match(/^(['"])(.*)\1$/);
  return m ? m[2] : t;
}

/**
 * Prevent directory traversal:
 * - resolves <iconsDir>/<iconName><ext>
 * - verifies resolved path stays within iconsDir
 */
function resolveIconPathSafe(iconsDir, iconName, ext) {
  const base = path.resolve(iconsDir);
  const target = path.resolve(base, `${iconName}${ext}`);

  const rel = path.relative(base, target);
  const isOutside = rel.startsWith("..") || path.isAbsolute(rel);
  if (isOutside) {
    throw new Error(`Icon path escapes iconsDir: ${iconName}`);
  }
  return target;
}

function cleanSvg(svg) {
  let s = svg;
  s = s.replace(/<\?xml[\s\S]*?\?>/g, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<metadata[^>]*>[\s\S]*?<\/metadata>/gi, "");
  s = s.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
  s = s.replace(/<desc[^>]*>[\s\S]*?<\/desc>/gi, "");
  s = s.replace(/\s+(?:xmlns:(?:inkscape|sodipodi|rdf|dc|cc)|(?:inkscape|sodipodi):[a-zA-Z0-9-]+)="[^"]*"/g, "");
  return s;
}

/**
 * Create a compact SVG data URI for CSS.
 */
function svgToMiniDataUri(svg) {
  let s = cleanSvg(svg).trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  s = s
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

  const encoded = encodeURIComponent(s)
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/");

  return `data:image/svg+xml,${encoded}`;
}

function ensureRootRule(root, selector, insertAt) {
  const rule = postcss.rule({ selector });
  if (insertAt === "bottom") root.append(rule);
  else root.prepend(rule);
  return rule;
}

function ensureDecl(rule, prop, value) {
  if (!hasDecl(rule, prop)) rule.append({ prop, value });
}

function hasDecl(rule, prop) {
  return !!findDecl(rule, prop);
}

function findDecl(rule, prop) {
  let found = null;
  rule.walkDecls(prop, (d) => {
    found = d;
    return false;
  });
  return found;
}

module.exports.postcss = true;
