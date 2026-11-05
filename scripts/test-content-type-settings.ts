import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTINGS_REGISTRY } from "../src/lib/settings/registry";
import { mergeClassSetting, type SettingRow } from "../src/lib/settings/resolve";

const def = SETTINGS_REGISTRY.allowed_content_types;
const row = (scope: "institution" | "class", value: string[]): SettingRow => ({
  scope, scope_id: "id", key: def.key, value,
  allow_admin_edit: true, allow_child_override: false, updated_by: null, updated_at: "",
});

test("class content type overrides replace inherited values", () => {
  const institution = row("institution", ["learning_content"]);
  assert.deepEqual(mergeClassSetting(def, institution, null).value, ["learning_content"]);
  assert.deepEqual(mergeClassSetting(def, institution, row("class", ["chatbot", "learning_content"])).value, ["chatbot", "learning_content"]);
  assert.deepEqual(mergeClassSetting(def, institution, row("class", ["chatbot"])).value, ["chatbot"]);
  assert.deepEqual(mergeClassSetting(def, institution, row("class", [])).value, []);
  assert.deepEqual(mergeClassSetting(def, null, null).value, def.default);
});
