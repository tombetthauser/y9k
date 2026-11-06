import { helpers } from './helpers-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { Gallery, roomOutline } = helpers;
const walls = ['north', 'east', 'south', 'west'];

test('galleries accept every combination of zero to four doors', () => {
    // Exercise the same constructor path used when entering an experimental gallery.
    for (let mask = 0; mask < 16; mask++) {
        const doors = Object.fromEntries(walls.map((wall, index) => [
            wall, { exists: Boolean(mask & (1 << index)), neighborId: String(index) },
        ]));
        const room = new Gallery({ doors });
        const expected = walls.filter((wall, index) => mask & (1 << index));
        assert.deepEqual(Object.keys(room.doors), expected);
        assert.equal(room.hallway, false);
        assert.deepEqual(
            roomOutline({ ...room.options, doors: room.doors }),
            roomOutline({ ...room.options, doors: {} })
        );
    }
});

test('gallery doors still require a cardinal wall and replace duplicates', () => {
    const room = new Gallery({ doors: { north: true, east: true } });
    room.addNorthDoor({ locked: true });
    assert.equal(room.doorCount(), 2);
    assert.equal(room.doors.north.locked, true);
    assert.throws(() => room.addDoor('ceiling'), /wall/i);
});
