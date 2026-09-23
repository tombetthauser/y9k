# Y9K Procedural Room World
## Technical and Product Handoff

This document is the current source of truth for the Y9K procedural room-world project. It is intended for another coding agent or developer who needs enough context to continue implementation without reconstructing prior design discussions.

---

# 1. Project Summary

Y9K is an effectively infinite procedural website/world composed of rooms.

Each room:

- Has a unique lowercase base-36 URL ID
- Maps deterministically to one coordinate in an infinite 2D square spiral
- Has four possible adjacent neighbors
- May have deterministic doors on the north, east, south and west edges
- Can be generated directly from its URL without storing every room in a database
- May later contain persistent user-generated content such as uploaded images, videos, titles, annotations or other room-specific changes

The architectural goal is intentionally simple:

```text
URL
 ↓
PHP
 ↓
procedural room generation
 ↓
optional database lookup
 ↓
server-rendered HTML
 ↓
browser
```

The project favors:

- Minimal dependencies
- Long-lived, well-understood technologies
- Server-side rendering
- Deterministic procedural generation
- Small and understandable files
- Easy deployment to a Raspberry Pi
- Avoiding unnecessary frontend frameworks or service layers

---

# 2. Current Technology Plan

## Production server

Current intended production environment:

```text
Raspberry Pi
Linux
Apache
PHP
SQLite initially
MySQL prepared for later
ImageMagick / Imagick
FFmpeg if video processing is needed
External USB SSD for media
```

The Pi is expected to serve the application directly.

Docker is not currently planned for the Pi.

## Development machine

Primary development is expected to happen on a MacBook using:

```text
Cursor or VS Code
PHP
SQLite
Git
GitHub
optional Docker
```

The application should be usable either:

1. Directly with native PHP on macOS
2. Inside an optional Docker development container

The application itself must not depend on Docker.

---

# 3. Core Architectural Principle

The world is procedural.

Do not create database rows for every theoretical room.

A room should normally be generated entirely from:

```text
room ID
+
world-generation rules
+
world seed
```

Persistent storage is reserved for information that cannot be reconstructed procedurally, such as:

- Uploaded media
- User accounts
- Custom room names
- User annotations
- Ownership
- Persistent room modifications
- Other future user-created state

This distinction is fundamental.

---

# 4. Canonical Room IDs

## Alphabet

Room IDs use lowercase base 36:

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
decimal 100 → /2s
decimal 400 → /b4
decimal 440 → /c8
```

## Canonicalization

Canonical room URLs must:

- Use lowercase
- Not contain unnecessary leading zeros

Examples:

```text
/A      → redirect to /a
/000a   → redirect to /a
/0      → valid
```

A canonical ID maps to exactly one nonnegative integer index.

## Large integers

The room system is intended to work beyond native 64-bit integer limits.

In PHP, arbitrary-size integer operations should use GMP.

Conceptually:

```php
$index = gmp_init($roomId, 36);
```

and:

```php
$roomId = gmp_strval($index, 36);
```

Do not silently cast huge room IDs into ordinary PHP integers.

---

# 5. Square Spiral Coordinate System

Each integer room index maps to exactly one `(x, y)` coordinate.

The spiral orientation is fixed and must not change after implementation.

The center begins:

```text
16 15 14 13 12
17  4  3  2 11
18  5  0  1 10
19  6  7  8  9
20 21 22 23 24
```

Initial mappings:

```text
0 → ( 0, 0)
1 → ( 1, 0)
2 → ( 1, 1)
3 → ( 0, 1)
4 → (-1, 1)
5 → (-1, 0)
6 → (-1,-1)
7 → ( 0,-1)
8 → ( 1,-1)
```

The ring containing a coordinate is:

```text
ring = max(abs(x), abs(y))
```

The final index in ring `r` is:

```text
(2r + 1)^2 - 1
```

Examples:

```text
ring 0 ends at 0
ring 1 ends at 8
ring 2 ends at 24
ring 3 ends at 48
ring 4 ends at 80
```

---

# 6. How Spiral Lookup Works

The system must not walk from room 0 through all intermediate rooms.

Instead, it directly determines the square ring containing the index.

Layperson explanation:

Each ring ends immediately before an odd perfect square such as:

```text
9
25
49
81
...
```

Therefore:

```text
8  + 1 = 9  = 3²
24 + 1 = 25 = 5²
48 + 1 = 49 = 7²
80 + 1 = 81 = 9²
```

A square-root calculation provides a shortcut to determine which square boundary surrounds a room number.

Once the ring is known, the system calculates:

- the ring's final room number
- how far the requested room is from that endpoint
- which side of the square it occupies
- how far along that side it lies

This yields the exact `(x, y)` coordinate without traversing previous rooms.

---

# 7. Integer Square Root

Do not convert huge GMP values to floating-point numbers.

The spiral lookup should use an integer square root.

With GMP, use:

```php
gmp_sqrt($index)
```

The square root applies to the underlying integer value, not to its textual numeral system.

Base 36 is only a representation.

For example:

```text
"10" in base 36
     ↓
