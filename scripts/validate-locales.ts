import { assertLocaleRegistryValid } from "../src/lib/locales/validate";
import { assertKonvoCapabilitiesValid } from "../src/lib/prototype/konvo-voice/konvoLocaleCapabilitiesHelpers";

assertLocaleRegistryValid();
assertKonvoCapabilitiesValid();
console.log("Locale registry and Konvo capabilities are valid.");
