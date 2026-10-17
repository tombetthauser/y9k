# Room storage cipher and persistent holes

Planning reference — October 8, 2026. These changes are deferred; this document does not implement them.

October 13 update: retain SHA-256 lookup for V1. Experimental collision-free RSA block room encoding is selected for V2 in [ROOM_ENCODING_V2.md](ROOM_ENCODING_V2.md). It changes lookup identity, not the room-name-keyed metadata/image XOR. SHA-256 has negligible practical collision risk here but cannot provide unique identifiers for every possible room in an unbounded world.

## Purpose

Make room names and image metadata unreadable when casually inspecting database rows, and make the room name part of recovering their meaning. This is a conceptual feature and a homemade encryption exercise, not a security or access-control requirement.

Separately, allow a future admin to persistently open or close connections between rooms, gradually patching disconnected regions of the procedural world.

## Current implementation

- `src/database.php` creates the SQLite `things` table with `id`, `filename`, `room`, `wall`, `x`, `y`, and `width`.
- `public/index.php` queries images by plaintext room ID and renders their placement.
- `public/upload.php` stores image files in `public/images` and inserts metadata.
- `public/delete.php` looks up an image by ID and room before deleting it.
- `src/tools.php` canonicalizes base-36 room IDs and calculates procedural doors through `edgeHasDoor()`. Doors are decisions about shared edges, using a sorted room-ID pair and the world seed.

## Decided approach: simple room-name cipher

Keep the separate metadata columns rather than combining them into an encrypted JSON payload. This preserves their individual identities for future changes.

Use a small reversible byte cipher:

1. Normalize the room name through the existing base-36 decode/encode functions.
2. Repeat the canonical room-name bytes across the plaintext value.
3. XOR each plaintext byte with its corresponding room-name byte.
4. Base64-encode the resulting bytes for storage.
5. Choose to not prefix the stored value with a format marker such as `xor1:`.

To recover a value, decode the entire Base64 string and apply the same XOR operation with the canonical room name. No metadata prefix is used. Operate on bytes, so UTF-8 text can round-trip without character-level transformations.

No server secret, pepper, or additional salt is required for this exercise. Earlier HMAC and Sodium proposals are superseded for this scope. A room name is guessable, and this cipher offers casual concealment rather than dependable confidentiality.

### Column behavior

| Column | Planned stored representation |
| --- | --- |
| `id` | Ordinary integer; unchanged |
| `room` | Deterministic hash of the canonical room ID for equality lookup |
| `filename` | Individually scrambled text |
| `wall` | Individually scrambled text, or SQL `NULL` |
| `x` | Individually scrambled text, or SQL `NULL` |
| `y` | Individually scrambled text, or SQL `NULL` |
| `width` | Individually scrambled text, or SQL `NULL` |

A straightforward lookup hash is SHA-256 of the canonical room ID. Use one shared helper consistently. This is hashing for lookup, not reversible encryption. Anyone can check candidate room names against the stored hash, which is acceptable for this concept.

Change the numeric metadata columns to `TEXT` because Base64 values are strings. Preserve SQL `NULL` as `NULL`; do not confuse it with zero or an empty string. Restore `wall` to an integer and placement values to numeric values after decoding. Only operate on decoded filenames when locating image files.

### Application integration

- Room display: hash the requested room ID, fetch matching rows, decode metadata using that room ID, then render normally.
- Upload: hash the room ID and scramble each metadata value before inserting it.
- Delete: scope lookup and deletion by image ID and hashed room ID; decode the filename before deleting the file.
- Normalize IDs before every lookup and cipher operation, so uppercase and leading-zero forms resolve to the same stored room.
- SQL sorting, filtering, or arithmetic on scrambled placement values will no longer work directly; decode first when those operations become necessary.

The actual image files remain unchanged and directly accessible through their existing URLs. This plan does not encrypt image bytes, add private rooms, or prove that a visitor is physically "in" a room.

### Migration and verification

Before modifying an existing database, make a backup. Rebuild the SQLite table as needed to update column types, retaining IDs and the room index. In one transaction, use each row's original canonical room ID to hash its room field and scramble its metadata. Do not rename or modify image files.

Track the schema version explicitly so migration cannot accidentally hash or scramble rows twice. The cipher prefix describes a field's format; it is not a substitute for migration versioning.

Verify cipher round trips for room `0`, normalized IDs, UTF-8 filenames, negative/fractional placement, zero, and null placement. Verify that migrated images still display, new uploads store scrambled values, and deletion removes the intended record and file. Use a temporary database for migration checks.

Old backups still contain the original plaintext metadata. Keep a backup available for rollback during development.

### Rough effort

Conversation estimate: 50–80 added application lines, plus 30–50 migration lines. These are rough estimates rather than a measured patch; validation and migration handling may increase them.

## Decided approach: separate `holes` table

Keep image records in `things`. Add a separate `holes` table for persistent shared-edge overrides. This matches the existing distinction: an image belongs to one room, while a door belongs to two neighboring rooms.

Use the chosen name `is_hole`, not `is_open`.

| Column | Purpose |
| --- | --- |
| `room_a` | Hashed ID of one endpoint |
| `room_b` | Hashed ID of the neighboring endpoint |
| `is_hole` | Explicit open/closed override: `1` means a passage exists; `0` means it does not |

Sort the two hashed IDs consistently before lookup or insertion and give the pair a unique constraint (or composite primary key). A database check should restrict `is_hole` to `0` or `1`. Keep this flag readable for simple admin inspection.

The hash helper must match the image room-lookup helper. Sorting hashes here is independent of the existing procedural algorithm's sorting of plaintext room IDs: do not change the procedural edge key, seed, or hash rules.

### Door resolution

For each neighboring room pair:

1. Compute the canonical hashed endpoint pair.
2. Look for a matching `holes` row.
3. If found, use its `is_hole` value, including an explicit `0`.
4. If absent, use the existing procedural door calculation.

Both rooms consult the same row, so opposite doors agree automatically. Deleting an override restores procedural behavior; it does not necessarily close the passage.

### Future admin operations

- Force a four-way hallway: set all four adjacent edges to `is_hole = 1`.
- Force a one-door gallery: open the selected edge and close the other three.
- Force a closed gallery: set all four edges to `is_hole = 0`.
- Reset an edge: delete its override.

Write multi-edge edits in a transaction. Validate adjacency before accepting an override; nonadjacent portals are outside this plan. Changes intentionally affect both endpoints and may change the neighboring room's classification.

Apply overrides before selecting the room map, classifying gallery versus hallway, choosing upload spots, or showing navigation. The current interface classifies zero- and one-door rooms as galleries; preserve that rule unless explicitly changed later.

Preserve existing image placement when changing door layouts. Images may conflict with new doorways or no longer match a map's letter bins; repositioning and an admin interface remain future work.

## Deferred scope

- Implementing the cipher and migrating existing metadata.
- Adding `holes` and connecting it to door resolution.
- Building an admin editor and deciding admin authentication.
- Handling image placement conflicts after room-layout edits.
- Encrypting image files or changing their delivery mechanism.
- Additional persistent room attributes such as names or admin notes; these need a separate decision if introduced.

Do not implement the earlier per-room `door_override` proposal or mixed image/hole records in `things`; the selected design uses shared edges in `holes`.
