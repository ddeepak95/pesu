"use client";

import { useCallback, useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  SettingControlProps,
} from "@/lib/settings/registry";

/**
 * Dispatches a setting's value type to the right built-in control, or
 * delegates to `definition.Control` for `type: "custom"`.
 *
 * Built-in controls receive `parentValue` and clamp their UI accordingly
 * (e.g. multi-select greys-out options the parent removed).
 */
export default function SettingControl<TValue>(
  props: SettingControlProps<TValue>
) {
  const { definition } = props;

  if (definition.Control) {
    const Custom = definition.Control;
    return <Custom {...props} />;
  }

  switch (definition.type) {
    case "string_array":
      return (
        <StringArrayControl
          {...(props as unknown as SettingControlProps<string[]>)}
        />
      );
    case "boolean":
      return (
        <BooleanControl
          {...(props as unknown as SettingControlProps<boolean>)}
        />
      );
    case "string":
      return (
        <StringControl {...(props as unknown as SettingControlProps<string>)} />
      );
    case "number":
      return (
        <NumberControl {...(props as unknown as SettingControlProps<number>)} />
      );
    case "custom":
      return (
        <p className="text-sm text-destructive">
          Setting &quot;{definition.key}&quot; declares `type: &quot;custom&quot;` but no
          `Control` component.
        </p>
      );
  }
}

// ---------------------------------------------------------------------------
// String-array (multi-select checkbox group)
// ---------------------------------------------------------------------------

function StringArrayControl({
  value,
  onChange,
  disabled,
  parentValue,
  definition,
}: SettingControlProps<string[]>) {
  const options = useMemo(
    () => definition.options ?? [],
    [definition.options]
  );
  const parentAllowed = useMemo(() => new Set(parentValue), [parentValue]);
  const selected = useMemo(() => new Set(value), [value]);

  const handleToggle = useCallback(
    (optionValue: string) => {
      const next = new Set(selected);
      if (next.has(optionValue)) {
        next.delete(optionValue);
      } else {
        next.add(optionValue);
      }
      const ordered = options
        .map((o) => o.value)
        .filter((v) => next.has(v));
      onChange(ordered);
    },
    [onChange, options, selected]
  );

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {options.map((opt) => {
        const allowedByParent = parentAllowed.has(opt.value);
        const optDisabled = disabled || !allowedByParent;
        const isChecked = selected.has(opt.value);
        return (
          <label
            key={opt.value}
            className={cn(
              "flex items-center gap-2 text-sm",
              optDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
            )}
          >
            <Checkbox
              checked={isChecked}
              onCheckedChange={() => handleToggle(opt.value)}
              disabled={optDisabled}
            />
            <span>{opt.label}</span>
            {!allowedByParent && (
              <span className="text-xs text-muted-foreground">(restricted)</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boolean (switch)
// ---------------------------------------------------------------------------

function BooleanControl({
  value,
  onChange,
  disabled,
}: SettingControlProps<boolean>) {
  return (
    <Switch
      checked={value}
      onCheckedChange={onChange}
      disabled={disabled}
    />
  );
}

// ---------------------------------------------------------------------------
// String (single-select when `options` set, otherwise text input)
// ---------------------------------------------------------------------------

function StringControl({
  value,
  onChange,
  disabled,
  definition,
}: SettingControlProps<string>) {
  if (definition.options && definition.options.length > 0) {
    return (
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {definition.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-64"
    />
  );
}

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------

function NumberControl({
  value,
  onChange,
  disabled,
}: SettingControlProps<number>) {
  return (
    <Input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const parsed = Number(e.target.value);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      disabled={disabled}
      className="w-32"
    />
  );
}
