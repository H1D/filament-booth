import { CameraPanel } from "./CameraPanel";
import { FilamentPanel } from "./FilamentPanel";
import { LightsPanel } from "./LightsPanel";
import { OutputPanel, PosePanel } from "./OutputPanels";
import { PartPanel } from "./PartPanel";
import { Section } from "./Section";
import { SetupPanel } from "./SetupPanel";
import { WorldPanel } from "./WorldPanel";

/** The control rail. Lights opens first: it is what a photographer reaches for. */
export function Rail() {
  return (
    <aside className="rail" aria-label="Controls">
      <Section id="part" open><PartPanel /></Section>
      <Section id="filament"><FilamentPanel /></Section>
      <Section id="lights" open><LightsPanel /></Section>
      <Section id="world"><WorldPanel /></Section>
      <Section id="camera"><CameraPanel /></Section>
      <Section id="pose"><PosePanel /></Section>
      <Section id="output"><OutputPanel /></Section>
      <Section id="setup"><SetupPanel /></Section>
    </aside>
  );
}
