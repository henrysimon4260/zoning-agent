"use client";

import { CONSTRUCTION_LABELS, formatNumber, formatSqFt, jurisdictionLabel, projectTitle } from "@/lib/format";
import { CONSTRUCTION_TYPES, type ChecklistItem, type CodeEdition, type NycParcel, type ProjectProfile, type ProjectScope, type Sprinkler } from "@/lib/types";

const EDITIONS: CodeEdition[] = ["2021", "2018", "2024", "unknown"];
const SCOPES: { value: ProjectScope | ""; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "new", label: "New building" },
  { value: "addition", label: "Addition" },
  { value: "alteration", label: "Alteration" },
  { value: "change-of-occupancy", label: "Change of occupancy" },
  { value: "unknown", label: "Unknown" },
];
const SYSTEMS: { value: Sprinkler | ""; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "nfpa13", label: "NFPA 13" },
  { value: "nfpa13r", label: "NFPA 13R" },
  { value: "nfpa13d", label: "NFPA 13D" },
  { value: "none", label: "None" },
  { value: "unknown", label: "Unknown" },
];

export function Sheet({
  open,
  profile,
  checklist,
  tab,
  stale,
  onTab,
  onClose,
  onProfile,
  onToggle,
  onNote,
  onRedraft,
}: {
  open: boolean;
  profile: ProjectProfile;
  checklist: ChecklistItem[];
  tab: "profile" | "checklist";
  stale: boolean;
  onTab: (tab: "profile" | "checklist") => void;
  onClose: () => void;
  onProfile: (patch: Partial<ProjectProfile>) => void;
  onToggle: (id: string, applies: boolean) => void;
  onNote: (id: string, notes: string) => void;
  onRedraft: () => void;
}) {
  const filled = [
    profile.name || profile.address,
    profile.state && (profile.city || profile.county),
    profile.occupancy.length,
    profile.constructionType,
    profile.zoningDistrict,
    profile.stories || profile.heightFt,
    profile.areaSqFt,
    profile.sprinkler,
    profile.lotSqFt,
    profile.scope,
  ].filter(Boolean).length;
  const exceeds = checklist.filter((item) => item.applies && item.status === "exceeds").length;

  return (
    <aside className={open ? "sheet open" : "sheet"} aria-label="Project sheet">
      <div className="sheet-head">
        <div>
          <div className="sheet-kicker">Sheet A-001 · {exceeds ? `${exceeds} over limit` : "Project data"}</div>
          <h2>{projectTitle(profile)}</h2>
        </div>
        <button className="ghost mobile-toggle" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="meter" aria-hidden><i style={{ width: `${(filled / 10) * 100}%` }} /></div>
      <div className="tabs" role="tablist">
        <button className="tab" type="button" role="tab" aria-selected={tab === "profile"} onClick={() => onTab("profile")}>Profile</button>
        <button className="tab" type="button" role="tab" aria-selected={tab === "checklist"} onClick={() => onTab("checklist")}>Checklist</button>
      </div>
      <div className="sheet-body">
        {tab === "profile" ? (
          <ProfileForm profile={profile} onProfile={onProfile} />
        ) : (
          <Checklist
            checklist={checklist}
            stale={stale}
            place={jurisdictionLabel(profile)}
            onToggle={onToggle}
            onNote={onNote}
            onRedraft={onRedraft}
          />
        )}
      </div>
    </aside>
  );
}

