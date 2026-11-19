import { BOUNDS, deg, type Studio } from "../document";
import { hexToLinear, linearToHex } from "./color";
import { ColorField, Group, Slider, Switch, linear } from "./controls";
import { useDoc, useEdit } from "./host";
import { lookStudio } from "./model";

const ROUGHNESS = linear(BOUNDS.backdropRoughness);
const STRENGTH = linear(BOUNDS.worldStrength);
const ROTATION = linear(BOUNDS.worldRotationDeg);
const RADIANCE = linear(BOUNDS.radiance);
const AZIMUTH = linear(BOUNDS.azimuth);

/** What switching floor cards on starts from: the gradient look's ring. */
const FLOOR_CARDS_ON: NonNullable<Studio["floorCards"]> = { keySide: 3.5, farSide: 0.05, azimuth: deg(-90) };

export function WorldPanel() {
  const doc = useDoc();
  const edit = useEdit();
  const { backdrop, world, floorCards } = doc.studio;
  const look = lookStudio(doc.lookBase);
  const setStudio = (change: (s: Studio) => void) => { edit((d) => { change(d.studio); }); };
  const cards = look?.floorCards ?? null;

  return (
    <>
      <Group title="Backdrop">
        <ColorField label="Colour" value={linearToHex(backdrop.color)}
          hint="The sweep the part sits on."
          onChange={(hex) => {
            const rgb = hexToLinear(hex);
            if (rgb !== null) setStudio((s) => { s.backdrop.color = rgb; });
          }} />
        <Slider label="Roughness" mapping={ROUGHNESS} value={backdrop.roughness} defaultValue={look?.backdrop.roughness}
          onChange={(v) => { setStudio((s) => { s.backdrop.roughness = v; }); }} />
      </Group>

      <Group title="Environment">
        <Slider label="HDR strength" mapping={STRENGTH} value={world.strength} defaultValue={look?.world.strength}
          hint="Ambient light from the HDR image. Dark looks keep it near zero."
          onChange={(v) => { setStudio((s) => { s.world.strength = v; }); }} />
        <Slider label="HDR rotation" unit="°" mapping={ROTATION} value={world.rotationDeg} defaultValue={look?.world.rotationDeg}
          hint="Turns the reflections the HDR paints on glossy parts."
          onChange={(v) => { setStudio((s) => { s.world.rotationDeg = deg(v); }); }} />
      </Group>

      <Group title="Floor cards">
        <Switch label="Floor cards" checked={floorCards !== null}
          hint="A reflector ring on the table. Glossy surfaces reflect it. The camera and the backdrop never see it."
          onChange={(on) => { setStudio((s) => { s.floorCards = on ? { ...FLOOR_CARDS_ON } : null; }); }} />
        {floorCards === null ? null : (
          <>
            <Slider label="Key side" mapping={RADIANCE} value={floorCards.keySide} defaultValue={cards?.keySide}
              hint="Brightness of the ring on the side the key light is on."
              onChange={(v) => { setStudio((s) => { if (s.floorCards) s.floorCards.keySide = v; }); }} />
            <Slider label="Far side" mapping={RADIANCE} value={floorCards.farSide} defaultValue={cards?.farSide}
              onChange={(v) => { setStudio((s) => { if (s.floorCards) s.floorCards.farSide = v; }); }} />
            <Slider label="Key side azimuth" unit="°" mapping={AZIMUTH} value={floorCards.azimuth} defaultValue={cards?.azimuth}
              onChange={(v) => { setStudio((s) => { if (s.floorCards) s.floorCards.azimuth = deg(v); }); }} />
          </>
        )}
      </Group>
    </>
  );
}
