import type { Assignment } from "@/types/assignment";
import {
  DEFAULT_TAB_SWITCH_POLICY,
  type TabSwitchPolicy,
} from "./constants";

export function getEffectiveTabSwitchPolicy(
  assignment: Pick<Assignment, "tab_switch_policy">,
): TabSwitchPolicy {
  return assignment.tab_switch_policy ?? DEFAULT_TAB_SWITCH_POLICY;
}

export function getEffectiveAllowCopyPaste(
  assignment: Pick<Assignment, "allow_copy_paste">,
): boolean {
  return assignment.allow_copy_paste === true;
}
