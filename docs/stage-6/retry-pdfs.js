(async () => {
  if (location.origin !== "https://chematlas-student-stage6-test.chematlas-hub.workers.dev") {
    console.error("Run this in the signed-in ChemAtlas staging tab.");
    return;
  }
  const expected = {
    "/source/bank-02.pdf": "fcc673296f40b437f6174e82c530b9bf639755d97308565d35f4db372eb9b2f5",
    "/source/bank-03.pdf": "10757d0d7de0b5d57cd4c459b17edeceb70858c9f03016e609f2d840311653a7",
    "/source/bank-04.pdf": "d5340628fd7fd6e715bd816fd7d17f108bf60fd96c822ba6d813986c53235304",
    "/source/bank-05.pdf": "9ad05766191617f2204944de897c3b9f1b49b50aef1a528302852b865cd9ecdd"
  };
  const results = [];
  for (const [path, expectedHash] of Object.entries(expected)) {
    const start = performance.now();
    const row = { path, phase: "headers" };
    const signal = AbortSignal.timeout(180000);
    try {
      const response = await fetch(path, { credentials: "same-origin", redirect: "manual", cache: "no-store", signal });
      row.status = response.status;
      row.redirected = response.type === "opaqueredirect";
      row.headersMs = Math.round(performance.now() - start);
      row.contentType = response.headers.get("content-type");
      row.contentLength = response.headers.get("content-length");
      if (response.status === 200) {
        row.phase = "body";
        const bytes = await response.arrayBuffer();
        row.bytes = bytes.byteLength;
        row.bodyMs = Math.round(performance.now() - start - row.headersMs);
        row.pdfHeader = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
        row.phase = "hash";
        row.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          b => b.toString(16).padStart(2, "0")).join("");
        row.match = row.pdfHeader && row.sha256 === expectedHash;
        row.phase = "complete";
      } else {
        row.match = false;
        await response.body?.cancel();
      }
    } catch (error) {
      row.match = false;
      row.error = signal.aborted ? "TimeoutError" : error.name;
    }
    row.elapsedMs = Math.round(performance.now() - start);
    results.push(row);
  }
  console.log(JSON.stringify({ artifact: 14074740993, timestamp: new Date().toISOString(), results }, null, 2));
})();
