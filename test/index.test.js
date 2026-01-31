const path = require("node:path");
const postcss = require("postcss");
const plugin = require("../index.js");

const iconsDir = path.resolve(__dirname, "fixtures/icons");

async function run(input, opts = {}) {
  const result = await postcss([plugin({ iconsDir, ...opts })]).process(input, {
    from: undefined,
  });
  return result.css;
}

describe("postcss-svg-mask-image", () => {
  it("rewrites mask-image: svg() and injects :root + mask props", async () => {
    const css = await run(`
      .foo {
        mask-image: svg("arrow");
      }
    `);
    expect(css).toContain(":root");
    expect(css).toContain("--icon-arrow:");
    expect(css).toContain("data:image/svg+xml");
    expect(css).toContain("var(--icon-arrow)");
    expect(css).toContain("background-color: currentColor");
    expect(css).toContain("mask-repeat: no-repeat");
    expect(css).toContain("mask-size: 100% 100%");
  });

  it("uses optional color argument as background-color", async () => {
    const css = await run(`
      .bar {
        mask-image: svg("arrow", "red");
      }
    `);
    expect(css).toContain("background-color: red");
    expect(css).toContain("var(--icon-arrow)");
  });

  it("uses optional css variable color argument as background-color", async () => {
    const css = await run(`
      .bar {
        mask-image: svg("arrow", "var(--color-primary)");
      }
    `);
    expect(css).toContain("background-color: var(--color-primary)");
    expect(css).toContain("var(--icon-arrow)");
  });

  it("emits only one :root variable per icon when used multiple times", async () => {
    const css = await run(`
      .a { mask-image: svg("arrow"); }
      .b { mask-image: svg("arrow"); }
      .c { mask-image: svg("arrow", "red"); }
    `);
    const rootVarMatches = css.match(/--icon-arrow:\s*url\s*\(/g);
    expect(rootVarMatches).toHaveLength(1);
    expect(css).toContain("var(--icon-arrow)");
  });

  it("supports nested folders (icon name with path)", async () => {
    const css = await run(`
      .nested {
        mask-image: svg("arrows/arrow-right");
      }
    `);
    expect(css).toContain("--icon-arrows-arrow-right:");
    expect(css).toContain("var(--icon-arrows-arrow-right)");
    expect(css).toContain("data:image/svg+xml");
  });

  it("varOnly: only replaces svg() with var(--icon-*), no mask/background injection", async () => {
    const css = await run(
      `
      .a {
        background-image: svg("arrow");
      }
    `,
      { varOnly: true }
    );
    expect(css).toContain(":root");
    expect(css).toContain("--icon-arrow:");
    expect(css).toContain("url(\"data:image/svg+xml");
    expect(css).toContain(".a {");
    expect(css).toContain("background-image: var(--icon-arrow)");
    expect(css).not.toContain("background-color: currentColor");
    expect(css).not.toContain("mask-repeat");
    expect(css).not.toContain("mask-size");
  });

  it("varOnly: works with mask-image and does not inject mask props", async () => {
    const css = await run(
      `
      .b {
        mask-image: svg("arrow");
      }
    `,
      { varOnly: true }
    );
    expect(css).toContain("--icon-arrow:");
    expect(css).toContain("mask-image: var(--icon-arrow)");
    expect(css).not.toContain("mask-repeat");
    expect(css).not.toContain("background-color");
  });

  it("svg-var(): only replaces with var(--icon-*), works on any property", async () => {
    const css = await run(`
      .a {
        background-image: svg-var("arrow");
      }
    `);
    expect(css).toContain(":root");
    expect(css).toContain("--icon-arrow:");
    expect(css).toContain("background-image: var(--icon-arrow)");
    expect(css).not.toContain("background-color: currentColor");
    expect(css).not.toContain("mask-repeat");
  });

  it("mixing svg() and svg-var() in one file", async () => {
    const css = await run(`
      .mask-icon {
        mask-image: svg("arrow");
      }
      .bg-icon {
        background-image: svg-var("arrow");
      }
    `);
    expect(css).toContain("--icon-arrow:");
    expect(css).toContain("mask-icon");
    expect(css).toContain("background-color: currentColor");
    expect(css).toContain("mask-repeat: no-repeat");
    expect(css).toContain("bg-icon");
    expect(css).toContain("background-image: var(--icon-arrow)");
    const rootVarMatches = css.match(/--icon-arrow:\s*url\s*\(/g);
    expect(rootVarMatches).toHaveLength(1);
  });

  it("functionNameVar: null disables svg-var()", async () => {
    const css = await run(
      `
      .a {
        background-image: svg-var("arrow");
      }
    `,
      { functionNameVar: null }
    );
    expect(css).toContain("svg-var(\"arrow\")");
    expect(css).not.toContain("var(--icon-arrow)");
  });

  it("cleans SVG before encoding: strips xml declaration, comments, metadata, title, desc, editor attrs", async () => {
    const css = await run(`
      .cleaned {
        mask-image: svg("test-clean");
      }
    `);
    const dataUriMatch = css.match(/url\("(data:image\/svg\+xml,[^"]+)"\)/);
    expect(dataUriMatch).toBeTruthy();
    const decoded = decodeURIComponent(dataUriMatch[1].replace("data:image/svg+xml,", ""));
    expect(decoded).not.toMatch(/<\?xml/);
    expect(decoded).not.toMatch(/<!--/);
    expect(decoded).not.toMatch(/<metadata/);
    expect(decoded).not.toMatch(/<title/);
    expect(decoded).not.toMatch(/<desc/);
    expect(decoded).not.toMatch(/inkscape:/);
    expect(decoded).not.toMatch(/sodipodi:/);
    expect(decoded).not.toMatch(/\bid\s*=/);
    expect(decoded).not.toMatch(/data-[a-zA-Z0-9_.-]+=/);
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("<path");
  });
});
