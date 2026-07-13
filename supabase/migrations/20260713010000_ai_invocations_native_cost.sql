-- AI usage metering — native-currency cost tracking (dev-docs/ai-usage-metering-plan.md §4.4)
-- For providers whose USD price is derived through a native billing unit
-- (a prepaid-credit system, or a foreign currency) rather than being
-- directly published in USD, store that native cost alongside cost_usd so
-- it can be reconciled against the provider's own invoice/dashboard,
-- independent of whether the USD conversion is currently accurate.
-- See src/lib/ai/metering/rates.ts's NativeRateInfo / nativeRate().

alter table public.ai_invocations
  add column if not exists native_cost_units numeric(14,8), -- e.g. Cartesia credits consumed, or INR
  add column if not exists native_cost_unit  text;           -- e.g. 'cartesia_credit', 'inr'; null iff native_cost_units is null
