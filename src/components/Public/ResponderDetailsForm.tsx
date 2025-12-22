"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponderFieldConfig } from "@/types/assignment";

interface ResponderDetailsFormProps {
  fields: ResponderFieldConfig[];
  onSubmit: (data: Record<string, any>) => void;
  initialValues?: Record<string, any>;
  submitLabel?: string;
}

/**
 * Dynamic form component for collecting responder details
 * Renders form fields based on ResponderFieldConfig
 */
export default function ResponderDetailsForm({
  fields,
  onSubmit,
  initialValues = {},
  submitLabel = "Begin Assignment",
}: ResponderDetailsFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    fields.forEach((fieldConfig) => {
      if (fieldConfig.required) {
        const value = formData[fieldConfig.field];
        if (!value || (typeof value === "string" && !value.trim())) {
          newErrors[fieldConfig.field] = `${fieldConfig.label} is required`;
        }
      }

      // Email validation
      if (fieldConfig.type === "email" && formData[fieldConfig.field]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[fieldConfig.field])) {
          newErrors[fieldConfig.field] = "Please enter a valid email address";
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };

  const renderField = (fieldConfig: ResponderFieldConfig) => {
    const value = formData[fieldConfig.field] || "";
    const error = errors[fieldConfig.field];

    switch (fieldConfig.type) {
      case "text":
      case "email":
      case "tel":
        return (
          <div key={fieldConfig.field} className="space-y-2">
            <Label htmlFor={fieldConfig.field}>
              {fieldConfig.label}
              {fieldConfig.required && <span className="text-destructive"> *</span>}
            </Label>
            <Input
              id={fieldConfig.field}
              type={fieldConfig.type}
              placeholder={fieldConfig.placeholder || `Enter ${fieldConfig.label.toLowerCase()}`}
              value={value}
              onChange={(e) => handleChange(fieldConfig.field, e.target.value)}
              required={fieldConfig.required}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        );

      case "select":
        return (
          <div key={fieldConfig.field} className="space-y-2">
            <Label htmlFor={fieldConfig.field}>
              {fieldConfig.label}
              {fieldConfig.required && <span className="text-destructive"> *</span>}
            </Label>
            <Select
              value={value}
              onValueChange={(val) => handleChange(fieldConfig.field, val)}
              required={fieldConfig.required}
            >
              <SelectTrigger id={fieldConfig.field}>
                <SelectValue placeholder={fieldConfig.placeholder || `Select ${fieldConfig.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {fieldConfig.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {fields.map((fieldConfig) => renderField(fieldConfig))}
      <Button type="submit" className="w-full" disabled={Object.keys(errors).length > 0}>
        {submitLabel}
      </Button>
    </form>
  );
}

