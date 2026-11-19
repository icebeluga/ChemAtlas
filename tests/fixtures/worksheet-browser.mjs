import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

// This function runs in a browser page and queries the actual persistence layer.
export function readWorksheetValue(key) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("chematlas-worksheets");
    open.onerror = () => reject(open.error);
    open.onupgradeneeded = () => open.transaction.abort();
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("worksheets", "readonly");
      const request = tx.objectStore("worksheets").get(key);
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => { db.close(); resolve(request.result); };
    };
  });
}

export async function waitForWorksheet(page, condition) {
  const deadline = Date.now() + 10_000;
  let record;
  do {
    record = await page.evaluate(readWorksheetValue, "current");
    if (condition(record)) return record;
    await setTimeout(30);
  } while (Date.now() < deadline);
  assert.fail(`Worksheet condition did not become true. Last record: ${JSON.stringify(record)}`);
}

export async function pauseWorksheetWrites(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("chematlas-worksheets");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("worksheets", "readwrite");
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => db.close();
      let paused = true;
      window.releaseWorksheetWrites = () => { paused = false; };
      const hold = () => {
        // Keep a real transaction active until both tabs have submitted their edits.
        if (paused) tx.objectStore("worksheets").count().onsuccess = hold;
      };
      tx.objectStore("worksheets").count().onsuccess = () => { hold(); resolve(); };
    };
  }));
  return () => page.evaluate(() => window.releaseWorksheetWrites());
}
