# Hosted acceptance checklist

Use three independent browser sessions with a genuine allowed identity, genuine explicitly denied identity and no authenticated identity. Record the isolated Worker name, deployed Worker UUID, sealed tar digest, test timestamp and outcome by session role. Capture safe paths, status and content hashes. Omit emails, JWTs, cookie values and redirect query parameters.

| Surface | Allowed identity | Explicitly denied identity and anonymous |
| --- | --- | --- |
| Home, Question Bank, Practice Builder and detail deep link `/?view=detail&question=mcq-2008-1-29` | Confirm actual UI, deep-link record and PDF render. | Confirm Access challenge or denial without application content. |
| Direct generated JavaScript and CSS | Use URLs loaded by the actual candidate and compare bytes with the manifest. | Confirm Access challenge or denial without asset bytes. |
| Catalog, audit, worksheet JSON, fragment PDF, PDF worker and all eight source PDFs | Verify direct responses and SHA-256 against the sealed manifest. For PDFs, confirm rendering and range behavior as applicable. | Confirm Access challenge or denial without asset bytes. |
| Version endpoint | Match application SHA, workflow SHA and catalog SHA to the sealed manifest. | Confirm Access challenge or denial. |
| Admin UI/API, backup and import routes | Confirm student denial and no data. Use GET for route probes, and use a payload-free POST for import only after confirming the isolated Worker has no private service or storage bindings. | Confirm edge challenge or denial and no data. |
| Binding inventory | Verify the deployed isolated configuration exposes only student static assets and Access configuration. Confirm no private-review service or storage bindings. | Use the same read-only configuration evidence. |

For explicit denial, establish that the real identity authenticated and was refused by the intended policy. A login screen alone records an anonymous challenge. For signed-in success, confirm the result is the candidate and not cached production content. A 200 login page does not pass any asset check.

Use an owner-authorized Cloudflare dashboard session or authorized read-only export for the production snapshot. Keep the deployment/version linkage and previous known-good evidence beside the release record.
