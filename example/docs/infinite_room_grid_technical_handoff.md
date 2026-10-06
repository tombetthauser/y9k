# Infinite Procedural Room Grid — Technical Design Handoff

## 1. Project goal

Build a website in which every valid URL identifies a unique, dynamically generated room in an effectively infinite two-dimensional grid.

A user can:

- enter a room directly by URL
- move north, east, south or west
- receive a canonical alphanumeric URL for every room
- revisit the same URL and receive the same room
- encounter deterministic doors between adjacent rooms
- encounter disconnected regions and rooms with few or no doors

The initial implementation does **not** need a maze-generation algorithm or guaranteed global connectivity.

---

## 2. Core architectural separation

Keep these systems independent:

1. **Room addressing**
   - Converts a canonical URL ID into a linear integer index.
   - Converts that index into an `(x, y)` coordinate using a square spiral.
   - Converts coordinates back into IDs.

2. **Door generation**
   - Evaluates each shared edge between adjacent coordinates.
   - Deterministically decides whether that edge contains a door.
   - Does not alter room IDs or coordinates.

3. **Room rendering**
   - Counts the room’s doors.
   - Selects a gallery or hallway presentation.
   - Generates any additional room content from stable seeds.

```text
URL ID
  ↓
base-36 index
  ↓
square-spiral coordinate
  ↓
four neighboring coordinates and IDs
  ↓
four deterministic shared-edge decisions
  ↓
room type and rendered content
```

---

## 3. Canonical room IDs

### 3.1 Alphabet

Use lowercase base 36:

```text
0123456789abcdefghijklmnopqrstuvwxyz
```

Examples:

```text
decimal 0   → /0
decimal 9   → /9
decimal 10  → /a
decimal 35  → /z
decimal 36  → /10
decimal 440 → /c8
```

### 3.2 Canonicalization rules

Canonical IDs must:

- contain only `0-9` and `a-z`
- be lowercase
- contain no leading zeroes, except the ID `0`
- represent a nonnegative integer

Recommended HTTP behavior:

```text
/ROOMS/000A → redirect to /rooms/a
```

Reject IDs containing characters outside the accepted alphabet.

### 3.3 Numeric representation

Use JavaScript `BigInt`.

Do not convert large IDs through `Number`, because integers above `2^53 - 1` lose precision.

---

## 4. Square-spiral coordinate system

The linear index maps to an infinite square spiral.

```text
16 15 14 13 12
17  4  3  2 11
18  5  0  1 10
19  6  7  8  9
20 21 22 23 24
```

Initial mappings:

```text
0 → ( 0,  0)
1 → ( 1,  0)
2 → ( 1,  1)
3 → ( 0,  1)
4 → (-1,  1)
5 → (-1,  0)
6 → (-1, -1)
7 → ( 0, -1)
8 → ( 1, -1)
```

### 4.1 Ring definition

A coordinate belongs to ring:

```js
ring = max(abs(x), abs(y))
```

Ring `0` contains only the origin.

Ring `r` ends at:

```text
(2r + 1)² - 1
```

Examples:

```text
ring 0 ends at 0
ring 1 ends at 8
ring 2 ends at 24
ring 3 ends at 48
```

### 4.2 Direct lookup

Movement must not traverse the spiral from the origin.

Use direct reversible functions:

```ts
indexToCoordinate(index: bigint): { x: bigint; y: bigint }
coordinateToIndex(x: bigint, y: bigint): bigint
```

The index-to-coordinate calculation:

1. determines the containing ring using an exact integer square-root calculation
2. determines the ring’s final index
3. calculates the offset from that endpoint
4. uses the known side length to determine the exact side and position

The coordinate-to-index calculation:

1. finds the ring using `max(abs(x), abs(y))`
2. determines which side contains the coordinate
3. calculates the coordinate’s offset from the ring endpoint

### 4.3 Movement API

Recommended interface:

```ts
type Direction = "north" | "east" | "south" | "west";

function getNeighborId(
  currentId: string,
  direction: Direction
): string;
```

Directional coordinate changes:

```text
north → (x,     y + 1)
east  → (x + 1, y)
south → (x,     y - 1)
west  → (x - 1, y)
```

Pipeline:

```text
current ID
→ decode base 36
→ index to coordinate
→ modify x or y
→ coordinate to index
→ encode base 36
→ neighboring ID
```

---

## 5. Door model

### 5.1 A door belongs to a shared edge

Do not let each room independently decide whether it has a door in a direction.

A door belongs to the undirected edge between two adjacent rooms:

```text
room A ↔ room B
```

Both rooms must derive the same result for that edge.

For example:

```text
/10 east edge ↔ /27 west edge
```

must be one shared deterministic decision.

### 5.2 Canonical edge key

Create a canonical key from the two room IDs.

The order must be stable regardless of which room is loaded first.

