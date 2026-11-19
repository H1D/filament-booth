import { describe, expect, test } from "vitest";
import {
  COLLECTIONS, CYCLES_FILM, OPS, RNA, UNMAPPED, handleKey, parseHandle, reachedFields, referenceText, uniqueNames,
  type CollectionName, type Handle, type Member, type RnaTypeName,
} from "../src/agent/rna";
import {
  AGX_LOOKS, BED_TYPES, OVERLAYS, REST_FACES, SEAM_POSITIONS, TOP_SURFACE_PATTERNS, defaultDocument, kelvin, m,
  type BoothDocument,
} from "../src/document";
import { LOOK_PRESETS } from "../src/presets";
import { FILM_DEFAULTS } from "../src/scene";

/** Every leaf path of a document, `[]` standing for any light. A number array (a colour, a point) is one leaf. */
function leaves(value: unknown, path = ""): string[] {
  const at = (key: string) => (path === "" ? key : `${path}.${key}`);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "number")) return [path];
    return [...new Set(value.flatMap((v) => leaves(v, `${path}[]`)))];
  }
  if (typeof value === "object" && value !== null) return Object.entries(value).flatMap(([k, v]) => leaves(v, at(k)));
  return [path];
}

/** The default document plus the shapes it does not show: floor cards on, a kelvin light, a focus point. */
function documents(): BoothDocument[] {
  const varied = defaultDocument();
  varied.studio = structuredClone(LOOK_PRESETS.gradient.studio);
  varied.studio.lights[0].color = { kind: "kelvin", kelvin: kelvin(4800) };
  varied.camera.focusPartPoint = [m(0), m(0), m(0.01)];
  return [defaultDocument(), varied];
}

const covers = (prefix: string, leaf: string) => leaf === prefix || leaf.startsWith(`${prefix}.`) || leaf.startsWith(`${prefix}[`);

describe("coverage of the document", () => {
  const all = [...new Set(documents().flatMap((d) => leaves(d)))].sort();
  const reached = reachedFields();

  test("every leaf is reached by a bpy attribute or named in UNMAPPED with a reason", () => {
    const orphans = all.filter((leaf) => !reached.some((r) => covers(r, leaf)) && !Object.keys(UNMAPPED).some((u) => covers(u, leaf)));
    expect(orphans).toEqual([]);
  });

  test("every field the table claims is a real document field", () => {
    const unknown = reached.filter((r) => !all.some((leaf) => covers(r, leaf)));
    expect(unknown).toEqual([]);
  });

  test("UNMAPPED names real fields that no attribute reaches", () => {
    for (const [path, why] of Object.entries(UNMAPPED)) {
      expect(all.some((leaf) => covers(path, leaf)), path).toBe(true);
      expect(reached.some((r) => covers(r, path) || covers(path, r)), path).toBe(false);
      expect(why.length).toBeGreaterThan(10);
    }
  });
});

describe("enums", () => {
  const LISTS: Readonly<Record<string, readonly string[]>> = {
    "ViewSettings.look": AGX_LOOKS,
    "BoothPart.rest_face": REST_FACES,
    "BoothSlicing.top_surface_pattern": TOP_SURFACE_PATTERNS,
    "BoothSlicing.seam_position": SEAM_POSITIONS,
    "BoothFilament.bed": ["auto", ...BED_TYPES],
    "BoothImperfections.overlay": OVERLAYS,
  };

  test("every enum maps one to one onto the document's own list", () => {
    const seen: string[] = [];
    for (const [typeName, t] of Object.entries(RNA)) {
      for (const [attr, prop] of Object.entries(t.props)) {
        if (prop.kind !== "choice") continue;
        const name = `${typeName}.${attr}`;
        seen.push(name);
        const values = Object.values(prop.map);
        expect(new Set(values).size, name).toBe(values.length);
        expect([...values].sort(), name).toEqual([...(LISTS[name] ?? [])].sort());
      }
    }
    expect(seen.sort()).toEqual(Object.keys(LISTS).sort());
  });

  test("Blender's look names are the ones render_scene.py sets", () => {
    const look = RNA.ViewSettings.props.look;
    expect(look.kind === "choice" && look.map["AgX - Medium High Contrast"]).toBe("medium-high-contrast");
    expect(look.kind === "choice" && look.map.None).toBe("none");
  });
});

