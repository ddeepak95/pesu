"use client";

import { useEffect, useState } from "react";
import { Class } from "@/types/class";
import { MandatoryField } from "@/types/mandatoryFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMandatoryFieldsForClass,
  createMandatoryField,
  updateMandatoryField,
  deleteMandatoryField,
} from "@/lib/queries/mandatoryFields";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";

interface LocalField {
  id: string;
  field_name: string;
  field_type: "text" | "dropdown";
  options: string[];
  position: number;
  isNew?: boolean;
}

export default function ManageMandatoryFieldsDialog({
  classData,
  open,
  onOpenChange,
}: {
  classData: Class;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [fields, setFields] = useState<LocalField[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedFieldIds, setDeletedFieldIds] = useState<string[]>([]);
  // Track option input per field (keyed by field index)
  const [optionInputs, setOptionInputs] = useState<Record<number, string>>({});

  // Load existing fields when dialog opens
  useEffect(() => {
    const loadFields = async () => {
      if (!open) return;

      setLoading(true);
      setError(null);
      setDeletedFieldIds([]);

      try {
        const existingFields = await getMandatoryFieldsForClass(classData.id);
        setFields(
          existingFields.map((f) => ({
            id: f.id,
            field_name: f.field_name,
            field_type: f.field_type,
            options: f.options || [],
            position: f.position,
            isNew: false,
          }))
        );
      } catch (err) {
        console.error("Error loading mandatory fields:", err);
        setError("Failed to load mandatory fields");
      } finally {
        setLoading(false);
      }
    };

    loadFields();
  }, [open, classData.id]);

  const handleAddField = () => {
    const newPosition =
      fields.length > 0 ? Math.max(...fields.map((f) => f.position)) + 1 : 0;

    setFields([
      ...fields,
      {
        id: `new-${Date.now()}`,
        field_name: "",
        field_type: "text",
        options: [],
        position: newPosition,
        isNew: true,
      },
    ]);
  };

  const handleRemoveField = (index: number) => {
    const field = fields[index];
    if (!field.isNew) {
      setDeletedFieldIds([...deletedFieldIds, field.id]);
    }
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (
    index: number,
    key: keyof LocalField,
    value: string | string[]
  ) => {
    const updated = [...fields];
    if (key === "field_type" && value === "text") {
      updated[index] = { ...updated[index], [key]: value, options: [] };
    } else {
      updated[index] = { ...updated[index], [key]: value };
    }
    setFields(updated);
  };

  const handleAddOption = (index: number) => {
    const optionValue = optionInputs[index]?.trim();
    if (!optionValue) return;

    const field = fields[index];
    // Don't add duplicate options
    if (field.options.includes(optionValue)) {
      return;
    }

    handleFieldChange(index, "options", [...field.options, optionValue]);
    setOptionInputs({ ...optionInputs, [index]: "" });
  };

  const handleRemoveOption = (fieldIndex: number, optionIndex: number) => {
    const field = fields[fieldIndex];
    const newOptions = field.options.filter((_, i) => i !== optionIndex);
    handleFieldChange(fieldIndex, "options", newOptions);
  };

  const handleOptionInputChange = (index: number, value: string) => {
    setOptionInputs({ ...optionInputs, [index]: value });
  };

  const handleOptionInputKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddOption(index);
    }
  };

  const moveField = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === fields.length - 1)
    ) {
      return;
    }

    const newFields = [...fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    // Swap positions
    const tempPosition = newFields[index].position;
    newFields[index].position = newFields[targetIndex].position;
    newFields[targetIndex].position = tempPosition;

    // Swap array elements
    [newFields[index], newFields[targetIndex]] = [
      newFields[targetIndex],
      newFields[index],
    ];

    setFields(newFields);
  };

  const handleSave = async () => {
    // Validate fields
    for (const field of fields) {
      if (!field.field_name.trim()) {
        setError("All fields must have a name");
        return;
      }
      if (field.field_type === "dropdown" && field.options.length < 2) {
        setError(`Dropdown "${field.field_name}" must have at least 2 options`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      // Delete removed fields
      for (const id of deletedFieldIds) {
        await deleteMandatoryField(id);
      }

      // Create new fields and update existing ones
      const existingFieldIds = new Set<string>();

      for (const field of fields) {
        if (field.isNew) {
          await createMandatoryField(classData.id, {
            field_name: field.field_name,
            field_type: field.field_type,
            options: field.options,
            position: field.position,
          });
        } else {
          existingFieldIds.add(field.id);
          await updateMandatoryField(field.id, {
            field_name: field.field_name,
            field_type: field.field_type,
            options: field.options,
            position: field.position,
          });
        }
      }

      onOpenChange(false);
    } catch (err) {
      console.error("Error saving mandatory fields:", err);
      setError("Failed to save mandatory fields. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mandatory Student Information</DialogTitle>
          <DialogDescription>
            Configure the information fields that students must fill out before
            accessing class content. Leave empty if no mandatory information is
            required.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading fields...
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                <p>No mandatory fields configured.</p>
                <p className="text-sm mt-1">
                  Students can access class content without additional
                  information.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="border rounded-lg p-4 space-y-3 bg-muted/30"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          Field {index + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => moveField(index, "up")}
                          disabled={index === 0 || saving}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => moveField(index, "down")}
                          disabled={index === fields.length - 1 || saving}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveField(index)}
                          disabled={saving}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="space-y-2">
                        <Label htmlFor={`field-name-${index}`}>
                          Field Label
                        </Label>
                        <Input
                          id={`field-name-${index}`}
                          placeholder="e.g., Student ID, Department, Year"
                          value={field.field_name}
                          onChange={(e) =>
                            handleFieldChange(
                              index,
                              "field_name",
                              e.target.value
                            )
                          }
                          disabled={saving}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`field-type-${index}`}>
                          Field Type
                        </Label>
                        <Select
                          value={field.field_type}
                          onValueChange={(value: "text" | "dropdown") =>
                            handleFieldChange(index, "field_type", value)
                          }
                          disabled={saving}
                        >
                          <SelectTrigger id={`field-type-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text Input</SelectItem>
                            <SelectItem value="dropdown">Dropdown</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {field.field_type === "dropdown" && (
                        <div className="space-y-2">
                          <Label>Options</Label>

                          {/* Display existing options as tags */}
                          {field.options.length > 0 && (
                            <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-background">
                              {field.options.map((option, optionIndex) => (
                                <span
                                  key={optionIndex}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-secondary rounded-md"
                                >
                                  {option}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveOption(index, optionIndex)
                                    }
                                    disabled={saving}
                                    className="hover:text-destructive"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Input for adding new option */}
                          <div className="flex gap-2">
                            <Input
                              id={`field-options-${index}`}
                              placeholder="Type an option and press Enter or Add"
                              value={optionInputs[index] || ""}
                              onChange={(e) =>
                                handleOptionInputChange(index, e.target.value)
                              }
                              onKeyDown={(e) =>
                                handleOptionInputKeyDown(index, e)
                              }
                              disabled={saving}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAddOption(index)}
                              disabled={saving || !optionInputs[index]?.trim()}
                            >
                              Add
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Add at least 2 options. Press Enter or click Add.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleAddField}
              disabled={saving}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