integer 36
     ↓
sqrt(36)
     ↓
6
```

The number does not conceptually need to "become decimal" before mathematics can be applied.

---

# 8. Index to Coordinate

A representative PHP implementation is:

```php
function indexToCoordinate(GMP $index): array {
    if (gmp_cmp($index, 0) === 0) {
        return [gmp_init(0), gmp_init(0)];
    }

    $sqrt = gmp_sqrt($index);
    $ring = gmp_div_q(gmp_add($sqrt, 1), 2);

    $side = gmp_mul($ring, 2);

    $ringEnd = gmp_sub(
        gmp_pow(
            gmp_add(gmp_mul($ring, 2), 1),
            2
        ),
        1
    );

    $offset = gmp_sub($ringEnd, $index);

    if (gmp_cmp($offset, $side) < 0) {
        return [
            gmp_sub($ring, $offset),
            gmp_neg($ring)
        ];
    }

    if (gmp_cmp($offset, gmp_mul($side, 2)) < 0) {
        return [
            gmp_neg($ring),
            gmp_add(
                gmp_neg($ring),
                gmp_sub($offset, $side)
            )
        ];
    }

    if (gmp_cmp($offset, gmp_mul($side, 3)) < 0) {
        return [
            gmp_add(
                gmp_neg($ring),
                gmp_sub(
                    $offset,
                    gmp_mul($side, 2)
                )
            ),
            $ring
        ];
    }

    return [
        $ring,
        gmp_sub(
            $ring,
            gmp_sub(
                $offset,
                gmp_mul($side, 3)
            )
        )
    ];
}
```

This orientation must be tested against the canonical spiral above.

---

# 9. Coordinate to Index

The inverse function is equally important:

```text
coordinateToIndex(x, y)
```

It must return the exact room index corresponding to `(x, y)`.

The pair of functions must satisfy:

```text
indexToCoordinate(coordinateToIndex(x, y)) == (x, y)

coordinateToIndex(indexToCoordinate(index)) == index
```

The exact production implementation should be verified with automated round-trip tests before deployment.

---

# 10. Neighbor Lookup

Every room potentially has four adjacent neighbors.

For a room at:

```text
(x, y)
```

the neighbor coordinates are:

```text
north = (x,     y + 1)
south = (x,     y - 1)
east  = (x + 1, y)
west  = (x - 1, y)
```

Neighbor lookup therefore follows:

```text
room ID
 ↓
decode base 36
 ↓
spiral index
 ↓
(x, y)
 ↓
adjust one coordinate
 ↓
coordinateToIndex()
 ↓
encode base 36
 ↓