describe("fixed values", () => {
  test("every FILM_DEFAULTS value is a fixed Cycles attribute holding that value", () => {
    const cycles = RNA.CyclesRenderSettings.props;
    for (const [key, attr] of Object.entries(CYCLES_FILM)) {
      expect(cycles[attr], attr).toEqual(expect.objectContaining({ kind: "fixed", value: FILM_DEFAULTS[key as keyof typeof FILM_DEFAULTS] }));
    }
    expect(Object.keys(CYCLES_FILM).sort()).toEqual(Object.keys(FILM_DEFAULTS).sort());
  });
});

describe("structure", () => {
  test("every type is reachable from bpy.data or bpy.context", () => {
    const seen = new Set<RnaTypeName>();
    const visit = (name: RnaTypeName) => {
      if (seen.has(name)) return;
      seen.add(name);
      for (const prop of Object.values(RNA[name].props)) {
        if (prop.kind === "pointer") visit(prop.type);
        if (prop.kind === "collection") for (const member of everyMember(prop.collection)) visit(member.type);
        if (prop.kind === "codec" && prop.codec.wrap !== null && typeof prop.codec.wrap === "object") visit(prop.codec.wrap.struct);
      }
    };
    visit("BlendData");
    visit("Context");
    expect([...Object.keys(RNA)].filter((n) => !seen.has(n as RnaTypeName))).toEqual([]);
  });

  test("a handle survives its FFI spelling, and junk is refused", () => {
    const handles: Handle[] = [{ t: "scene" }, { t: "camera" }, { t: "part" }, { t: "light", id: "rim:left" }, { t: "image", id: "studio_small_09_1k" }];
    for (const h of handles) expect(parseHandle(handleKey(h))).toEqual(h);
    expect(parseHandle("light:")).toBeNull();
    expect(parseHandle("lamp:key")).toBeNull();
    expect(parseHandle("cube")).toBeNull();
  });

  test("names are made unique as Blender does, first come first served", () => {
    const named = (...names: string[]): Member[] => names.map((name, i) => ({ name, handle: { t: "light", id: `l${i}` }, type: "LightObject" }));
    expect(uniqueNames(named("Key", "Fill", "Key", "Key", "Key.001")).map((x) => x.name)).toEqual(["Key", "Fill", "Key.001", "Key.002", "Key.003"]);
  });
});

/** A part is open and the gradient look has floor cards, so every collection shows all it can hold. */
function everyMember(collection: CollectionName): readonly Member[] {
  const doc = documents()[1];
  return COLLECTIONS[collection].members({ doc, partName: "bracket" });
}

describe("the reference", () => {
  const text = referenceText();

  test("names every type and operator", () => {
    for (const name of Object.keys(RNA)) expect(text).toContain(`\n${name}: `);
    for (const op of Object.keys(OPS)) expect(text).toContain(`bpy.ops.${op}(`);
  });

  test("shows limits from BOUNDS in bpy units", () => {
    expect(referenceText("AreaLight")).toContain(".energy: float W, 0 to 1000000");
    expect(referenceText("AreaLight")).toContain(".spread: float rad, 0.0174533 to 3.14159");
    expect(referenceText("CyclesRenderSettings")).toContain(".samples: int, 1 to 65536");
    expect(referenceText("AreaLight")).toContain(".shadow_soft_size: not in the booth: ");
  });

  test("narrows to one type, one Python class or one operator", () => {
    expect(referenceText("bpy.ops.object.light_add")).toMatch(/^bpy\.ops\.object\.light_add\(\.\.\.\)/);
    const objects = referenceText("Object");
    for (const t of ["LightObject", "ScrimObject", "CameraObject", "BackdropObject", "PartObject"]) expect(objects).toContain(`${t}: Object`);
    expect(() => referenceText("SpotLight")).toThrow(/no type or operator named 'SpotLight'/);
  });
});
