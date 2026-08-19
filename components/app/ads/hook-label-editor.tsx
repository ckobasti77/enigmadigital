"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Edit2, X, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface HookLabelEditorProps {
  adId: Id<"ads">;
  currentLabel?: string;
  fallbackName: string;
  className?: string;
  size?: "sm" | "default";
  variant?: "badge" | "inline";
  onUpdated?: (newLabel?: string) => void;
}

export function HookLabelEditor({
  adId,
  currentLabel,
  fallbackName,
  className,
  size = "sm",
  variant = "badge",
  onUpdated,
}: HookLabelEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(currentLabel ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setHookLabelMutation = useMutation(api.metaAdsStore.setHookLabel);

  const startEditing = () => {
    setLabel(currentLabel ?? "");
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      await setHookLabelMutation({
        adId,
        hookLabel: label.trim(),
      });
      setIsEditing(false);
      onUpdated?.(label.trim() || undefined);
    } catch (err) {
      console.error("Greška pri čuvanju hook oznake:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setLabel(currentLabel ?? "");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div
        className={cn("flex items-center gap-1.5", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="npr. Hook A — Bol korisnika"
          disabled={isSaving}
          className={cn(
            "h-7 text-xs border-accent-400/50 bg-surface-raised focus-visible:ring-accent-400",
            size === "sm" ? "h-6 text-micro px-2" : "h-8 text-xs px-2.5",
          )}
        />
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={handleSave}
          disabled={isSaving}
          className="size-6 text-accent-400 hover:bg-accent-400/10 hover:text-accent-300"
          title="Sačuvaj (Enter)"
        >
          <Check className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={handleCancel}
          disabled={isSaving}
          className="size-6 text-text-muted hover:bg-surface-raised hover:text-foreground"
          title="Otkaži (Esc)"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  const hasCustomLabel = Boolean(currentLabel && currentLabel.trim().length > 0);

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "group/hook inline-flex items-center gap-1.5 text-xs text-text-muted",
          className,
        )}
      >
        <Tag className="size-3 text-accent-400/70" />
        <span className="font-medium text-foreground">
          {hasCustomLabel ? currentLabel : fallbackName}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
          className="rounded p-0.5 opacity-0 group-hover/hook:opacity-100 hover:bg-surface-raised text-accent-400 transition-opacity"
          title="Izmeni hook oznaku"
          aria-label="Izmeni hook oznaku"
        >
          <Edit2 className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/hook inline-flex items-center gap-1 max-w-full",
        className,
      )}
    >
      {hasCustomLabel ? (
        <span
          onClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
          className="inline-flex items-center gap-1 rounded border border-accent-400/30 bg-accent-400/10 px-2 py-0.5 text-micro font-semibold text-accent-400 cursor-pointer hover:border-accent-400/60 hover:bg-accent-400/15 transition-all truncate"
          title="Kliknite za izmenu oznake"
        >
          <span className="truncate">{currentLabel}</span>
          <Edit2 className="size-2.5 opacity-0 group-hover/hook:opacity-100 transition-opacity shrink-0 ml-0.5" />
        </span>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
          className="inline-flex items-center gap-1 rounded border border-dashed border-line-strong px-2 py-0.5 text-[0.625rem] text-text-muted hover:border-accent-400/40 hover:text-accent-400 transition-colors"
          title="Dodaj hook oznaku (npr. Hook A, Hook B)"
        >
          <Edit2 className="size-2.5" />
          <span>Dodaj hook oznaku</span>
        </button>
      )}
    </div>
  );
}
