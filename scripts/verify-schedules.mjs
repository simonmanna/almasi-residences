#!/usr/bin/env node
/**
 * §9 Phase 1 acceptance — "the payment schedule for every seeded unit sums to
 * exactly the unit price". The pure function is unit-tested; this checks the
 * whole live path (database → API → arithmetic) for all 92 units.
 */
const API = process.env.API_URL ?? 'http://localhost:3001';
const SLUG = process.env.DEVELOPMENT_SLUG ?? 'seed-dev';

const live = await fetch(`${API}/api/v1/inventory/live?development=${SLUG}`);
if (!live.ok) {
  console.error(`✗ Could not read inventory: HTTP ${live.status}`);
  process.exit(1);
}
const { units } = await live.json();

let failures = 0;
for (const unit of units) {
  const res = await fetch(`${API}/api/v1/pricing/schedule`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ unitId: unit.id }),
  });
  if (!res.ok) {
    console.error(`✗ ${unit.id}: HTTP ${res.status}`);
    failures++;
    continue;
  }
  const schedule = await res.json();
  const sum = schedule.rows.reduce((a, r) => a + r.amountMinor, 0);
  if (sum !== schedule.totalMinor) {
    console.error(`✗ ${schedule.unitCode}: rows sum to ${sum}, price is ${schedule.totalMinor}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`✗ ${failures} of ${units.length} schedules do not sum to the price`);
  process.exit(1);
}
console.log(`✓ all ${units.length} payment schedules sum to exactly the unit price`);
