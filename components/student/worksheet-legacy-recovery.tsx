import { downloadLegacySource } from "./hooks/use-worksheets";
import type { useWorksheets } from "./hooks/use-worksheets";
import { hasOutstandingLegacyEntries, legacySourceLabels, outstandingRecoveryEntry } from "./hooks/worksheet-recovery";
import type { LegacySnapshot } from "./hooks/worksheet-recovery";

type Props = Pick<ReturnType<typeof useWorksheets>, "legacy" | "legacyError" | "legacyMessage" | "legacyUnavailable" | "unarchived" |
  "acknowledgeLegacy" | "keepLegacyArchived" | "recoverLegacy" | "downloadLegacy" | "retryLegacyArchive">;

export function WorksheetLegacyRecovery({ legacy, legacyError, legacyMessage, legacyUnavailable, unarchived, acknowledgeLegacy,
  keepLegacyArchived, recoverLegacy, downloadLegacy, retryLegacyArchive }: Props) {
  const recovered = new Set(legacy?.recovered);
  const snapshots = legacy?.snapshots ?? [];
  const resolved = (snapshot: LegacySnapshot) => snapshot.acknowledged ||
    (!!snapshot.archivedEntries?.length && !hasOutstandingLegacyEntries(snapshot, recovered));
  const outstanding = snapshots.filter(snapshot => !resolved(snapshot));
  const archived = snapshots.filter(resolved);
  if (!snapshots.length && !legacyError && !legacyMessage && !unarchived?.length) return null;

  function snapshotLabel(snapshot: LegacySnapshot) {
    return `Older ${legacySourceLabels[snapshot.source]} snapshot ${snapshot.id.slice(0, 12)}`;
  }

  function rawDownload(snapshot: LegacySnapshot) {
    return <button type="button" className="ca-btn" onClick={() => { void downloadLegacy(snapshot.id); }}>Download archived source (JSON)</button>;
  }

  function entries(snapshot: LegacySnapshot) {
    return snapshot.entries.map((entry, index) => {
      const name = entry.draft.name || "untitled worksheet";
      if (!outstandingRecoveryEntry(entry, recovered)) return <p key={entry.draft.id}>{name} recovered</p>;
      if (snapshot.archivedEntries?.includes(index)) return <div key={entry.draft.id}>
        <p>{name} kept archived without importing</p>
        <button type="button" className="ca-btn" onClick={() => { void recoverLegacy(snapshot.id, index, true); }}>Recover archived worksheet {name}</button>
      </div>;
      return <div key={entry.draft.id}>
        <button type="button" className="ca-btn" onClick={() => { void recoverLegacy(snapshot.id, index); }}>Recover {name}</button>{" "}
        <button type="button" className="ca-btn" aria-label={`Keep archived without importing ${name}`}
          onClick={() => { void keepLegacyArchived(snapshot.id, index); }}>Keep archived without importing</button>
      </div>;
    });
  }

  return <div className="ca-notice">
    <div>
      {outstanding.length > 0 && <p role="status">Older worksheet snapshots are archived. Recover adds a saved worksheet. Keep archived without importing preserves the revision for later.</p>}
      {legacyError && <p role="status">{legacyError}</p>}
      {legacyMessage && <p role="status">{legacyMessage}</p>}
      {!!unarchived?.length && <p>These observations are available only in this tab until archival succeeds.</p>}
      {unarchived?.map(({ source, raw }, index) => <button key={`${source}-${index}`} type="button" className="ca-btn"
        onClick={() => downloadLegacySource(raw, `chematlas-unarchived-${source}-${index + 1}`)}>Download unarchived {legacySourceLabels[source]} {index + 1}</button>)}
      {(snapshots.length > 0 || !!unarchived?.length) && <p>Source downloads use UTF-8. A .utf16-source.json file wraps the source in a JSON object to preserve its original UTF-16 code units.</p>}
      {legacyError && !legacyUnavailable && <button type="button" className="ca-btn" onClick={() => { void retryLegacyArchive(); }}>Retry legacy archive</button>}
      {outstanding.map(snapshot => {
        return <details key={snapshot.id} data-legacy-snapshot={snapshot.id}>
          <summary>{snapshotLabel(snapshot)}</summary>
          {!snapshot.entries.length && <p>No additional readable worksheets were found in this snapshot.</p>}
          {entries(snapshot)}
          {rawDownload(snapshot)}
          {!hasOutstandingLegacyEntries(snapshot, recovered) && <button type="button" className="ca-btn" onClick={() => { void acknowledgeLegacy(snapshot.id); }}>Acknowledge snapshot {snapshot.id.slice(0, 12)}</button>}
        </details>;
      })}
      {archived.length > 0 && <details>
        <summary>Archived legacy snapshots</summary>
        {archived.map(snapshot => <details key={snapshot.id} data-legacy-archived={snapshot.id}>
          <summary>{snapshotLabel(snapshot)}</summary>
          {entries(snapshot)}
          {rawDownload(snapshot)}
        </details>)}
      </details>}
    </div>
  </div>;
}
