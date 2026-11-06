import { helpers } from './helpers-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { Gallery, createRoom, roomOutline } = helpers;
const walls = ['north', 'east', 'south', 'west'];

test('galleries keep their square footprint with zero or one door', () => {
    for (let mask = 0; mask < 16; mask++) {
        const doors = Object.fromEntries(walls.map((wall, index) => [
            wall, { exists: Boolean(mask & (1 << index)), neighborId: String(index) },
        ]));
        const expected = walls.filter((wall, index) => mask & (1 << index));
        if (expected.length > 1)
            continue;

        const room = new Gallery({ doors });
        assert.deepEqual(Object.keys(room.doors), expected);
        assert.equal(room.hallway, false);
        assert.deepEqual(
            roomOutline({ ...room.options, doors: room.doors }),
            roomOutline({ ...room.options, doors: {} })
        );
    }
});

test('room creation treats rooms with two or more doors as hallways', () => {
    for (let mask = 0; mask < 16; mask++) {
        const doors = Object.fromEntries(walls.map((wall, index) => [
            wall, { exists: Boolean(mask & (1 << index)), neighborId: String(index) },
        ]));
        const doorCount = walls.filter((_, index) => mask & (1 << index)).length;
        const room = createRoom({ doors, gallery: doorCount >= 2 });

        assert.equal(room.hallway, doorCount >= 2);
    }
});

test('gallery doors still require a cardinal wall and replace duplicates', () => {
    const room = new Gallery({ doors: { north: true } });
    room.addNorthDoor({ locked: true });
    assert.equal(room.doorCount(), 1);
    assert.equal(room.doors.north.locked, true);
    assert.throws(() => room.addDoor('ceiling'), /wall/i);
});
