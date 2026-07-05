"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
  CommandInput,
} from "@/components/ui/command"

export interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: string[] | { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
  /** View-mode display: kept `disabled` but skips the dimmed/greyed-out look so the selected value stays legible. */
  readOnly?: boolean
  id?: string
  className?: string
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  disabled = false,
  readOnly = false,
  id,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const listboxId = React.useId()
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  )
  const selectedLabel =
    normalizedOptions.find((option) => option.value === value)?.label ?? ""

  const handleSelect = (selected: string) => {
    onValueChange(selected)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          disabled={disabled || readOnly}
          className={cn(
            "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
            readOnly && "disabled:cursor-default disabled:opacity-100",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="line-clamp-1 truncate">
            {selectedLabel || placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={true}>
          <CommandInput placeholder="Search..." className="h-9" />
          <CommandList id={listboxId}>
            <CommandEmpty>No option found.</CommandEmpty>
            {normalizedOptions.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                onSelect={() => handleSelect(option.value)}
              >
                {option.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
