import { helpers } from './helpers-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { californiaDateParts, californiaSunTimes, getCaliforniaSkyPeriod } = helpers;

test('California clock handles midnight, date boundaries, and daylight saving', () => {
    assert.equal(californiaDateParts(new Date('2026-01-01T07:00:00Z')).day, 31);
    assert.equal(californiaDateParts(new Date('2026-01-01T08:00:00Z')).hour, 0);
    assert.equal(californiaDateParts(new Date('2026-07-01T19:00:00Z')).hour, 12);
    assert.equal(californiaDateParts(new Date('2026-03-08T09:59:00Z')).hour, 1);
    assert.equal(californiaDateParts(new Date('2026-03-08T10:00:00Z')).hour, 3);
});

test('Sacramento solar schedule follows the seasons', () => {
    const summer = californiaSunTimes(new Date('2026-06-21T19:00:00Z'));
    const winter = californiaSunTimes(new Date('2026-12-21T20:00:00Z'));
    assert.ok(summer.sunrise > 330 && summer.sunrise < 360);
    assert.ok(summer.sunset > 1200 && summer.sunset < 1245);
    assert.ok(winter.sunrise > 420 && winter.sunrise < 450);
    assert.ok(winter.sunset > 990 && winter.sunset < 1030);
});

test('dawn and evening share a sky; overrides do not depend on visitor timezone', () => {
    const noon = new Date('2026-06-21T19:00:00Z');
    assert.equal(getCaliforniaSkyPeriod(noon).period, 'day');
    assert.equal(getCaliforniaSkyPeriod(new Date('2026-06-21T08:00:00Z')).period, 'night');
    assert.equal(getCaliforniaSkyPeriod(noon, 'dawn').sky, 'sunset');
    assert.equal(getCaliforniaSkyPeriod(noon, 'evening').sky, 'sunset');
    assert.equal(getCaliforniaSkyPeriod(noon, 'night').sky, 'stars');
    const { sunrise, sunset } = californiaSunTimes(noon);
    const atMinute = minute => new Date(Date.UTC(2026, 5, 21, 7) + minute * 60000);
    assert.equal(getCaliforniaSkyPeriod(atMinute(sunrise)).period, 'dawn');
    assert.equal(getCaliforniaSkyPeriod(atMinute(sunset)).period, 'evening');
    assert.equal(getCaliforniaSkyPeriod(atMinute(sunrise + 31)).period, 'day');
    assert.equal(getCaliforniaSkyPeriod(atMinute(sunset + 31)).period, 'night');
});