```js
function getCanonicalEdgeKey(roomAId, roomBId) {
  return roomAId < roomBId
    ? `${roomAId}:${roomBId}`
    : `${roomBId}:${roomAId}`;
}
```

Example:

```text
getCanonicalEdgeKey("10", "27") → "10:27"
getCanonicalEdgeKey("27", "10") → "10:27"
```

This assumes both IDs are already canonical base-36 strings.

A coordinate-based edge key is also valid and may be safer if ID formatting could ever change:

```text
x1,y1:x2,y2
```

Whichever representation is chosen must remain stable for the lifetime of the world version.

---

## 6. Deterministic edge generation

### 6.1 World seed

Define a stable world seed:

```js
const WORLD_SEED = "museum-world-v1";
```

Changing the world seed changes the generated door layout.

Treat the seed as versioned persistent configuration, not as an incidental constant.

### 6.2 Hashing

Hash:

```text
world seed + canonical edge key
```

Example input:

```text
museum-world-v1:10:27
```

The hash must be:

- deterministic
- stable across supported runtimes
- based on exact string encoding rules
- suitable for procedural generation

It does not need to be cryptographically secure.

Avoid relying on JavaScript’s built-in object hashing or runtime-specific behavior.

A simple stable 32-bit hash can be used for a prototype. A stronger specified hash such as xxHash, MurmurHash or a cryptographic digest truncated to an integer may be preferable for production consistency.

### 6.3 Normalize the hash

Convert the unsigned hash result into a deterministic number in:

```text
0.0 inclusive to 1.0 exclusive
```

For a 32-bit unsigned hash:

```js
const randomValue = hashValue / 2 ** 32;
```

This is pseudorandom-looking but fully deterministic.

### 6.4 Door threshold

An edge has a door when:

```js
randomValue < DOOR_PROBABILITY
```

Example:

```js
function edgeHasDoor(roomAId, roomBId) {
  const edgeKey = getCanonicalEdgeKey(roomAId, roomBId);
  const hashInput = `${WORLD_SEED}:${edgeKey}`;
  const hashValue = hashString(hashInput);
  const randomValue = hashValue / 2 ** 32;

  return randomValue < DOOR_PROBABILITY;
}
```

---

## 7. Gallery probability

There is an important distinction between:

- the probability that an **edge** has a door
- the probability that a **room** has exactly one door

A room has four independently evaluated edges.

If each edge has probability `p` of containing a door, then the probability that a room has exactly one door is:

```text
P(exactly one door) = 4p(1 - p)³
```

### 7.1 Targeting 20% one-door rooms

To make approximately 20% of rooms have exactly one door, there are two mathematical solutions:

```text
p ≈ 0.0602
p ≈ 0.55049
```

The low solution creates mostly sealed rooms.

Recommended:

```js
const DOOR_PROBABILITY = 0.5504888163;
```

Approximate resulting distribution:

```text
0 doors   4.1%
1 door   20.0%
2 doors  36.7%
3 doors  29.9%
4 doors   9.2%
```

### 7.2 Important unresolved product decision

Earlier discussion used both of these definitions:

```text
Definition A
0 or 1 door → gallery
2–4 doors   → hallway
```

and:

```text
Definition B
exactly 1 door → gallery
all others     → hallway or another category
```

The recommended probability above targets **Definition B**, exactly one door.

If zero-door rooms also count as galleries and the combined gallery target is 20%, the probability must be recalculated for:

```text
P(0 doors) + P(1 door) = 0.20
```

Do not ship until the gallery classification rule is explicitly selected.

---

## 8. Suggested JavaScript interfaces

```js
const DIRECTIONS = ["north", "east", "south", "west"];
const WORLD_SEED = "museum-world-v1";
const DOOR_PROBABILITY = 0.5504888163;

function getCanonicalEdgeKey(roomAId, roomBId) {
  return roomAId < roomBId
    ? `${roomAId}:${roomBId}`
    : `${roomBId}:${roomAId}`;
}

function hashString(value) {
  // Prototype-only stable FNV-1a-style 32-bit hash.
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function deterministicUnitValue(value) {
  return hashString(value) / 2 ** 32;
}

function edgeHasDoor(roomAId, roomBId) {
  const edgeKey = getCanonicalEdgeKey(roomAId, roomBId);
  const value = deterministicUnitValue(
    `${WORLD_SEED}:${edgeKey}`
  );

  return value < DOOR_PROBABILITY;
}

function getRoomDoors(currentId) {
  const result = {};

  for (const direction of DIRECTIONS) {
    const neighborId = getNeighborId(currentId, direction);

    result[direction] = {
      exists: edgeHasDoor(currentId, neighborId),
      neighborId,
      href: `/${neighborId}`
    };
  }

  return result;
}

function generateRoom(currentId) {
  const doors = getRoomDoors(currentId);

  const openDoors = Object.entries(doors)
    .filter(([, door]) => door.exists)
    .map(([direction, door]) => ({
      direction,
      neighborId: door.neighborId,
      href: door.href
    }));

  const doorCount = openDoors.length;

  return {
    id: currentId,
    doors,
    openDoors,
    doorCount,

    // Confirm this product rule before implementation.
    roomType: doorCount === 1
      ? "gallery"
      : "hallway"
  };
}
```

