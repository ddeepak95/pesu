import {
  assertCatalogUsageTypesComplete,
  assertFunnelCoverageComplete,
  assertGatewayImportBoundaryHolds,
  assertRateCardComplete,
} from "../src/lib/ai/metering/validate";

assertCatalogUsageTypesComplete();
assertRateCardComplete();
assertGatewayImportBoundaryHolds();
assertFunnelCoverageComplete();
console.log(
  "AI metering: catalog, rate card, import boundary, and funnel coverage are valid.",
);