neighbor ID
```

Conceptual PHP:

```php
function getNeighborId(
    string $roomId,
    string $direction
): string {
    $index = decodeBase36($roomId);

    [$x, $y] = indexToCoordinate($index);

    switch ($direction) {
        case 'north':
            $y = gmp_add($y, 1);
            break;

        case 'south':
            $y = gmp_sub($y, 1);
            break;

        case 'east':
            $x = gmp_add($x, 1);
            break;

        case 'west':
            $x = gmp_sub($x, 1);
            break;
    }

    $neighborIndex =
        coordinateToIndex($x, $y);

    return encodeBase36($neighborIndex);
}
```

Example for room `/0`:

```text
north → /3
east  → /1
south → /7
west  → /5
```

---

# 11. Complexity

The spiral itself does not scale with distance from the origin in the way a traversal would.

In a simplified arithmetic model, the spiral transformation uses a fixed number of arithmetic operations.

Practical complexity for arbitrarily large IDs is dominated by the size of the integer.

Useful conceptual summary:

```text
spiral algorithm itself
≈ O(1) arithmetic operations

full arbitrary-precision operation
≈ grows with number of digits / bits
```

Most importantly:

```text
room /100000000000000000...
```

does not require generating or visiting preceding rooms.

---

# 12. Door Generation

Doors must belong to shared edges, not independently to rooms.

This rule prevents contradictory geometry.

If room A is east of room B:

```text
A east door
```

must always equal:

```text
B west door
```

The result must not depend on which room is generated first.

---

# 13. Canonical Edge Keys

For two neighboring room IDs:

```text
10
27
```

the shared edge should always use one canonical key:

```text
10:27
```

never sometimes:

```text
27:10
```

Representative function:

```php
function getCanonicalEdgeKey(
    string $roomAId,
    string $roomBId
): string {
    return strcmp($roomAId, $roomBId) < 0
        ? "$roomAId:$roomBId"
        : "$roomBId:$roomAId";
}
```

The canonical edge key format must be frozen once production data depends on it.

---

# 14. World Seed

Door generation also incorporates a fixed world seed.

Example:

```php
const WORLD_SEED = 'museum-world-v1';
```

The seed allows the same geometry to produce a deterministic but apparently irregular door layout.

Changing the seed changes the entire world.

Therefore the world seed is persistent world-generation configuration and should not casually change after launch.

---

# 15. Door Hashing

The intended process is:

```text
room A
+
room B
 ↓
canonical shared-edge key
 ↓
world seed + edge key
 ↓
deterministic hash
 ↓
unit value 0.0–1.0
 ↓
compare with threshold
 ↓
door or no door
```

One possible PHP implementation uses SHA-256:

```php
function edgeHasDoor(
    string $a,
    string $b
): bool {
    $edge = strcmp($a, $b) < 0
        ? "$a:$b"
        : "$b:$a";

    $hash = hash(
        'sha256',
        WORLD_SEED . ':' . $edge
    );

    $value =
        hexdec(substr($hash, 0, 8))
        / 0xFFFFFFFF;

    return $value < DOOR_PROBABILITY;
}
```

The exact hash algorithm, normalization rules and seed should be versioned once the world becomes persistent.

---

# 16. Door Probability

An important distinction:

A 20% chance per edge does not mean 20% of rooms have one door.

With four independent edges and per-edge probability `p`:

```text
P(exactly one door)
=
4p(1-p)^3
```

If:

```text
p = 0.2
```

then approximately:

```text
40.96%
```

of rooms have exactly one door.

To target approximately 20% of rooms having exactly one door, useful roots include approximately:

```text
p ≈ 0.0602
p ≈ 0.55049
```

The low value makes most rooms sealed.

The currently preferred useful value is:

```php
const DOOR_PROBABILITY = 0.5504888163;
```

Approximate resulting door-count distribution:

```text
0 doors ≈ 4.1%
1 door  ≈ 20.0%
2 doors ≈ 36.7%
3 doors ≈ 29.9%
4 doors ≈ 9.2%
```

---

# 17. Gallery vs Hallway Classification

An unresolved product detail remains.

Two ideas have appeared:

```text
A. rooms with 0 or 1 doors are galleries
B. rooms with exactly 1 door are galleries
```

The current probability setting:

```text
0.5504888163
```

targets approximately 20% of rooms having exactly one door.

Before finalizing room rendering, the project should explicitly decide whether:

```text
0-door rooms
```

are:

- galleries
- another room type
- inaccessible empty rooms
- something else

Do not silently assume one interpretation.

---

# 18. Disconnected World Is Currently Acceptable

The first implementation does not guarantee maze connectivity.

The world may contain:

- isolated rooms
- zero-door rooms
- dead ends
- loops
- disconnected regions
- rooms inaccessible through doors but still reachable directly by URL

This is intentional for the first version.

Any valid canonical room ID should still render directly.

Maze-generation systems were discussed but explicitly postponed.

---

# 19. Future Maze Option

If connectivity becomes important later, a deterministic maze system could be added without changing room IDs.

Possible future approach:

```text
infinite spiral addressing
+
deterministic finite chunks
+
maze generation inside each chunk
+
deterministic openings along shared chunk boundaries
```

This should remain separate from the addressing system.

Do not redesign the spiral solely to accommodate future maze logic.

---

# 20. Room Generation

Conceptual room generation:

```php
function generateRoom(string $roomId): array {
    $directions = [
        'north',
        'east',
        'south',
        'west'
    ];

    $doors = [];

    foreach ($directions as $direction) {
        $neighborId =
            getNeighborId(
                $roomId,
                $direction
            );

        $doors[$direction] = [
            'exists' =>
                edgeHasDoor(
                    $roomId,
                    $neighborId
                ),

            'neighborId' =>
                $neighborId,

            'href' =>
                '/' . $neighborId
        ];
    }

    $openDoors = array_filter(
        $doors,
        fn($door) => $door['exists']
    );

    return [
        'id' => $roomId,
        'doors' => $doors,
        'doorCount' => count($openDoors)
    ];
}
```

---

# 21. Server-Side Rendering

Room calculations are intended to happen in PHP on the server.

They are not intended to run in browser JavaScript.

Request flow:

```text
Browser requests /c8
        ↓
