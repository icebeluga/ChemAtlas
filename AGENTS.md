# Working on ChemAtlas

- Once the owner approves and promotes the verified student candidate, GitHub is the authoritative source. Ask for the current approved base if the task does not identify it. Record the branch and full base commit SHA before editing.
- Create a dedicated branch from that SHA. Check existing branches and pull requests for overlapping work. Coordinate with the branch owner before sharing a write branch, and preserve changes from other branches unless the owner explicitly decides to retire them.
- Run the relevant checks, commit and push the work, then report the branch, full final commit SHA and check results. Include those details in the pull request. Require a pull request and passing CI before integration into the approved branch.
- Keep student Worker code and assets together. Production deployment requires the owner's explicit approval of a specific application SHA and validated artifact. Follow the [release handoff](docs/stage-5/README.md).
- Preserve the Sites v48 archive and release history. Keep private review Worker and D1/R2 recovery independent from student release work.
