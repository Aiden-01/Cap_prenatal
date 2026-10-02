const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const directory = path.resolve(__dirname, '../../n8n/workflows');

test('CPREN-23: todos los schedules versionados quedan inactivos a las 08:00 Guatemala', () => {
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.json'));
  assert.ok(files.length > 0);
  let schedules = 0;
  for (const file of files) {
    const workflow = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    for (const node of workflow.nodes) {
      if (!/scheduleTrigger|cron|interval/i.test(node.type)) continue;
      assert.equal(node.type, 'n8n-nodes-base.scheduleTrigger', `${file}: revisar trigger periódico nuevo`);
      assert.equal(workflow.active, false, file);
      assert.equal(workflow.settings.timezone, 'America/Guatemala', file);
      const rules = node.parameters.rule.interval;
      assert.ok(rules.length > 0, file);
      for (const rule of rules) {
        assert.ok(['days', 'weeks', 'months'].includes(rule.field), `${file}: revisar frecuencia nueva`);
        assert.equal(rule.triggerAtHour, 8, file);
        assert.equal(rule.triggerAtMinute, 0, file);
      }
      assert.match(node.name, /08:00/, file);
      schedules += 1;
    }
  }
  assert.ok(schedules > 0);
});
