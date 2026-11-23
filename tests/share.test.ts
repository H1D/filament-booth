import { describe, expect, test, vi } from "vitest";
import { Booth } from "../src/booth";
import {
  DocumentError, deg, defaultDocument, kelvin, m, mm, watts,
  type BoothDocument,
} from "../src/document";
import { addLight, addProp, applyFilamentPreset, applyLook, applyOpticsPreset } from "../src/edits";
import { partCacheKey, propCacheKey, type PartCache } from "../src/part-cache";
import {
  decodeShareHash, documentFromPatch, documentToPatch, encodeShareHash, encodeShareUrl,
  isDefaultDocument, isShareHash, validPartUrl,
} from "../src/share";
import { InstantPrint, binaryStl } from "./agent-fixtures";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
  };
}

function memoryPartCache(): PartCache {
  const store = new Map<string, { name: string; bytes: ArrayBuffer }>();
  return {
    async put(key, name, bytes) { store.set(key, { name, bytes: bytes.slice(0) }); },
    async get(key) {
      const entry = store.get(key);
      return entry === undefined ? null : new File([entry.bytes], entry.name);
    },
  };
}

function makeRichDocument(): BoothDocument {
  const doc = defaultDocument();
  applyLook("dark")(doc);
  applyFilamentPreset("petg-basic")(doc);
  applyOpticsPreset("macro")(doc);
  doc.filament.recipe.colorHex = "#2a7b6f";
  doc.filament.gloss = 0.72;
  doc.filament.recipe.subsurface = 0.14;
  doc.filament.imperfections.surfaceWear = 0.65;
  doc.filament.imperfections.dust = 0.42;
  doc.studio.backdrop.texture = 0.58;
  doc.studio.backdrop.color = [0.05, 0.06, 0.08];
  doc.studio.world.strength = 0.4;
  addLight("area")(doc);
  const added = doc.studio.lights[doc.studio.lights.length - 1]!;
  if (added.kind === "area") {
    added.name = "Rim kicker";
    added.powerW = watts(180);
    added.color = { kind: "kelvin", kelvin: kelvin(4300) };
  }
  addProp("cylinder", { name: "Stand", size: [m(0.03), m(0.03), m(0.02)] })(doc);
  doc.camera.azimuth = deg(58);
  doc.camera.elevation = deg(24);
  doc.camera.distance = m(0.42);
  doc.camera.fStop = 16;
  doc.camera.focusPartPoint = [m(0.01), m(-0.005), m(0.02)];
  doc.pose.restFace = "top";
  doc.pose.turntableDeg = deg(135);
  doc.slicing.layerHeight = mm(0.28);
  doc.slicing.wallCount = 1;
  doc.output.longEdgePx = 1600;
  doc.output.samples = 64;
  return doc;
}

describe("URL share codec", () => {
  test("losslessly round-trips every BoothDocument setting, including lights, props, optics and Step 2 surface fields", async () => {
    const doc = makeRichDocument();
    const url = await encodeShareUrl("https://booth.artems.net/", doc, {
      name: "widget.stl",
      hash: "0123456789abcdef9999",
      url: "https://cdn.example.com/widget.stl",
    });
    expect(url.startsWith("https://booth.artems.net/#s=1")).toBe(true);
    const parsed = new URL(url);
    expect(isShareHash(parsed.hash)).toBe(true);
    const decoded = await decodeShareHash(parsed.hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.doc).toEqual(doc);
    expect(decoded!.part).toEqual({
      name: "widget.stl",
      hash: "0123456789abcdef",
      url: "https://cdn.example.com/widget.stl",
    });
  });

  test("typical preset-based scenes stay compact because the diff is relative to the look and filament presets", async () => {
    const doc = defaultDocument();
    applyLook("gradient")(doc);
    applyFilamentPreset("pla-matte")(doc);
    doc.filament.recipe.colorHex = "#dad5cc";
    doc.camera.azimuth = deg(37);
    doc.camera.fStop = 22;
    const patch = documentToPatch(doc);
    expect(patch.studio).toBeUndefined();
    const hash = await encodeShareHash(doc, { name: "bin-big.stl", hash: "abcdef0123456789" });
    expect(hash.length).toBeLessThan(260);
    const decoded = await decodeShareHash(hash);
    expect(decoded!.doc).toEqual(doc);
  });

  test("default document encodes as an empty patch and isDefaultDocument detects edits", async () => {
    const def = defaultDocument();
    expect(isDefaultDocument(def)).toBe(true);
    expect(documentToPatch(def)).toEqual({});
    const hash = await encodeShareHash(def);
    const decoded = await decodeShareHash(hash);
    expect(decoded!.doc).toEqual(def);
    expect(decoded!.part).toBeNull();

    const edited = defaultDocument();
    edited.camera.fStop = 18;
    expect(isDefaultDocument(edited)).toBe(false);
  });

  test("documentFromPatch accepts partial JSON and validates bounds through parseDocument", () => {
    const partial = documentFromPatch({
      lookBase: "raking",
      filament: {
        presetId: "pla-silk",
        recipe: { colorHex: "#c9a14e" },
        imperfections: { surfaceWear: 0.5, dust: 0.1 },
      },
      camera: { fStop: 14, azimuth: 50 },
    });
    expect(partial.lookBase).toBe("raking");
    expect(partial.filament.presetId).toBe("pla-silk");
    expect(partial.filament.recipe.colorHex).toBe("#c9a14e");
    expect(partial.camera.fStop).toBe(14);
    expect(partial.camera.azimuth).toBe(50);
    expect(partial.filament.imperfections.surfaceWear).toBe(0.5);
    expect(() => documentFromPatch({ camera: { fStop: 999 } })).toThrow(DocumentError);
    expect(() => documentFromPatch({ lookBase: "nope" })).toThrow(DocumentError);
  });

  test("ignores empty hashes and #agent= pairing hashes, rejects corrupt share payloads, and strips non-http partUrl", async () => {
    expect(isShareHash("")).toBe(false);
    expect(isShareHash("#agent=47615.deadbeef1234")).toBe(false);
    expect(await decodeShareHash("#agent=47615.deadbeef1234")).toBeNull();
    expect(validPartUrl("javascript:alert(1)")).toBeUndefined();
    expect(validPartUrl("file:///etc/passwd")).toBeUndefined();
    expect(validPartUrl("https://example.com/a.stl")).toBe("https://example.com/a.stl");

    await expect(decodeShareHash("#s=2x.abc")).rejects.toThrow(DocumentError);
    await expect(decodeShareHash("#s=1j.!!!")).rejects.toThrow(DocumentError);
    await expect(decodeShareHash("#s=1z.AAAA")).rejects.toThrow(DocumentError);

    const hash = await encodeShareHash(defaultDocument(), { name: "x.stl", url: "javascript:alert(1)" });
    expect(hash).not.toContain("partUrl");
  });
});