function ParcelCard({ parcel }: { parcel: NycParcel }) {
  const facts = [
    parcel.commercialOverlays.length ? ["Overlay", parcel.commercialOverlays.join(", ")] : null,
    parcel.specialDistricts.length ? ["Special district", parcel.specialDistricts.join(", ")] : null,
    parcel.subdistricts.length ? ["Subdistrict", parcel.subdistricts.join(", ")] : null,
    parcel.limitedHeight ? ["Limited height", parcel.limitedHeight] : null,
    parcel.eDesignations.length ? ["E-designation", parcel.eDesignations.map((item) => (item.note ? `${item.id} · ${item.note}` : item.id)).join("; ")] : null,
    parcel.mandatoryInclusionary.length ? ["MIH", parcel.mandatoryInclusionary.join("; ")] : null,
    parcel.inclusionaryHousing.length ? ["Inclusionary", parcel.inclusionaryHousing.join("; ")] : null,
    parcel.transitZone ? ["Transit area", parcel.transitZone] : null,
    parcel.waterfront ? ["Waterfront", parcel.waterfront] : null,
    parcel.historicDistrict ? ["Historic district", parcel.historicDistrict] : null,
    parcel.landmark ? ["Landmark", parcel.landmark] : null,
    parcel.certificateOfOccupancy
      ? ["Latest BIS CO", `${parcel.certificateOfOccupancy.provisional ? "Temporary" : parcel.certificateOfOccupancy.issueType || "On file"} ${parcel.certificateOfOccupancy.jobType} · ${parcel.certificateOfOccupancy.date}`]
      : null,
    parcel.billingLot ? ["Condo", `Billing lot${parcel.condoNumber ? ` ${parcel.condoNumber}` : ""}${parcel.unitBbl ? ` · unit BBL ${parcel.unitBbl}` : ""}`] : null,
  ].filter((row): row is string[] => Boolean(row));
  return (
    <aside className="parcel-card">
      <p className="sheet-kicker">{parcel.borough}{parcel.splitZone ? " · Split lot" : ""} · BBL {parcel.bbl}</p>
      <p className="parcel-address">{parcel.address}</p>
      <p className="parcel-meta">
        Block {parcel.block}, lot {parcel.lot}
        {parcel.bin ? ` · BIN ${parcel.bin}` : ""}
      </p>
      <div className="parcel-districts">
        {(parcel.zoningDistricts.length ? parcel.zoningDistricts : ["District not in the extract"]).map((district) => (
          <span className="district" key={district}>{district}</span>
        ))}
      </div>
      {facts.length ? (
        <dl className="parcel-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="parcel-meta">
        {[
          parcel.lotArea != null ? formatSqFt(parcel.lotArea) : "",
          parcel.lotFront != null ? `${formatNumber(parcel.lotFront)} ft front` : "",
          parcel.builtFar != null ? `built FAR ${parcel.builtFar}` : "",
          parcel.buildingClass ? `class ${parcel.buildingClass}` : "",
          parcel.yearBuilt ? `built ${parcel.yearBuilt}` : "",
        ].filter(Boolean).join(" · ")}
      </p>
      {parcel.layerGaps.length ? (
        <ul className="parcel-gaps">
          {parcel.layerGaps.map((gap) => <li key={gap}>{gap}</li>)}
        </ul>
      ) : null}
      <p><a href={parcel.zolaUrl} target="_blank" rel="noreferrer">Open this lot in ZoLa</a></p>
    </aside>
  );
}

function ProfileForm({ profile, onProfile }: { profile: ProjectProfile; onProfile: (patch: Partial<ProjectProfile>) => void }) {
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      {profile.parcel ? <ParcelCard parcel={profile.parcel} /> : null}
      <label className="field"><span>Name</span><input value={profile.name} onChange={(event) => onProfile({ name: event.target.value })} /></label>
      <label className="field"><span>Address</span><input value={profile.address} onChange={(event) => onProfile({ address: event.target.value })} /></label>
      <div className="grid-2">
        <label className="field"><span>City</span><input value={profile.city} onChange={(event) => onProfile({ city: event.target.value })} /></label>
        <label className="field"><span>State</span><input value={profile.state} onChange={(event) => onProfile({ state: event.target.value })} /></label>
      </div>
      <label className="field"><span>County</span><input value={profile.county} onChange={(event) => onProfile({ county: event.target.value })} /></label>
      <label className="field">
        <span>Occupancy</span>
        <input value={profile.occupancy.join(", ")} onChange={(event) => onProfile({ occupancy: event.target.value.split(",").map((part) => part.trim()).filter(Boolean) })} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Construction</span>
          <select value={profile.constructionType} onChange={(event) => onProfile({ constructionType: event.target.value as ProjectProfile["constructionType"] })}>
            <option value="">Not set</option>
            {CONSTRUCTION_TYPES.map((type) => <option key={type} value={type}>{CONSTRUCTION_LABELS[type]}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Sprinklers</span>
          <select value={profile.sprinkler} onChange={(event) => onProfile({ sprinkler: event.target.value as Sprinkler | "" })}>
            {SYSTEMS.map((system) => <option key={system.label} value={system.value}>{system.label}</option>)}
          </select>
        </label>
      </div>
      <div className="grid-2">
        <label className="field"><span>Zoning district</span><input value={profile.zoningDistrict} onChange={(event) => onProfile({ zoningDistrict: event.target.value })} /></label>
        <label className="field"><span>Overlays</span><input value={profile.overlays.join(", ")} onChange={(event) => onProfile({ overlays: event.target.value.split(",").map((part) => part.trim()).filter(Boolean) })} /></label>
      </div>
      <div className="grid-2">
        <NumberField label="Stories" value={profile.stories} onChange={(stories) => onProfile({ stories })} />
        <NumberField label="Height (ft)" value={profile.heightFt} onChange={(heightFt) => onProfile({ heightFt })} />
      </div>
      <div className="grid-2">
        <NumberField label="Area (sf)" value={profile.areaSqFt} onChange={(areaSqFt) => onProfile({ areaSqFt })} />
        <label className="field">
          <span>Area basis</span>
          <select value={profile.areaBasis} onChange={(event) => onProfile({ areaBasis: event.target.value as ProjectProfile["areaBasis"] })}>
            <option value="">Not set</option>
            <option value="per-story">Per story</option>
            <option value="total">Whole building</option>
          </select>
        </label>
      </div>
      <div className="grid-2">
        <NumberField label="Lot (sf)" value={profile.lotSqFt} onChange={(lotSqFt) => onProfile({ lotSqFt })} />
        <NumberField label="Lot width (ft)" value={profile.lotWidthFt} onChange={(lotWidthFt) => onProfile({ lotWidthFt })} />
      </div>
      <div className="grid-2">
        <NumberField label="Open perimeter %" value={profile.frontagePercent} onChange={(frontagePercent) => onProfile({ frontagePercent })} />
        <NumberField label="Narrowest yard (ft)" value={profile.openSpaceFt} onChange={(openSpaceFt) => onProfile({ openSpaceFt })} />
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Scope</span>
          <select value={profile.scope} onChange={(event) => onProfile({ scope: event.target.value as ProjectScope | "" })}>
            {SCOPES.map((scope) => <option key={scope.label} value={scope.value}>{scope.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Code edition</span>
          <select value={profile.codeEdition} onChange={(event) => onProfile({ codeEdition: event.target.value as CodeEdition })}>
            {EDITIONS.map((edition) => <option key={edition} value={edition}>{edition === "unknown" ? "Not specified" : edition}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Notes</span><textarea rows={3} value={profile.notes} onChange={(event) => onProfile({ notes: event.target.value })} /></label>
    </form>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={value ?? ""}
        onChange={(event) => {
          if (event.target.value === "") onChange(null);
          else {
            const parsed = Number(event.target.value);
            onChange(Number.isFinite(parsed) ? parsed : null);
          }
        }}
      />
    </label>
  );
}

function Checklist({
  checklist,
  stale,
  place,
  onToggle,
  onNote,
  onRedraft,
}: {
  checklist: ChecklistItem[];
  stale: boolean;
  place: string;
  onToggle: (id: string, applies: boolean) => void;
  onNote: (id: string, notes: string) => void;
  onRedraft: () => void;
}) {
  if (checklist.length === 0) {
    return (
      <div className="empty-check">
        <p>The checklist lands here after the last question, or whenever you ask to draft it.</p>
        <p>{place ? `Jurisdiction on file: ${place}.` : "An address in the five boroughs fills the parcel before the questions start."}</p>
      </div>
    );
  }
  return (
    <div>
      {stale ? (
        <div className="banner">
          <span>The profile changed after this draft.</span>
          <button className="solid" type="button" onClick={onRedraft}>Update checklist</button>
        </div>
      ) : null}
      {(["building", "zoning"] as const).map((domain) => (
        <div key={domain}>
          <p className="group-label">{domain === "building" ? "Building code" : "Zoning"}</p>
          {checklist.filter((item) => item.domain === domain).map((item) => (
            <article className="check-card" key={item.id}>
              <header>
                <span className="section-no">{item.section}</span>
                <span className={`pill ${item.status}`}>{labelStatus(item.status)}</span>
              </header>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <p className="mini-label">Requirements</p>
              <ul>{item.requirements.map((line) => <li key={line}>{line}</li>)}</ul>
              <p className="mini-label">Exceptions</p>
              <ul>{item.exceptions.map((line) => <li key={line}>{line}</li>)}</ul>
              <div className="switch">
                <button type="button" role="switch" aria-checked={item.applies} aria-label={`${item.title} applies`} onClick={() => onToggle(item.id, !item.applies)}>
                  <i />
                </button>
                {item.applies ? "Applies to this project" : "Does not apply"}
                <span className={`pill ${item.citation}`}>{citationLabel(item.citation)}</span>
              </div>
              <label className="field" style={{ marginTop: 8 }}>
                <span>Notes</span>
                <textarea className="note" rows={2} value={item.notes} onChange={(event) => onNote(item.id, event.target.value)} />
              </label>
              {item.sources.length > 0 ? (
                <p className="mini-label">
                  {item.sources.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>{source.label}</a>
                  ))}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ))}
    </div>
  );
}

function labelStatus(status: ChecklistItem["status"]): string {
  if (status === "within") return "Within limit";
  if (status === "exceeds") return "Over limit";
  if (status === "review") return "Review";
  return "Background";
}

function citationLabel(citation: ChecklistItem["citation"]): string {
  if (citation === "verified") return "Verified";
  if (citation === "unverified") return "Unverified";
  return "Model code";
}
