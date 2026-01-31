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
});