describe("Booth.loadShared and PartCache", () => {
  test("auto-restores a cached part and cached prop STL while preserving the shared link's exact camera", async () => {
    const cache = memoryPartCache();
    const stlFile = binaryStl();
    const stlBytes = await stlFile.arrayBuffer();
    const partFile = new File([stlBytes], "widget.stl");

    // First session opens the part and imports a prop STL, populating the cache.
    const first = new Booth({
      storage: memoryStorage(),
      print: new InstantPrint(),
      takePhoto: () => { throw new Error("unused"); },
      partCache: cache,
    });
    await first.open(partFile);
    await first.whenIdle();
    const propMeshId = first.addPropMesh("block.stl", stlBytes);
    first.update((d) => {
      applyLook("dark")(d);
      d.camera.azimuth = deg(73);
      d.camera.elevation = deg(31);
      d.camera.distance = m(0.39);
      d.camera.fStop = 18;
      addProp("mesh", { name: "Block", mesh: propMeshId })(d);
    });
    // Let fire-and-forget cache writes settle.
    await new Promise((r) => setTimeout(r, 20));
    expect(first.partMeta?.name).toBe("widget.stl");
    expect(first.partMeta?.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(await cache.get(partCacheKey(first.partMeta!.hash!))).not.toBeNull();
    expect(await cache.get(propCacheKey(propMeshId))).not.toBeNull();

    const hash = await encodeShareHash(first.doc, first.partMeta);

    // Second fresh session opens the link: exact settings, prop mesh, part AND exact camera come back.
    const second = new Booth({
      storage: memoryStorage(),
      print: new InstantPrint(),
      takePhoto: () => { throw new Error("unused"); },
      partCache: cache,
    });
    const state = (await decodeShareHash(hash))!;
    const result = await second.loadShared(state);
    expect(result.partStatus).toBe("loaded");
    expect(second.partName).toBe("widget");
    expect(second.propMesh(propMeshId)).not.toBeNull();
    expect(second.doc.lookBase).toBe("dark");
    expect(second.doc.camera.azimuth).toBe(deg(73));
    expect(second.doc.camera.elevation).toBe(deg(31));
    expect(second.doc.camera.distance).toBe(m(0.39));
    expect(second.doc.camera.fStop).toBe(18);
  });

  test("when the part is not cached locally, loadShared reports missing and dropping that file later keeps the shared camera", async () => {
    const stlBytes = await binaryStl().arrayBuffer();
    const partFile = new File([stlBytes], "widget.stl");

    const doc = defaultDocument();
    doc.camera.azimuth = deg(88);
    doc.camera.distance = m(0.55);
    doc.camera.fStop = 24;

    const booth = new Booth({
      storage: memoryStorage(),
      print: new InstantPrint(),
      takePhoto: () => { throw new Error("unused"); },
      partCache: memoryPartCache(),
    });
    const res = await booth.loadShared({ doc, part: { name: "widget.stl", hash: "0000000000000000" } });
    expect(res).toEqual({ partStatus: "missing", missingName: "widget.stl" });
    expect(booth.doc.camera.azimuth).toBe(deg(88));
    expect(booth.doc.camera.distance).toBe(m(0.55));

    // User drops the named file: exact shared camera must survive (not be replaced by framePart).
    await booth.open(partFile);
    await booth.whenIdle();
    expect(booth.partName).toBe("widget");
    expect(booth.doc.camera.azimuth).toBe(deg(88));
    expect(booth.doc.camera.distance).toBe(m(0.55));
    expect(booth.doc.camera.fStop).toBe(24);
  });

  test("fetches a remote partUrl when provided and not in local cache", async () => {
    const stlBytes = await binaryStl().arrayBuffer();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(stlBytes, { status: 200 }));
    try {
      const doc = defaultDocument();
      doc.camera.azimuth = deg(64);
      const booth = new Booth({
        storage: memoryStorage(),
        print: new InstantPrint(),
        takePhoto: () => { throw new Error("unused"); },
        partCache: memoryPartCache(),
      });
      const res = await booth.loadShared({
        doc,
        part: { name: "remote.stl", url: "https://example.com/models/remote.stl" },
      });
      expect(fetchMock).toHaveBeenCalledWith("https://example.com/models/remote.stl");
      expect(res.partStatus).toBe("loaded");
      expect(booth.partName).toBe("remote");
      expect(booth.doc.camera.azimuth).toBe(deg(64));
    } finally {
      fetchMock.mockRestore();
    }
  });
});