Apache
        ↓
PHP
        ↓
decode base 36
calculate coordinate
calculate neighbors
calculate doors
optional database lookup
        ↓
PHP renders HTML
        ↓
Apache sends HTML
        ↓
Browser displays page
```

Client-side JavaScript may later be used for enhancements such as:

- animation
- keyboard navigation
- progressive UI behavior

but it should not be required for canonical room generation.

---

# 22. Apache Routing

The public URL should remain clean:

```text
/c8
```

Apache can internally rewrite that request to something like:

```text
/index.php?room=c8
```

The user should not need to see query-string room URLs.

Canonical redirects should normalize:

- uppercase IDs
- leading zeros
- invalid URL forms

---

# 23. Current Filesystem Plan

A simple application layout:

```text
y9k/
├── public/
│   ├── index.php
│   ├── upload.php
│   ├── style.css
│   ├── favicon.ico
│   └── .htaccess
│
├── src/
│   ├── Base36.php
│   ├── Spiral.php
│   ├── Doors.php
│   ├── Room.php
│   ├── Media.php
│   ├── Database.php
│   ├── DatabaseSQLite.php
│   ├── DatabaseMySQL.php
│   └── Config.php
│
├── templates/
│   ├── room.php
│   └── upload.php
│
├── data/
│   └── development.sqlite
│
├── scripts/
│   ├── cleanup.php
│   └── rebuild-thumbnails.php
│
├── docker/
├── compose.yml
├── .gitignore
└── README.md
```

The project is intentionally not adopting a large application framework at this stage.

---

# 24. Public Web Root

Apache should expose only:

```text
y9k/public/
```

as the document root.

Files such as:

```text
src/
data/
templates/
configuration files
```

should not be directly web-accessible.

This is especially important for database files and uploaded content.

---

# 25. SQLite First

The initial active database will be SQLite.

Development database:

```text
data/development.sqlite
```

A production SQLite database should be stored outside the publicly accessible web root.

Benefits for the initial project:

- no separate database server
- simple backups
- minimal RAM use
- easy local development
- appropriate for modest traffic
- simple deployment on Raspberry Pi

---

# 26. MySQL Later

The application should be prepared to switch to MySQL later.

The plan is to create and maintain:

```text
Database.php
DatabaseSQLite.php
DatabaseMySQL.php
```

so MySQL support exists before it is required.

MySQL may be installed/configured on the Pi but remain unused or stopped initially.

The application should avoid scattering SQLite-specific SQL throughout unrelated files.

The intent is:

```text
Application
    ↓
