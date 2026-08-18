import { describe, expect, it } from "vitest";
import { getDocsHtml, getOpenApiYaml } from "./docs";

describe("getDocsHtml", () => {
  it("returns the checked-in Swagger UI page from docs/index.html", async () => {
    const html = await getDocsHtml();

    expect(html).toContain("SwaggerUIBundle");
    expect(html).toContain('id="swagger-ui"');
  });
});

describe("getOpenApiYaml", () => {
  it("returns the checked-in OpenAPI spec from docs/openapi.yaml", async () => {
    const yaml = await getOpenApiYaml();

    expect(yaml).toContain("openapi: 3.0.3");
    expect(yaml).toContain("EduVerify API");
  });
});