---

## 9. Example request flow for `/10`

```text
GET /10
```

1. Validate and canonicalize `"10"`.
2. Decode `"10"` from base 36 into its linear index.
3. Convert the index into `(x, y)`.
4. Call:

```js
getNeighborId("10", "north");
getNeighborId("10", "east");
getNeighborId("10", "south");
getNeighborId("10", "west");
```

5. For every neighbor, create a canonical edge key:

```text
smallerRoomId:largerRoomId
```

6. Hash each of the four values with the world seed.
7. Normalize each hash to a value in `[0, 1)`.
8. Compare each value with `DOOR_PROBABILITY`.
9. Count open doors.
10. Render the appropriate room type.
11. Attach open doors to the neighboring canonical routes.

No database lookup is required for the baseline procedural result.

---

## 10. Determinism guarantees

The same room and edge must always regenerate identically.

The following must therefore be frozen or versioned:

- base-36 alphabet
- canonicalization rules
- spiral orientation
- index-to-coordinate formula
- coordinate-to-index formula
- direction definitions
- edge-key format
- world seed
- string encoding
- hash algorithm and version
- hash normalization method
- door threshold
- gallery classification rule

Recommended configuration:

```ts
type WorldGenerationConfig = {
  version: string;
  seed: string;
  alphabet: string;
  doorProbability: number;
  hashAlgorithm: string;
  spiralVersion: string;
};
```

A route can optionally include or resolve through a world version if generation rules may change later.

---

## 11. Complexity

Let `L` be the number of characters in the room ID.

### Neighbor ID

Conceptually:

```text
ID → index → coordinate → adjacent coordinate → index → ID
```

The spiral mapping uses direct arithmetic and never walks from the center.

With fixed-size arithmetic, spiral conversion is constant-operation work.

With JavaScript `BigInt`, the practical cost is dominated by processing `L`-character arbitrary-precision values.

### Door lookup

For each room:

- calculate four neighbor IDs
- hash four short edge-key strings
- perform four threshold comparisons

There is no search through the world, no maze generation and no need to generate intervening rooms.

The work depends on ID length, not on distance from the origin in number of rooms.

---

## 12. Expected characteristics of the baseline door system

This simple edge-hash model intentionally permits:

- isolated zero-door rooms
- one-door dead ends
- disconnected clusters
- loops
- open intersections
- unreachable rooms when navigating only through doors

Direct URL access can still render any room.

Because edges are independent, the result is not guaranteed to resemble a designed maze.

That is acceptable for the initial version under the current assumptions.

---

## 13. Testing requirements

### ID tests

- base-36 encode/decode round trips
- canonicalization of uppercase input
- removal or redirect of leading zeroes
- rejection of invalid characters
- very large `BigInt` IDs
- coordinate/index round trips
- movement reversibility:

```text
north then south returns to original
east then west returns to original
```

### Door symmetry tests

For every tested adjacent pair:

```js
edgeHasDoor(a, b) === edgeHasDoor(b, a)
```

For every direction:

```text
A east door equals B west door
A north door equals B south door
```

### Determinism tests

- repeated generation returns identical results
- browser and server implementations match
- hash test vectors remain frozen
- generation remains stable between deployments

### Statistical tests

Sample a large coordinate range and verify that:

- per-edge door frequency approaches the configured probability
- one-door room frequency approaches 20%
- door-count distribution approximates the binomial expectation

Adjacent room door counts are not fully independent because neighboring rooms share an edge. Statistical tests should account for this.

---

## 14. Recommended first implementation milestone

1. Implement canonical base-36 `BigInt` encoding.
2. Implement and test square-spiral index/coordinate conversion.
3. Implement `getNeighborId`.
4. Freeze a procedural hash implementation with test vectors.
5. Implement canonical shared-edge keys.
6. Implement deterministic door decisions.
7. Confirm whether zero-door rooms are galleries.
8. Implement room classification and rendering.
9. Add statistical and symmetry tests.
10. Add persistence only for user-created changes, not baseline procedural rooms.

---

## 15. Future extensions

These can be added without changing the addressing system:

- multiple world seeds
- location-based door-density zones
- deterministic room themes
- user-placed artwork, stored on the media row as a wall index plus x, y, and width in centimeters, measured from the center of that wall to the center of the image
- persistent user edits layered over generated defaults
- special doors
- portals
- locked doors
- maze-like chunk generation
- guaranteed connected regions
- three-dimensional coordinates

The square-spiral room ID system and the shared-edge door model should remain separate so either layer can evolve independently.
