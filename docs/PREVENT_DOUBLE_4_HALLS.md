# Prevent newly adjacent four-door hallways

Planning reference — October 11, 2026. Proposed behavior; no implementation in this document.

## Rule

Confirmed October 14: check the initiating room and its neighbors AND the target room and its neighbors using the simulated final shared edge. Reject any newly formed adjacent four-door pair, including one formed by the target with a different neighbor. These four-door rooms are hallways under the existing classification; “four-door galleries” does not introduce a new room type.

Reject a new door if opening its shared edge would create a new adjacent pair of four-door hallways. Check all neighbors of both changed endpoints, not just the room across the newly opened door.

For example, if the initiating room currently has three doors, adding its fourth is rejected when any of its neighbors would have four doors after the edit. The destination may also change from three to four doors and acquire a prohibited pair with one of its other neighbors; that case must also be checked.

Adjacency means north/east/south/west geometric neighbors. Four-door rooms necessarily have a passage on their shared edge. Evaluate resolved procedural-plus-override doors, not procedural counts alone.

Closures, unchanged requests, and openings that create no new four-door pair are allowed. Do not block unrelated edits because a prohibited pair already exists elsewhere. Do not repair existing layouts automatically.

## Simulation and integration

1. Read the resolved layouts of the initiating room and destination.
2. Apply the requested shared-edge state to copies of both layouts, using opposite directions at the two endpoints.
3. Determine which endpoints would newly become four-door rooms.
4. For each such endpoint, inspect each neighboring room's door count. If the neighbor is the other changed endpoint, use its simulated layout; otherwise use its current resolved layout.
5. Reject if any inspected neighbor would have four doors.
6. If all checks pass, apply the existing set/reset logic.

The simulation needs only the changed endpoints and their immediate neighbors; cache resolved layouts within the operation to avoid duplicate queries. Do not recursively explore the world.

Run this validation after the gallery-preservation check and before mutation, in the same SQLite `BEGIN IMMEDIATE` transaction. Server validation is authoritative; the browser confirmation does not guarantee an action will pass. Return a readable rejection explaining which room pair would become adjacent four-door halls. Keep the browser on or linked back to the initiating room.

Global administrative resets are intentional exceptions. If multi-edge editing is introduced later, validate its complete proposed final layout rather than simulating one edge at a time.

## Verification

Check a fourth opening beside an existing four-door neighbor; a fourth opening with no four-door neighbors; both endpoints becoming four-door rooms; the destination gaining its fourth door beside a different neighbor; allowed closures and unchanged requests; unrelated preexisting pairs; and openings through removal of a closed override. Confirm rejected operations leave all layouts and overrides unchanged and produce no success log.

## Estimate

Roughly 60–100 added/changed lines for layout simulation, neighbor checks, and the error path, excluding tests and shared transaction/validation integration.
