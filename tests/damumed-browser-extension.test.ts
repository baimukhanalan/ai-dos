import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "workers/damumed-browser-extension");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const background = readFileSync(join(root, "background.js"), "utf8");
const content = readFileSync(join(root, "content.js"), "utf8");

describe("DAMUMED browser bridge safety contract", () => {
  it("runs only on the supplied registry host", () => {
    expect(manifest.content_scripts[0].matches).toEqual([
      "https://reg-ala.dmed.kz/*",
    ]);
    expect(manifest.permissions).not.toContain("cookies");
    expect(manifest.permissions).not.toContain("webRequest");
  });

  it("starts disabled and in dry-run mode", () => {
    expect(background).toContain("enabled: false");
    expect(background).toContain("dryRun: true");
    expect(background.indexOf("if (config.dryRun)")).toBeLessThan(
      background.indexOf('api("/api/mis/queue?limit=1")'),
    );
  });

  it("never reports success before re-reading patient and slot", () => {
    expect(content).toContain("A submit is not success");
    expect(content).toContain("После сохранения пациент не появился");
    expect(content.indexOf("const verifiedCard = await waitFor")).toBeLessThan(
      content.indexOf('status: "synced"'),
    );
  });

  it("rejects occupied schedule cards before scanning or clicking a slot", () => {
    expect(content).toContain("occupiedSlotMarkers");
    expect(content).toContain("slotLooksAvailable(element)");
    expect(content).toContain('"контакты"');
    expect(content).toContain('"консультация:"');
  });

  it("does not create patients or handle IIN", () => {
    expect(content).not.toContain("createPatient");
    expect(content).not.toContain("patientIin");
    expect(background).not.toContain("patientIin");
  });
});
