import {
  assertCatalogUsageTypesComplete,
  assertGatewayImportBoundaryHolds,
  assertRateCardComplete,
} from "../src/lib/ai/metering/validate";

assertCatalogUsageTypesComplete();
assertRateCardComplete();
assertGatewayImportBoundaryHolds();
console.log("AI metering: catalog, rate card, and import boundary are valid.");
