# Image placement plan

This is the implementation plan for hanging user images. The text page and the future Three.js room must read and write the same fields. Letters on the text map are a view of those fields. They are not stored on the image.

The coordinate rules also live in `handoff.md`, under "Image placement on a wall."

## Stored fields

Add these columns to `media` in `src/database.php`. The table already exists, so new installs need the columns in `CREATE TABLE`, and the current SQLite file needs `ALTER TABLE`.

```text
wall          integer, index of one edge in the room outline
x             centimeters from the center of that wall to the center of the image
y             centimeters from the center of that wall to the center of the image
width         centimeters, hanging width
pixel_width   pixels
pixel_height  pixels
```

`x` is positive to the right when standing inside the room and facing that wall. `y` is positive up. `x = 0` and `y = 0` is the center of the wall. Display height is not stored. It is `width * pixel_height / pixel_width`, and it grows equally above and below `y`.

One Three.js unit is one centimeter. A 10 foot by 10 foot room with an 8 foot ceiling is 304.8 by 304.8 by 243.84. The center of an 8 foot wall is 121.92 cm off the floor. A 57 inch eyeline is 144.78 cm off the floor, which is `y = 23` in this system. Preset spots use that `y` and `width = 90`.

Rows already in the database have no placement. Leave those columns null. Do not stamp them on the map. List them with no letter until a placement is written.

`example/` scenes still use meter-scale numbers. They are reference drawings. Do not convert them in this pass.

## Wall numbers

`wall` is an outline edge, not a compass name. A box has four edges. A hallway has more. For every four-edge room, use this order:

```text
0  north
1  east
2  south
3  west
```

A later outline walker must use this same order for a rectangle. Changing the order moves every stored picture.

## Upload contract

`public/upload.php` stores the placement it is given. It does not choose a spot.

The form posts:

```text
room
image
wall
x
y
width
```

Reject the upload when `wall`, `x`, `y`, or `width` is missing or not numeric, or when `width` is not greater than 0. `pixel_width` and `pixel_height` come from `getimagesize`, which the script already calls.

`public/index.php` fills the four placement fields for the text page. The next spot is the first letter bin on the current map that contains no picture. Hidden inputs carry `wall`, `x`, `y`, and `width`. The browser only submits them. When every bin is taken, do not offer another upload.

The Three.js page will post the same four fields from the spot the user picks.

## Text map

`src/maps.php` keeps one plain drawing per door layout. The closed room (`----`) is the only layout with letter bins in this pass. Its drawing should be pipes and dashes, not baked-in letters. The other layouts stay as they are and show no letters yet.

Stamp letters onto a copy of the plain drawing when the page renders.

Closed-room bins, row and column in that drawing:

```text
letter  wall  row  col   edge
A       0     0    4     north
I       0     0    7     north
E       0     0    9     north
D       1     2    12    east
H       1     4    12    east
B       2     6    9     south
F       2     6    6     south
J       2     6    3     south
G       3     4    0     west
C       3     2    0     west
```

The preset position for a bin is the center of its character cell. `y` for these presets is 23. `width` is 90.

Along a north or south edge, the cell's column sets `x`. Along an east or west edge, the cell's row sets `x`, because that axis runs along the wall. The sign follows the facing rule:

```text
north  larger column is +x
south  smaller column is +x
east   larger row is +x
west   smaller row is +x
```

Derive each bin's `x` range from the cells on that edge so the ranges meet and cover the wall. A north or south bin covers the full wall height in `y`. An east or west bin covers the vertical cell it is drawn in, so a picture hung high on the west edge lands on C and one hung low lands on G.

## Matching a picture to a letter

For each image with a placement:

1. Look at bins on the same `wall`.
2. Use the bin whose `x` and `y` ranges contain the picture.
3. If none contain it, use the nearest bin on that wall.

The letter is not saved. A picture moved in the 3D room changes letters the next time the text page is drawn. Deleting a picture clears its letter the same way.

`width` does not pick the bin. The center point does, even when the picture is wide enough to cross the next spot.

Several pictures in one bin share its letter. The map shows that letter once. Under the map, list every picture in the bin under that letter, each linked to its file. Pictures with a null placement are listed with no letter.

## Out of scope for this pass

- Letter bins for the other 15 door layouts
- Hallway outlines with more than four edges
- Rebuilding the Three.js rooms in centimeters
- Letting the text page nudge a picture after upload
- Backfilling rows that already exist
