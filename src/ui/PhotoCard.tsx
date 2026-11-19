import { useEffect, useRef } from "react";
import type { Photo, StoppedBy } from "../photo/photo";
import { downloadAs } from "./download";
import { useHost, usePhotoSession } from "./hooks";
import { Icon } from "./icons";
import { formatDuration, formatEta } from "./model";
import type { LiveProgress, Shot } from "./photo-session";

const ENGINE_NAMES = { cycles: "Cycles", raster: "Raster" } as const satisfies Record<Photo["engine"], string>;

const STATE_LABELS: Record<LiveProgress["state"], string> = {
  preparing: "Preparing", rendering: "Rendering", developing: "Developing",
};

/** The refining image is an ImageBitmap, so it is painted onto a canvas that keeps the film's shape. */
function Refining({ image }: { image: ImageBitmap | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (el === null || image === null) return;
    el.width = image.width;
    el.height = image.height;
    el.getContext("2d")?.drawImage(image, 0, 0);
  }, [image]);
  return image === null
    ? <div className="photo-frame empty" aria-hidden="true" />
    : <canvas ref={canvas} className="photo-frame" aria-label="The photo so far" role="img" />;
}

export function PhotoCard() {
  const { photos } = useHost();
  const { run, shots, shownId } = usePhotoSession();
  const card = useRef<HTMLElement>(null);
  const shown = shots.find((s) => s.id === shownId) ?? null;
  const running = run.phase === "running";

  useEffect(() => {
    if (running) card.current?.focus();
  }, [running]);

  if (run.phase === "idle" && shots.length === 0) return null;
  const progress = run.phase === "running" ? run.progress : null;
  const fraction = progress?.state === "rendering" ? progress.fraction : null;

  return (
    <section ref={card} className="photo-card" aria-label="Photo" tabIndex={-1} data-phase={run.phase}>
      <header>
        <h2>Photo</h2>
        <span className="state" role="status">
          {progress !== null ? STATE_LABELS[progress.state]
            : run.phase === "cancelled" ? "Cancelled"
              : run.phase === "failed" ? "Failed"
                : shown !== null ? "Done" : ""}
        </span>
        {!running ? (
          <button type="button" className="icon-btn" aria-label="Close the photo card" title="Close" onClick={() => { photos.dismiss(); }}>
            <Icon name="close" />
          </button>
        ) : null}
      </header>

      {progress !== null ? (
        <div className="photo-body">
          <Refining image={progress.state === "rendering" ? progress.image : null} />
          <progress aria-label="Photo progress" max={1} value={fraction ?? undefined} />
          <p className="readout">
            {progress.state === "preparing" ? progress.message
              : progress.state === "developing" ? "Developing the final image"
                : `${Math.round((fraction ?? 0) * 100)} percent${progress.etaS === null ? ", estimating the time" : `, ${formatEta(progress.etaS)}`}`}
          </p>
          <div className="actions">
            <button type="button" className="btn" disabled={progress.state !== "rendering"} onClick={() => { photos.finishNow(); }}>
              Finish now
            </button>
            <button type="button" className="btn quiet" onClick={() => { photos.cancel(); }}>Cancel</button>
          </div>
        </div>
      ) : run.phase === "failed" ? (
        <p className="note" data-tone="warn">The photo failed. {run.message}</p>
      ) : run.phase === "cancelled" ? (
        <p className="note">Cancelled. Nothing was saved.</p>
      ) : shown !== null ? (
        <Result shot={shown} />
      ) : null}

      {shots.length > 0 ? (
        <ul className="thumbs" aria-label="Photos taken this session">
          {shots.map((shot, i) => (
            <li key={shot.id}>
              <button type="button" aria-pressed={shot.id === shownId} aria-label={`Photo ${i + 1}, ${shot.photo.width} by ${shot.photo.height}`}
                onClick={() => { photos.show(shot.id); }}>
                <img src={shot.url} alt="" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const samplesText = ({ samples, targetSamples }: Photo): string =>
  samples < targetSamples ? `${samples} of ${targetSamples} samples` : `${samples} samples`;

function stopText(stoppedBy: Exclude<StoppedBy, { kind: "samples" }>): string {
  return stoppedBy.kind === "time-limit" ? `Stopped at the ${formatDuration(stoppedBy.limitS, true)} limit.` : "Finished early.";
}

function Result({ shot }: { shot: Shot }) {
  const { photo } = shot;
  return (
    <div className="photo-body">
      <img className="photo-frame" src={shot.url} alt={`Finished photo, ${photo.fileName}`} width={photo.width} height={photo.height} />
      <p className="readout">
        {photo.width} by {photo.height} px, {samplesText(photo)}, {ENGINE_NAMES[photo.engine]}
      </p>
      {photo.stoppedBy.kind === "samples" ? null : <p className="readout" data-stopped-by={photo.stoppedBy.kind}>{stopText(photo.stoppedBy)}</p>}
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => { downloadAs(photo.fileName, photo.png); }}>
          <Icon name="save" />Save
        </button>
      </div>
    </div>
  );
}