Database abstraction
    ↓
SQLite now
MySQL later
```

---

# 27. Switching Databases

A deliberate future migration from SQLite to MySQL is expected to be manageable.

The application should not be designed around frequent switching of the live production database back and forth.

Supporting both database backends in the same codebase is good.

Repeatedly moving live production data:

```text
SQLite → MySQL → SQLite → MySQL
```

for traffic spikes is not recommended because data synchronization becomes the difficult part.

---

# 28. Media Storage

Uploaded images and videos should not normally be stored as BLOBs inside SQLite/MySQL.

Instead:

```text
database
=
metadata and relationships

filesystem
=
actual media files
```

Example DB metadata:

```text
id          482
room_id     c8
type        image
filename    482.jpg
width       1600
height      1067
bytes       438211
created_at  ...
```

Actual file:

```text
/mnt/y9k-media/images/482.jpg
```

---

# 29. External Media Drive

The preferred production design is:

```text
microSD
├── Linux
├── Apache
├── PHP
├── application
└── SQLite initially

external USB SSD
└── uploaded media
```

A microSD card could technically hold media, especially during prototyping, but an external SSD is preferred because:

- media may grow much larger than application code
- uploads cause repeated writes
- filling the boot volume is undesirable
- separating media makes maintenance and backups easier
- video files can become large quickly

The SSD may require appropriate USB adapters or powered USB support depending on the exact Raspberry Pi setup.

---

# 30. Media Filesystem

Preferred production media layout:

```text
/mnt/y9k-media/
├── originals/
│   ├── images/
│   └── videos/
│
├── images/
├── thumbnails/
├── video/
└── temp/
```

Raw uploads should not simply be placed inside:

```text
public/uploads/
```

This reduces the risk of unintended direct execution or exposure of uploaded content.

---

# 31. Image Processing

PHP will use ImageMagick through the Imagick extension.

Typical flow:

```text
upload
 ↓
validate
 ↓
open with Imagick
 ↓
auto-orient
 ↓
resize
 ↓
strip metadata
 ↓
write display image
 ↓
write thumbnail
 ↓
save metadata to database
```

Example:

```php
$image = new Imagick($sourcePath);

$image->autoOrient();

$image->thumbnailImage(
    1600,
    1600,
    true
);

$image->setImageFormat('jpeg');

$image->setImageCompressionQuality(82);

$image->stripImage();

$image->writeImage($destinationPath);

$image->clear();
$image->destroy();
```

---

# 32. PHP Object Syntax

Imagick calls such as:

```php
$image->autoOrient();
```

are PHP object method calls.

Meaning:

```text
$image
=
PHP variable holding an Imagick object

->
=
access a method or property on that object

autoOrient()
=
call that method
```

Equivalent conceptual syntax:

```text
JavaScript:
image.autoOrient()

Python:
image.auto_orient()
```

---

# 33. Image Upload Limits

A compressed image may require much more RAM after decompression.

This matters on a Raspberry Pi.

The upload system should impose:

- maximum upload file size
- maximum width
- maximum height
- valid MIME types
- successful image decoding
- safe output filenames

Example:

```php
if (
    $_FILES['image']['size']
    > 20 * 1024 * 1024
) {
    die('Image is too large');
}
```

and:

```php
$width =
    $image->getImageWidth();

$height =
    $image->getImageHeight();

if (
    $width > 8000
    || $height > 8000
) {
    die(
        'Image dimensions are too large'
    );
}
```

Exact limits can be adjusted after testing on the actual Pi.

---

# 34. Video Processing

If video uploads are allowed:

```text
upload
 ↓
save source
 ↓
FFmpeg if needed
 ↓
web-ready video
+
poster frame
```

Video transcoding is much more expensive than room generation or ordinary database operations.

If a submitted video is already in an acceptable web format and bitrate, avoiding unnecessary transcoding may be preferable.

FFmpeg should not be considered part of the core room-generation request path.

---

# 35. Raspberry Pi Performance Priorities

Approximate relative workload:

```text
room math
very cheap

