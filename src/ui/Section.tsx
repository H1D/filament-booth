import type { ReactNode } from "react";
import { useDoc, useEdit, useFilamentModified, usePrint } from "./hooks";
import { Icon } from "./icons";
import { SECTION_TITLES, sectionState, type SectionId } from "./model";

/**
 * One collapsible rail section. The header shows a marker when the section
 * differs from its default, and a reset only then, so an untouched rail is
 * quiet and a touched one says where the changes are.
 */
export function Section({ id, open, children }: { id: SectionId; open?: boolean; children: ReactNode }) {
  const doc = useDoc();
  const print = usePrint();
  const filamentModified = useFilamentModified();
  const edit = useEdit();
  const { modified, reset } = sectionState(id, { doc, print, filamentModified });
  const title = SECTION_TITLES[id];

  return (
    <details className="section" open={open} data-section={id} data-modified={modified || undefined}>
      <summary>
        <Icon name="chevron" />
        <h2>{title}</h2>
        {modified ? <span className="mod" title="Changed from its default"><span className="sr-only">modified</span></span> : null}
        {modified && reset !== null ? (
          <button type="button" className="reset" aria-label={`Reset ${title}`} title={`Reset ${title.toLowerCase()}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); edit(reset); }}>
            <Icon name="reset" /><span>Reset</span>
          </button>
        ) : null}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
