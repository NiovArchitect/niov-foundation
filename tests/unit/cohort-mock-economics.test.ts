// FILE: tests/unit/cohort-mock-economics.test.ts
// PURPOSE: Phase 1309-A — pure unit tests for the cohort mock-economics helpers.
//          Proves: readUnitPriceUsd accepts only a positive finite number from
//          the advisory pricing_model (else null); computeMockEconomics is ALWAYS
//          is_mock=true / MOCK_ONLY / USDC_MOCK, bills one unit per delivered
//          delivery, yields null when no unit price is set, and never implies a
//          real charge. No I/O.
// CONNECTS TO: apps/api/src/services/foundation/cohort-metering.service.ts

import { describe, expect, it } from "vitest";
import {
  computeMockEconomics,
  readUnitPriceUsd,
} from "../../apps/api/src/services/foundation/cohort-metering.service.js";

describe("Phase 1309-A — readUnitPriceUsd", () => {
  it("accepts a positive finite number", () => {
    expect(readUnitPriceUsd({ unit_price_usd: 2.5 })).toBe(2.5);
  });

  it("rejects zero / negative / non-finite / missing / non-object → null", () => {
    expect(readUnitPriceUsd({ unit_price_usd: 0 })).toBeNull();
    expect(readUnitPriceUsd({ unit_price_usd: -1 })).toBeNull();
    expect(readUnitPriceUsd({ unit_price_usd: Number.NaN })).toBeNull();
    expect(readUnitPriceUsd({ unit_price_usd: "2" })).toBeNull();
    expect(readUnitPriceUsd({})).toBeNull();
    expect(readUnitPriceUsd(null)).toBeNull();
    expect(readUnitPriceUsd("nope")).toBeNull();
  });
});

describe("Phase 1309-A — computeMockEconomics", () => {
  it("is ALWAYS a mock artifact (is_mock / MOCK_ONLY / USDC_MOCK)", () => {
    const e = computeMockEconomics({ pricing_model: { unit_price_usd: 1 }, metering_unit: "delivery" }, 3);
    expect(e.is_mock).toBe(true);
    expect(e.settlement_mode).toBe("MOCK_ONLY");
    expect(e.asset).toBe("USDC_MOCK");
    expect(e.note).toContain("no funds move");
  });

  it("bills one unit per delivered delivery × unit price (rounded to cents)", () => {
    const e = computeMockEconomics({ pricing_model: { unit_price_usd: 2.5 }, metering_unit: "delivery" }, 4);
    expect(e.unit_price_usd).toBe(2.5);
    expect(e.billable_units).toBe(4);
    expect(e.estimated_amount_usd).toBe(10);
  });

  it("no unit price set → estimated_amount_usd null (honest), units still counted", () => {
    const e = computeMockEconomics({ pricing_model: {}, metering_unit: null }, 7);
    expect(e.unit_price_usd).toBeNull();
    expect(e.estimated_amount_usd).toBeNull();
    expect(e.billable_units).toBe(7);
    expect(e.metering_unit).toBeNull();
  });

  it("zero delivered → zero estimate when priced", () => {
    const e = computeMockEconomics({ pricing_model: { unit_price_usd: 9.99 }, metering_unit: "delivery" }, 0);
    expect(e.billable_units).toBe(0);
    expect(e.estimated_amount_usd).toBe(0);
  });
});
