import { strToU8, zipSync } from "fflate";
import { z } from "zod";

export const reportChannels = ["phone", "web", "whatsapp", "telegram", "portal", "mcp", "damumed"] as const;
export const reportResults = ["booked", "lost", "escalated", "confirmed", "cancelled", "completed", "no_show"] as const;
export const reportLanguages = ["ru", "kk", "en"] as const;

const optionalUuid = z.string().uuid().optional();
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export const reportFiltersSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  branchId: optionalUuid,
  doctorId: optionalUuid,
  specialtyId: optionalUuid,
  language: z.enum(reportLanguages).optional(),
  channel: z.enum(reportChannels).optional(),
  result: z.enum(reportResults).optional(),
  scenarioId: optionalUuid,
}).superRefine((value, context) => {
  if (value.from && value.to) {
    const from = new Date(`${value.from}T00:00:00Z`);
    const to = new Date(`${value.to}T00:00:00Z`);
    const days = (to.getTime() - from.getTime()) / 86_400_000;
    if (days < 0) context.addIssue({ code: "custom", message: "Дата начала позже даты окончания.", path: ["from"] });
    if (days > 366) context.addIssue({ code: "custom", message: "Период отчёта не может превышать 366 дней.", path: ["to"] });
  }
});

export type ReportFilters = z.infer<typeof reportFiltersSchema> & { from: string; to: string };

function one(value: string | string[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value || undefined;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function defaultReportRange(now = new Date()) {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: isoDate(from), to: isoDate(to) };
}

export function parseReportFilters(
  source: Record<string, string | string[] | null | undefined>,
  now = new Date(),
): ReportFilters {
  const defaults = defaultReportRange(now);
  return reportFiltersSchema.parse({
    from: one(source.from) || defaults.from,
    to: one(source.to) || defaults.to,
    branchId: one(source.branchId) || undefined,
    doctorId: one(source.doctorId) || undefined,
    specialtyId: one(source.specialtyId) || undefined,
    language: one(source.language) || undefined,
    channel: one(source.channel) || undefined,
    result: one(source.result) || undefined,
    scenarioId: one(source.scenarioId) || undefined,
  }) as ReportFilters;
}

export function reportFiltersToParams(filters: ReportFilters) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  for (const key of ["branchId", "doctorId", "specialtyId", "language", "channel", "result", "scenarioId"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return params;
}

export type ReportExportRow = Record<string, string | number | null>;

function csvCell(value: string | number | null) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createReportCsv(rows: ReportExportRow[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))];
  return `\uFEFF${lines.join("\r\n")}`;
}

function escapeXml(value: unknown) {
  return String(value ?? "").replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] || char);
}

function columnName(index: number) {
  let result = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

function worksheetXml(rows: ReportExportRow[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const all = [Object.fromEntries(headers.map((header) => [header, header])), ...rows];
  const sheetRows = all.map((row, rowIndex) => {
    const cells = headers.map((header, columnIndex) => {
      const value = row[header];
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${rowIndex === 0 ? ' s="1"' : ""}><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ""}><is><t>${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${columnName(Math.max(headers.length - 1, 0))}${Math.max(all.length, 1)}"/></worksheet>`;
}

export function createReportXlsx(rows: ReportExportRow[]) {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="AI Dos отчёт" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    "xl/styles.xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF075B3B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>'),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(rows)),
  };
  return zipSync(files, { level: 6 });
}
