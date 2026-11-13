// Run in DevTools on the signed-in staging origin. Only reads staging URLs.
(async () => {
  const origin = "https://chematlas-student-stage6-test.chematlas-hub.workers.dev";
  if (location.origin !== origin) {
    console.error("Open the signed-in ChemAtlas staging tab first.");
    return;
  }

  const expected = {
    "/_next/static/b59fa505-1261-4e0b-8a92-2ed03cf9c73d/_buildManifest.js": "47f02b34be6dc481257b6efce4c19e19111f37ef5c437f8ffed44f0da97fa9bb",
    "/_next/static/b59fa505-1261-4e0b-8a92-2ed03cf9c73d/_ssgManifest.js": "653f3e53e89b4f8548ff86c19e92bb3c6b84b6be7485a320b1e00893ed877479",
    "/_next/static/chunks/app-route-prefetch-policy-DKmWoqfR.js": "f8b8d573c4513c2c9da0c12e6e65f88609c211ab8bf8e8617ba1cb499be69878",
    "/_next/static/chunks/framework-D_rUT4EX.js": "939d0fabebb3b2f01753bb866b067d8d3384fb06da19f0e6557609d3b1a9f4f7",
    "/_next/static/chunks/index-CJId2X7v.js": "9dbf1a4933d15850d4ba18be6b9121c55c81254632adc23bf98f825178959202",
    "/_next/static/chunks/layout-segment-context-C1XkoYXm.js": "34ec99ae7c3d7acd9ba0bc308a2e6d432da35aca5eb6c7731c3d2f508fba6bf5",
    "/_next/static/chunks/pdf-DPLaW87q.js": "7eb6cac61c49cbee23a38eb1c0bd821b6482ebdaf2647873b6f1a9015ad2322d",
    "/_next/static/chunks/question-source-YbxGpJGj.js": "dc56f200fa76adc0337da5e661b72141129890c39f32b23e1038fed8f0f5de4d",
    "/_next/static/chunks/rolldown-runtime-C60lm6uB.js": "5db5ba82eef00d1dee7e86e663098c9427d01183a88d357437daff295aec3e75",
    "/_next/static/chunks/streamed-icons-D-TahkkG.js": "7eb2a6b44b9c0faa7300c8dd36b0fae7a35d9f65e139dd9046b3df193aa83bc8",
    "/_next/static/chunks/student-app-CL7FUL_T.js": "341c85cffd8ca590f2e049c3d22506daec9bba5b709a224b33b99a351f0363c6",
    "/_next/static/chunks/worksheet-C3mcLY_i.js": "0d4187c60eb78cc6372e2dfbf8f40d231b6cdf681889e3eb2491219cb9fa611a",
    "/_next/static/chunks/worksheet-pdf-CzivXxuA.js": "c020a59af8c185583e473274c04ec76b12051f3f32053c18881ce580045a2ab0",
    "/_next/static/chunks/worksheet-render-BfP33XAA.js": "710a3607e445b3abe2ca9ff954a6fadcc3109f7f31039ce2dc2ccc8033d7eb5f",
    "/_next/static/css/index.Ctma5xMl.css": "12594c3a3dd0c0928cafcd3961331c707f020d94610c4d1da5241dade0d67072",
    "/curriculum-topics.json": "85f7c3b2bff689661f27992d13713147e0b367c7da2c057089888f6e1bb786e9",
    "/page-audit.json": "bf6db72778195a5ce3c6565892c16b932b18c1be94f85f28135f49f3da33baed",
    "/pdf.worker.min.mjs": "145d2dd3ab0c86151011dba95acfa2d5336e2accd59388ea43dbee0efddaaec6",
    "/questions.json": "ecd44472e2b0aa935d3e31ce67f7977ff090c6c2c946574921da4b7efc95defe",
    "/source/bank-01.pdf": "e05d7a13e7587bb1480e3113e48c86bddd583815dcddaf6ebf7d1ec6dbe027bf",
    "/source/bank-02.pdf": "fcc673296f40b437f6174e82c530b9bf639755d97308565d35f4db372eb9b2f5",
    "/source/bank-03.pdf": "10757d0d7de0b5d57cd4c459b17edeceb70858c9f03016e609f2d840311653a7",
    "/source/bank-04.pdf": "d5340628fd7fd6e715bd816fd7d17f108bf60fd96c822ba6d813986c53235304",
    "/source/bank-05.pdf": "9ad05766191617f2204944de897c3b9f1b49b50aef1a528302852b865cd9ecdd",
    "/source/bank-06.pdf": "f5295903476214a1c80b03b391e1cc17374c6314ec54496e60b728482dcff2bb",
    "/source/bank-07.pdf": "69aa3e08b09e1b67df5acc8b1e1a02b6a68ecd61c26248bf978da159be998c96",
    "/source/bank-08.pdf": "b0e2202a25cbd488d2623dea4daec4dba87f5ca3fafb964b0f550286c1e4d759",
    "/student-page-audit.json": "0ba57b5f20057fe0b53c595e284f0ec721308e09713ab59e07e000a3bb523184",
    "/student-questions.json": "96d67555cb3474aab1d49df6a7a38f1282e4617cb07c3a707d73c679f2bbf7e9",
    "/student-version.json": "fbd79e2a4bc3ed036ddb00ca32a7a8630c93c90c81d750fcb0123757ed345737",
    "/vinext-client-entry-manifest.json": "d15e04eda8ff7ba2c74bd116758bdbdb2ee16e0fc1873a963f110387a4bb3120",
    "/worksheet-content.json": "c6a449d622bc367004a4ae02b07bfb8f44df1cfb2a418bc76103e92c408030f5",
    "/worksheet-fragments.pdf": "115f12a8d3abf9c5012164ce223a55d840eb0bb588550737789da03b100e5f29",
    "/worksheet-sources.json": "4efe1f5abf98bbb9ec5bf99fdf85190b38a9e42fecb2e00841b93743861a5fda"
  };
  const adminPaths = [
    "/admin/question-review",
    "/api/admin/question-review",
    "/api/admin/question-review/backup",
    "/api/admin/question-review/backup/import",
  ];
  const get = path => fetch(path, {
    credentials: "same-origin",
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const summarize = response => ({
    status: response.status,
    redirected: response.type === "opaqueredirect",
  });

  // Verify that this browser can really read the protected version asset first.
  async function check([path, sha256]) {
    try {
      const response = await get(path);
      if (response.status !== 200) return { path, ...summarize(response), match: false };
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      return { path, status: response.status, match: actual === sha256, sha256: actual };
    } catch {
      return { path, match: false, error: "Request or hash failed" };
    }
  }

  const versionPath = "/student-version.json";
  const version = await check([versionPath, expected[versionPath]]);
  if (!version.match) {
    console.log(JSON.stringify({ staging: origin, version, stopped: "Version check failed" }, null, 2));
    return;
  }

  const assets = [version];
  const entries = Object.entries(expected).filter(([path]) => path !== versionPath);
  for (let i = 0; i < entries.length; i += 4) {
    assets.push(...await Promise.all(entries.slice(i, i + 4).map(check)));
  }
  const admin = await Promise.all(adminPaths.map(async path => {
    try {
      const response = await get(path);
      const body = await response.text();
      return { path, ...summarize(response), workerDenial: response.status === 404 && body === "Not found" };
    } catch {
      return { path, workerDenial: false, error: "Request failed" };
    }
  }));

  console.log(JSON.stringify({
    staging: origin,
    timestamp: new Date().toISOString(),
    artifact: 14074740993,
    checked: assets.length,
    matched: assets.filter(asset => asset.match).length,
    catalog: assets.find(asset => asset.path === "/student-questions.json"),
    failures: assets.filter(asset => !asset.match),
    admin,
  }, null, 2));
})();
