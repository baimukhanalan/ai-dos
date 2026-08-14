import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { createReportCsv, createReportXlsx, parseReportFilters } from "@/lib/analytics/reporting";

describe("advanced reporting", () => {
  it("defaults to a tenant-local reporting window of 30 calendar days", () => {
    expect(parseReportFilters({}, new Date("2026-08-14T10:00:00Z"))).toMatchObject({
      from: "2026-07-16",
      to: "2026-08-14",
    });
  });

  it("rejects reversed and oversized date ranges", () => {
    expect(() => parseReportFilters({ from: "2026-08-14", to: "2026-08-01" })).toThrow();
    expect(() => parseReportFilters({ from: "2025-01-01", to: "2026-08-14" })).toThrow();
  });

  it("prevents spreadsheet formula injection in CSV", () => {
    const csv = createReportCsv([{ Пациент: "=IMPORTXML(\"https://bad\")", Звонки: 2 }]);
    expect(csv).toContain("\"'=IMPORTXML");
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("creates a real XLSX archive with a readable worksheet", () => {
    const files = unzipSync(createReportXlsx([{ Дата: "2026-08-14", Звонки: 3 }]));
    expect(Object.keys(files)).toContain("xl/worksheets/sheet1.xml");
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("2026-08-14");
    expect(sheet).toContain("<v>3</v>");
  });
});
