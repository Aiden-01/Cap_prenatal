import test from 'node:test';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const TZ of ['UTC', 'America/Guatemala', 'Asia/Tokyo']) {
  test(`fechas civiles, formato y edad gestacional independientes de TZ (${TZ})`, () => {
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { parseClinicalDate, formatClinicalDate, calculateGestationalAge } from './src/utils/gestationalAge.js';
      for (const day of ['2026-01-15','2026-01-31','2026-12-31','2026-02-28','2024-02-29']) {
        const expected = Number(day.slice(8))+'/'+Number(day.slice(5,7))+'/'+day.slice(0,4);
        for (const value of [day, day+'T00:00:00.000Z', day+'T23:00:00-06:00']) {
          assert.equal(parseClinicalDate(value).toISOString(), day+'T00:00:00.000Z');
          assert.equal(formatClinicalDate(value), expected);
        }
      }
      for (const value of [null, undefined, '']) { assert.equal(parseClinicalDate(value),null); assert.equal(formatClinicalDate(value),'—'); }
      for (const value of ['2026-02-29','2024-02-30','invalid','2026-13-01']) { assert.equal(parseClinicalDate(value),null); assert.equal(formatClinicalDate(value),'Sin fecha'); }
      assert.deepEqual(calculateGestationalAge('2024-02-28','2024-03-01'), { totalDays:2,weeks:0,days:2 });
      assert.deepEqual(calculateGestationalAge('2026-12-31','2027-01-07'), { totalDays:7,weeks:1,days:0 });
      assert.deepEqual(calculateGestationalAge('2024-02-29','2024-12-05'), { totalDays:280,weeks:40,days:0 });
      assert.equal(calculateGestationalAge('2026-01-02','2026-01-01'),null);
    `], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, TZ }, encoding: 'utf8' });
  });
}
