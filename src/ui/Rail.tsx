import { AgentPanel } from "./AgentPanel";
import { CameraPanel } from "./CameraPanel";
import { FilamentPanel } from "./FilamentPanel";
import { LightsPanel } from "./LightsPanel";
import { OutputPanel, PosePanel } from "./OutputPanels";
import { useUi } from "./hooks";
import { PartPanel } from "./PartPanel";
import { PropsPanel } from "./PropsPanel";
import { Section } from "./Section";
import { ScenesPanel } from "./ScenesPanel";
import { SetupPanel } from "./SetupPanel";
import { WorldPanel } from "./WorldPanel";

/** The control rail. Lights opens first: it is what a photographer reaches for. */
export function Rail() {
  const { showAgent } = useUi();
  return (
    <aside className="rail" aria-label="Controls">
      <Section id="scenes" open><ScenesPanel /></Section>
      <Section id="part" open><PartPanel /></Section>
      <Section id="filament"><FilamentPanel /></Section>
      <Section id="lights" open><LightsPanel /></Section>
      <Section id="props"><PropsPanel /></Section>
      <Section id="world"><WorldPanel /></Section>
      <Section id="camera"><CameraPanel /></Section>
      <Section id="pose"><PosePanel /></Section>
      <Section id="output"><OutputPanel /></Section>
      <Section id="setup"><SetupPanel /></Section>
      <Section id="agent" open={showAgent}><AgentPanel /></Section>
    </aside>
  );
}
