"use client";

import { buildReport } from "@/lib/report";
import type { ChecklistItem, ProjectProfile } from "@/lib/types";

export function ReportView({
  profile,
  checklist,
  onClose,
  onDownload,
  downloading,
}: {
  profile: ProjectProfile;
  checklist: ChecklistItem[];
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const report = buildReport(profile, checklist);
  return (
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div
        className="report-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <article className="report-paper">
          <div className="rule" />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <p className="kicker" style={{ margin: 0 }}>{report.kicker}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ghost" type="button" onClick={onDownload} disabled={downloading}>
                {downloading ? "Preparing PDF…" : "Download PDF"}
              </button>
              <button className="ghost" type="button" onClick={onClose}>Close</button>
            </div>
          </div>
          <h2 id="report-title" className="report-title">{report.title}</h2>
          <p className="disclaimer">{report.disclaimer}</p>
          <table className="profile-table">
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.sections.map((section) => (
            <section className="report-section" key={`${section.section}-${section.title}`}>
              <div className="section-no">{section.section}</div>
              <header style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <h3>{section.title}</h3>
                <span className="pill">{section.applies ? "Applies" : "Not applied"}</span>
              </header>
              <p style={{ color: "var(--muted)", marginTop: 0 }}>{section.status} · {section.citation}</p>
              <p>{section.summary}</p>
              <p className="mini-label">Requirements</p>
              <ul>{section.requirements.map((line) => <li key={line}>{line}</li>)}</ul>
              <p className="mini-label">Exceptions</p>
              <ul>{section.exceptions.map((line) => <li key={line}>{line}</li>)}</ul>
              {section.notes ? (
                <>
                  <p className="mini-label">Notes</p>
                  <p>{section.notes}</p>
                </>
              ) : null}
              {section.sources.length > 0 ? (
                <p className="mini-label">
                  Sources:{" "}
                  {section.sources.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>
                      {source.label}
                    </a>
                  ))}
                </p>
              ) : null}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