SQLite/MySQL query
cheap

image resizing
moderate

video transcoding
expensive
```

The room-world mathematics is not expected to be a meaningful performance problem.

Uploaded media processing is the area most likely to stress CPU and memory.

---

# 36. Development Workflow

Primary development should happen on the MacBook.

Typical workflow:

```text
Cursor / VS Code
      ↓
edit PHP
      ↓
local PHP server
      ↓
browser testing
      ↓
Git commit
      ↓
GitHub
      ↓
deploy to Raspberry Pi
```

The Pi should be treated primarily as the deployment server rather than as the main editing environment.

---

# 37. Local PHP Development

For simple local testing:

```bash
php -S localhost:8000 -t public
```

Then open:

```text
http://localhost:8000
```

This provides a very short development loop:

```text
edit
 ↓
save
 ↓
refresh browser
```

No frontend compilation step is planned.

---

# 38. Git and GitHub

The project should use Git from the beginning.

Example:

```bash
git add .
git commit -m "Add spiral mapping"
git push
```

GitHub is the intended shared source repository.

The repository should contain:

- source code
- templates
- static assets
- database adapters
- documentation
- optional Docker development setup

It should not contain:

- secrets
- production credentials
- production SQLite database
- uploaded media
- temporary processing files

---

# 39. Deployment

The first deployment process can remain intentionally simple.

Possible Git workflow:

```text
Mac
 ↓
git push
 ↓
Pi
 ↓
git pull
```

Or use `rsync`.

A small deployment script may eventually wrap deployment.

No CI/CD platform is required for the first version.

---

# 40. Optional Docker Development

Docker is optional on the development Mac.

It may be useful for reproducing a Linux environment containing:

- Apache
- PHP
- GMP
- Imagick
- FFmpeg
- SQLite
- optional MySQL

Docker does not determine application architecture.

The developer should be able to alternate between:

```text
native macOS PHP
```

and:

```text
Docker development
```

without changing application code.

The Docker files may live in Git:

```text
docker/
compose.yml
```

They can simply remain unused during native development and unused on the Pi.

---

# 41. No Docker on Production Pi

Current plan:

```text
Mac
Docker optional

Pi
native services
```

The Pi will run Apache, PHP and database/media tooling directly.

This avoids additional runtime layers on a resource-constrained server.

---

# 42. Environment-Specific Configuration

Machine-specific configuration should remain separate from application logic.

For example, local development might use:

```text
DB_DRIVER=sqlite
MEDIA_PATH=./media
```

while production uses:

```text
DB_DRIVER=sqlite
MEDIA_PATH=/mnt/y9k-media
```

Later:

```text
DB_DRIVER=mysql
```

could activate the MySQL backend.

Secrets should not be committed to GitHub.

---

# 43. Suggested Configuration Values

World-generation configuration should eventually be grouped into a stable configuration structure.

Conceptually:

```php
return [
    'generation_version'
        => '1',

    'world_seed'
        => 'museum-world-v1',

    'door_probability'
        => 0.5504888163,

    'alphabet'
        => '0123456789abcdefghijklmnopqrstuvwxyz',

    'spiral_version'
        => '1',

    'hash_algorithm'
        => 'sha256'
];
```

Once public URLs or persistent content depend on these values, changing them can alter the world and must be treated as a versioned migration.

---

# 44. Determinism Requirements

For the same:

```text
room ID
world seed
generation version
```

the generated procedural room must always be identical.

This includes:

- coordinate
- neighbor IDs
- door states
- deterministic room classification

A browser reload must not change a room.

A server restart must not change a room.

A new deployment must not change a room unless generation rules are deliberately versioned.

---

# 45. Testing Requirements

## Base-36 tests

Verify:

```text
encode(decode(id)) == canonical id
```

Test:

- `0`
- `9`
- `a`
- `z`
- `10`
- very large IDs
- uppercase input
- leading zeros
- invalid characters

## Spiral tests

Verify known mappings:

```text
0 → (0,0)
1 → (1,0)
2 → (1,1)
3 → (0,1)
4 → (-1,1)
5 → (-1,0)
6 → (-1,-1)
7 → (0,-1)
8 → (1,-1)
```

Verify large round trips.

## Neighbor tests

Verify:

```text
north then south
=
original room

