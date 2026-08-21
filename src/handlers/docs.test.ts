import { describe, expect, it } from "vitest";
import { getDocsHtml, getOpenApiYaml } from "./docs";

describe("getDocsHtml", () => {
  it("returns the checked-in Swagger UI page from docs/index.html", async () => {
    const html = await getDocsHtml();

    expect(html).toContain("SwaggerUIBundle");
    expect(html).toContain('id="swagger-ui"');
  });

  it("declares a light color-scheme so browsers don't auto-dark-mode an unstyled-looking page", async () => {
    const html = await getDocsHtml();

    expect(html).toMatch(/<meta\s+name="color-scheme"\s+content="light"/);
  });

  it("neutralizes swagger-ui-standalone-preset's own prefers-color-scheme dark-mode detection", async () => {
    // swagger-ui-standalone-preset.js's DarkModeToggle checks
    // matchMedia("(prefers-color-scheme: dark)") on mount and adds an html.dark-mode class
    // regardless of the page's <meta name="color-scheme">, so that meta tag alone can't force
    // the light theme — this page has to shadow matchMedia before that script runs instead.
    const html = await getDocsHtml();
    const overrideScriptIndex = html.indexOf("window.matchMedia =");
    const presetScriptIndex = html.indexOf('<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js">');

    expect(overrideScriptIndex).toBeGreaterThan(-1);
    expect(overrideScriptIndex).toBeLessThan(presetScriptIndex);
    expect(html).toMatch(/prefers-color-scheme:\s*dark/);
  });
});

describe("getOpenApiYaml", () => {
  it("returns the checked-in OpenAPI spec from docs/openapi.yaml", async () => {
    const yaml = await getOpenApiYaml();

    expect(yaml).toContain("openapi: 3.0.3");
    expect(yaml).toContain("EduVerify API");
  });
});
