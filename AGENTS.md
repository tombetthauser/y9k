# Collaboration workflow

- Default to guided manual implementation: inspect the current files, explain the next change, and provide complete copyable examples with exact insertion/replacement locations. The user adds application code themselves unless they explicitly request direct edits.
- Include short layperson comments explaining what important lines do, why they are needed, and when the code is used. Avoid ellipses in code intended for copying.
- Keep shared application helper functions in `src/tools.php` unless the user requests otherwise.
- Review user edits and run appropriate checks when asked. Report concrete corrections without silently changing application files.
- Direct edits to planning documents and agent guidance are authorized when requested. Keep plans consistent with the latest decisions.
- V1 targets trusted users. Application upload limits, expanded input validation, resizing, and previously deferred handler cleanup belong to V2; do not reintroduce them as deployment blockers.
- Use fresh-database setup for the current storage changes; do not add migration work without a new need. Do not delete database/content on the user's behalf without an explicit request.
- No permanent room recovery index. Readable logs are temporary, use room IDs from requests, and can be cleared without affecting application operation. Bulk resets log summary lines only.
- Hallway uploads are outside V1 scope. Preserve accessible fallback image links for unexpected hallway content.
- The admin page is unlinked and has no authentication by explicit user choice.