east then west
=
original room
```

## Door tests

For neighboring rooms A and B:

```text
edgeHasDoor(A, B)
==
edgeHasDoor(B, A)
```

Also:

```text
A east
==
B west

A north
==
B south
```

## Determinism tests

Generate the same room repeatedly.

All procedural fields must remain identical.

## Statistical tests

Over a large room sample:

- per-edge door frequency should approach configured `p`
- one-door room frequency should approach the intended target
- total door-count distribution should broadly match expected probabilities

Note that neighboring room door counts are correlated because they share edges.

---

# 46. Preview Map

The currently discussed spiral through decimal index 440 corresponds to base-36 IDs through `/c8`.

Useful examples:

```text
35  → /z
36  → /10
100 → /2s
400 → /b4
440 → /c8
```

The canonical world map is not stored as a table.

These values are generated mathematically.

---

# 47. Request Example

A request for:

```text
/c8
```

should conceptually do:

```text
/c8
 ↓
canonical validation
 ↓
base-36 decode
 ↓
440
 ↓
indexToCoordinate(440)
 ↓
coordinate
 ↓
calculate N/E/S/W coordinates
 ↓
coordinateToIndex() for each
 ↓
encode neighboring IDs
 ↓
hash each shared edge
 ↓
determine doors
 ↓
query database for persistent room/media data
 ↓
render template
 ↓
return HTML
```

---

# 48. Example Template

The rendered template can remain mostly ordinary HTML:

```php
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Room <?= htmlspecialchars($room['id']) ?></title>
    <link rel="stylesheet" href="/style.css">
</head>

<body>

<h1>Room <?= htmlspecialchars($room['id']) ?></h1>

<?php foreach ($room['doors'] as $direction => $door): ?>

    <?php if ($door['exists']): ?>
        <a
            class="door <?= htmlspecialchars($direction) ?>"
            href="/<?= htmlspecialchars($door['neighborId']) ?>"
        >
            <?= ucfirst($direction) ?>
        </a>
    <?php endif; ?>

<?php endforeach; ?>

