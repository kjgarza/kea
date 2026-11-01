"use client";

import { useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  addGroup,
  MAX_GROUP_NAME,
  renameGroup,
  selectedGroup,
  selectGroup,
  setGroups,
  setHidePlayed,
  type GroupsState,
  type PlayGroup,
} from "@/lib/history";
import type { TranslateFn } from "@/lib/i18n";

interface Props {
  groups: GroupsState;
  t: TranslateFn;
}

export function groupLabel(group: Pick<PlayGroup, "name">, t: TranslateFn): string {
  return group.name || t("history.group.default");
}

/**
 * F3: who is playing (e.g. Berlin crew, partner, solo), with add/rename and
 * the per-group hide-played toggle. Writes through the shared store.
 */
export function GroupPicker({ groups, t }: Props) {
  const current = selectedGroup(groups);
  const [editing, setEditing] = useState<"add" | "rename" | null>(null);
  const [name, setName] = useState("");

  const openEditor = (mode: "add" | "rename") => {
    setName(mode === "rename" ? current.name : "");
    setEditing(mode);
  };

  const save = () => {
    if (editing === "add") setGroups((s) => addGroup(s, name));
    if (editing === "rename") setGroups((s) => renameGroup(s, current.id, name));
    setEditing(null);
  };

  return (
    <div className="rounded-3xl border bg-white/90 shadow-sm p-4 space-y-3" data-testid="group-picker">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Users className="h-4 w-4" />
        {t("history.group.label")}
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("history.group.label")}>
        {groups.groups.map((group) => {
          const selected = group.id === current.id;
          return (
            <button
              key={group.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setGroups((s) => selectGroup(s, group.id))}
              className={`h-10 max-w-full truncate rounded-full px-4 text-sm font-semibold border transition ${
                selected
                  ? "bg-situation text-white border-situation"
                  : "bg-white text-foreground border-border"
              }`}
            >
              {groupLabel(group, t)}
            </button>
          );
        })}
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={() => openEditor("add")}
          aria-label={t("history.group.add")}
          title={t("history.group.add")}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={() => openEditor("rename")}
          aria-label={t("history.group.rename")}
          title={t("history.group.rename")}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>{t("history.group.hidePlayed")}</span>
        <Switch
          checked={current.hidePlayed}
          onCheckedChange={(checked) => setGroups((s) => setHidePlayed(s, current.id, checked))}
          aria-label={t("history.group.hidePlayed")}
          data-testid="hide-played"
        />
      </label>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="rounded-3xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing === "rename" ? t("history.group.renameTitle") : t("history.group.addTitle")}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-4"
          >
            <Input
              autoFocus
              value={name}
              maxLength={MAX_GROUP_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("history.group.namePlaceholder")}
              aria-label={t("history.group.name")}
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" className="rounded-full" disabled={!name.trim()}>
                {t("history.group.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
