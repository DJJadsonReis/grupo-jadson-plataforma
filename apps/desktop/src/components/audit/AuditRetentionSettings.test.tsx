import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuditRetentionSettingsForRole } from "./AuditRetentionSettings";

describe("seção de retenção de auditoria", () => {
  const props = { apiFetch: vi.fn(async () => new Response("{}")), apiUrl: "/api/v1" };
  it("não renderiza para pessoas que não são administradoras", () => {
    expect(renderToStaticMarkup(createElement(AuditRetentionSettingsForRole, { ...props, isAdmin: false }))).toBe("");
  });
  it("renderiza a seção para administradores", () => {
    expect(renderToStaticMarkup(createElement(AuditRetentionSettingsForRole, { ...props, isAdmin: true }))).toContain("Retenção de auditoria");
  });
});