</body>
</html>
```

---

# 49. Intended Simplicity

The current plan intentionally does not require:

```text
React
Next.js
Vue
Node.js
GraphQL
Redis
Kubernetes
microservices
frontend bundlers
SPA hydration
cloud orchestration
```

These can be added only if a concrete future requirement justifies them.

The desired initial architecture is intentionally closer to classic server-rendered web development.

---

# 50. PHP's Role

PHP is the primary server-side application language.

It is responsible for:

- receiving room requests
- validating/canonicalizing IDs
- base-36 conversion
- spiral mathematics
- neighbor generation
- deterministic door generation
- database access
- upload handling
- invoking Imagick
- HTML rendering
- potentially invoking FFmpeg where appropriate

Earlier JavaScript examples were exploratory.

The current intended canonical implementation is PHP.

---

# 51. Database Role

The database does not define the procedural universe.

It supplements the procedural universe.

Think:

```text
procedural world
+
persistent overrides/content
=
rendered room
```

For untouched rooms:

```text
database rows may be unnecessary
```

This is important for scalability and conceptual simplicity.

---

# 52. Likely Early Database Tables

Exact schema remains open, but likely early entities include:

```text
media
rooms or room_overrides
users
annotations
```

Possible `media` fields:

```text
id
room_id
type
filename
original_filename
mime_type
width
height
bytes
created_at
```

The schema should remain intentionally modest until product behavior requires more.

---

# 53. Media Association

Uploaded media should reference canonical room IDs as strings.

Do not assume room IDs fit into SQL integer columns.

Example:

```text
room_id = "c8"
```

This keeps database storage aligned with canonical URLs and avoids arbitrary integer-size limitations.

---

# 54. Security Basics for Uploads

At minimum:

- do not trust the client filename
- generate server-side filenames
- validate actual media type
- enforce file-size limits
- enforce dimension limits
- keep original upload location outside the public web root
- strip unnecessary image metadata
- avoid executing uploaded content
- escape output with `htmlspecialchars()`
- do not commit credentials
- limit filesystem permissions appropriately

These requirements should be considered part of the first upload implementation, not optional hardening added much later.

---

# 55. Open Product Decisions

The following details are not yet fully finalized.

## Gallery rule

Should gallery mean:

```text
exactly 1 door
```

or:

```text
0 or 1 doors
```

Current probability math targets exactly one door.

## Media behavior

Still to define:

- who may upload
- whether anonymous uploads exist
- how many media items a room can contain
- whether originals are retained permanently
- exact target image dimensions
- accepted image formats
- accepted video formats
- video size limits
- whether video transcoding is mandatory
- whether content is moderated

## Persistent room state

Still to define:

- whether rooms can have custom titles
- whether rooms have owners
- whether users can modify room appearance
- whether procedural properties can ever be overridden

## Authentication

No authentication system has yet been selected.

---

# 56. Things That Should Not Change Casually

Once the project has persistent content, these become part of the world's identity:

- base-36 alphabet
- lowercase canonicalization
- leading-zero rules
- spiral orientation
- index-to-coordinate mapping
- coordinate-to-index mapping
- cardinal direction definitions
- edge-key format
- world seed
- hash algorithm
- hash normalization
- door probability
- room classification rule
- generation-version semantics

Any change to these should be treated as a world-generation migration.

---

# 57. Recommended First Implementation Sequence

A practical first milestone:

```text
1. Set up repository
2. Create public/index.php
3. Implement Base36.php
4. Implement Spiral.php
5. Verify spiral mappings
6. Implement coordinateToIndex()
7. Implement getNeighborId()
8. Add round-trip tests
9. Implement Doors.php
10. Verify shared-edge consistency
11. Render a basic room page
12. Add Apache URL rewriting
13. Add SQLite abstraction
14. Add a minimal media table
15. Implement image upload
16. Add Imagick resizing
17. Save media on external/local media directory
18. Implement MySQL adapter but leave unused
19. Deploy native Apache/PHP version to Pi
```

Video should come after image handling unless there is a product reason to prioritize it.

---

# 58. Development Philosophy

When choosing between two approaches, prefer the one that:

- is easier to understand by reading the source
- introduces fewer runtime services
- keeps procedural logic deterministic
- is easy to run locally
- works on modest Raspberry Pi hardware
- can be maintained years later
- does not require a framework merely for convention
- preserves direct mapping from URL to generated room

The project is intentionally small enough that clarity is more valuable than adopting tooling solely because it is common in larger applications.

---

# 59. Short Handoff Summary

If another agent needs the shortest possible mental model:

```text
Y9K is an infinite deterministic room website.

URLs are lowercase base-36 integers.

The integer maps directly to a position on a
reversible square spiral.

North/east/south/west neighbors are calculated
by changing the coordinate and converting back.

Doors are deterministic properties of shared
edges, generated from a canonical edge ID plus
a fixed world seed.

PHP generates rooms server-side.

Apache serves the site.

SQLite is used first.

A MySQL adapter is prepared for later migration.

Media files live on an external USB SSD.

Image processing uses Imagick.

Video may use FFmpeg.

Development happens primarily on a Mac in
Cursor or VS Code.

GitHub is the source repository.

Docker is optional for Mac development only.

The Raspberry Pi runs native Apache/PHP without
Docker.
```

---

# 60. Current Source of Truth

When implementation choices conflict with this document, preserve these priorities:

1. Canonical deterministic world behavior
2. Stable room URLs
3. Shared-edge consistency
4. Minimal architecture
5. Server-side PHP generation
6. Database independence where practical
7. Media stored outside the database
8. Raspberry Pi-friendly resource usage
9. Simple local development and deployment
10. Avoid premature framework complexity
