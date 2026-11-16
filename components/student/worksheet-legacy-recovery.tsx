import { downloadWorksheetData } from "./hooks/use-worksheets";
import type { useWorksheets } from "./hooks/use-worksheets";
import { legacySourceLabels, outstandingRecoveryEntry } from "./hooks/worksheet-recovery";
import type { LegacySnapshot } from "./hooks/worksheet-recovery";

type Props = Pick<ReturnType<typeof useWorksheets>, "legacy" | "legacyError" | "legacyMessage" | "legacyUnavailable" | "unarchived" |
  "acknowledgeLegacy" | "recoverLegacy" | "downloadLegacy" | "retryLegacyArchive">;

export function WorksheetLegacyRecovery({ legacy, legacyError, legacyMessage, legacyUnavailable, unarchived, acknowledgeLegacy,
  recoverLegacy, downloadLegacy, retryLegacyArchive }: Props) {
  const outstanding = legacy?.snapshots.filter(snapshot => !snapshot.acknowledged) ?? [];
  const acknowledged = legacy?.snapshots.filter(snapshot => snapshot.acknowledged) ?? [];
  const recovered = new Set(legacy?.recovered);
  if (!outstanding.length && !acknowledged.length && !legacyError && !legacyMessage && !unarchived?.length) return null;

  function rawDownload(snapshot: LegacySnapshot) {
    return <button type="button" className="ca-btn" onClick={() => { void downloadLegacy(snapshot.id); }}>Download exact archived source</button>;
  }

  return <div className="ca-notice">
    <div>
      {outstanding.length > 0 && <p role="status">Older worksheet snapshots are archived. Use Recover to restore an individual worksheet. Each exact source download contains the whole snapshot.</p>}
      {legacyError && <p role="status">{legacyError}</p>}
      {legacyMessage && <p role="status">{legacyMessage}</p>}
      {!!unarchived?.length && <p>These observations are available only in this tab until archival succeeds.</p>}
      {unarchived?.map(({ source, raw }, index) => <button key={`${source}-${index}`} type="button" className="ca-btn"
        onClick={() => downloadWorksheetData(raw, `chematlas-unarchived-${source}-${index + 1}.json`)}>Download unarchived {legacySourceLabels[source]} {index + 1}</button>)}
      {legacyError && !legacyUnavailable && <button type="button" className="ca-btn" onClick={() => { void retryLegacyArchive(); }}>Retry legacy archive</button>}
      {outstanding.map(snapshot => {
        const label = `Older ${legacySourceLabels[snapshot.source]} snapshot ${snapshot.id.slice(0, 12)}`;
        const remaining = snapshot.entries.some(entry => outstandingRecoveryEntry(entry, recovered));
        return <details key={snapshot.id} data-legacy-snapshot={snapshot.id}>
          <summary>{label}</summary>
          {!snapshot.entries.length && <p>No additional readable worksheets were found in this snapshot.</p>}
          {snapshot.entries.map((entry, index) => outstandingRecoveryEntry(entry, recovered) ? <button key={entry.draft.id}
            type="button" className="ca-btn" onClick={() => { void recoverLegacy(snapshot.id, index); }}>Recover {entry.draft.name || "untitled worksheet"}</button>
            : <p key={entry.draft.id}>{entry.draft.name || "Untitled worksheet"} recovered</p>)}
          {rawDownload(snapshot)}
          {!remaining && <button type="button" className="ca-btn" onClick={() => { void acknowledgeLegacy(snapshot.id); }}>Acknowledge snapshot {snapshot.id.slice(0, 12)}</button>}
        </details>;
      })}
      {acknowledged.length > 0 && <details>
        <summary>Acknowledged legacy snapshots</summary>
        {acknowledged.map(snapshot => <div key={snapshot.id}>
          Older {legacySourceLabels[snapshot.source]} snapshot {snapshot.id.slice(0, 12)} {rawDownload(snapshot)}
        </div>)}
      </details>}
    </div>
  </div>;
}
