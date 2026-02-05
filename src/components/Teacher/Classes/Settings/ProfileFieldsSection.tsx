"use client";

import { useEffect, useState } from "react";
import { Class } from "@/types/class";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  getProfileFieldsForClass,
  createProfileField,
  updateProfileField,
  deleteProfileField,
} from "@/lib/queries/profileFields";
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
  is_mandatory: boolean;
  is_display_name: boolean;
  isNew?: boolean;
}

interface ProfileFieldsSectionProps {
  classData: Class;
  isOwner: boolean;
}

export default function ProfileFieldsSection({
  classData,
  isOwner,
}: ProfileFieldsSectionProps) {
  const [fields, setFields] = useState<LocalField[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deletedFieldIds, setDeletedFieldIds] = useState<string[]>([]);
  const [optionInputs, setOptionInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    const loadFields = async () => {
      setLoading(true);
      setError(null);
      setDeletedFieldIds([]);

      try {
        const existingFields = await getProfileFieldsForClass(classData.id);
        setFields(
          existingFields.map((f) => ({
            id: f.id,
            field_name: f.field_name,
            field_type: f.field_type,
            options: f.options || [],
            position: f.position,
            is_mandatory: f.is_mandatory,
            is_display_name: f.is_display_name,
            isNew: false,
          }))
        );
      } catch (err) {
        console.error("Error loading profile fields:", err);
        setError("Failed to load profile fields");
      } finally {
        setLoading(false);
      }
    };

    loadFields();
  }, [classData.id]);

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
        is_mandatory: true,
        is_display_name: false,
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
    value: string | string[] | boolean
  ) => {
    const updated = [...fields];
    if (key === "field_type" && value === "text") {
      updated[index] = { ...updated[index], [key]: value, options: [] };
    } else {
      updated[index] = { ...updated[index], [key]: value };
    }
    setFields(updated);
  };

  const handleDisplayNameChange = (index: number) => {
    const updated = fields.map((f, i) => ({
      ...f,
      is_display_name: i === index ? !f.is_display_name : false,
    }));
    setFields(updated);
  };

  const handleAddOption = (index: number) => {
    const optionValue = optionInputs[index]?.trim();
    if (!optionValue) return;

    const field = fields[index];
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

    const tempPosition = newFields[index].position;
    newFields[index].position = newFields[targetIndex].position;
    newFields[targetIndex].position = tempPosition;

    [newFields[index], newFields[targetIndex]] = [
      newFields[targetIndex],
      newFields[index],
    ];

    setFields(newFields);
  };

  const handleSave = async () => {
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
    setSuccess(false);

    try {
      for (const id of deletedFieldIds) {
        await deleteProfileField(id);
      }

      for (const field of fields) {
        if (field.isNew) {
          await createProfileField(classData.id, {
            field_name: field.field_name,
            field_type: field.field_type,
            options: field.options,
            position: field.position,
            is_mandatory: field.is_mandatory,
            is_display_name: field.is_display_name,
          });
        } else {
          await updateProfileField(field.id, {
            field_name: field.field_name,
            field_type: field.field_type,
            options: field.options,
            position: field.position,
            is_mandatory: field.is_mandatory,
            is_display_name: field.is_display_name,
          });
        }
      }

      setDeletedFieldIds([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      // Reload to get fresh IDs for newly created fields
      const existingFields = await getProfileFieldsForClass(classData.id);
      setFields(
        existingFields.map((f) => ({
          id: f.id,
          field_name: f.field_name,
          field_type: f.field_type,
          options: f.options || [],
          position: f.position,
          is_mandatory: f.is_mandatory,
          is_display_name: f.is_display_name,
          isNew: false,
        }))
      );
    } catch (err) {
      console.error("Error saving profile fields:", err);
      setError("Failed to save profile fields. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Student Profile Fields</CardTitle>
        <CardDescription>
          Configure the profile fields students will fill out. Mark fields as
          mandatory to require them before class access. Select one field to use
          as the student display name.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading fields...
          </div>
        ) : (
          <div className="space-y-4">
            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                <p>No profile fields configured.</p>
                <p className="text-sm mt-1">
                  Add fields to collect student information like name,
                  department, or student ID.
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

                      {/* Mandatory toggle and Display Name radio */}
                      <div className="flex flex-col gap-3 pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor={`field-mandatory-${index}`}
                            className="text-sm cursor-pointer"
                          >
                            Required
                          </Label>
                          <Switch
                            id={`field-mandatory-${index}`}
                            checked={field.is_mandatory}
                            onCheckedChange={(checked) =>
                              handleFieldChange(index, "is_mandatory", checked)
                            }
                            disabled={saving}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor={`field-display-name-${index}`}
                            className="text-sm cursor-pointer"
                          >
                            Use as display name
                          </Label>
                          <input
                            type="radio"
                            id={`field-display-name-${index}`}
                            name="display-name-field"
                            checked={field.is_display_name}
                            onChange={() => handleDisplayNameChange(index)}
                            disabled={saving}
                            className="h-4 w-4 accent-primary cursor-pointer"
                          />
                        </div>
                      </div>
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
            {success && (
              <p className="text-sm text-green-600">
                Profile fields saved successfully.
              </p>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSave}
                disabled={loading || saving}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
