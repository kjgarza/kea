import type { GroupsState, PlayGroup } from "./types";

/** Pure group operations. The default group has an empty name (localised in the UI). */

export const DEFAULT_GROUP_ID = "default";

export const DEFAULT_GROUPS: GroupsState = {
  groups: [{ id: DEFAULT_GROUP_ID, name: "", hidePlayed: false }],
  selectedId: DEFAULT_GROUP_ID,
};

export const MAX_GROUP_NAME = 40;

export function newGroupId(now: number = Date.now(), random: () => number = Math.random): string {
  return `g-${now.toString(36)}-${Math.floor(random() * 36 ** 4).toString(36)}`;
}

export function cleanGroupName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_GROUP_NAME);
}

export function selectedGroup(state: GroupsState): PlayGroup {
  return (
    state.groups.find((g) => g.id === state.selectedId) ??
    state.groups[0] ??
    DEFAULT_GROUPS.groups[0]
  );
}

/** Add a group and select it. Empty names are ignored. */
export function addGroup(state: GroupsState, name: string, id: string = newGroupId()): GroupsState {
  const clean = cleanGroupName(name);
  if (!clean || state.groups.some((g) => g.id === id)) return state;
  return {
    groups: [...state.groups, { id, name: clean, hidePlayed: false }],
    selectedId: id,
  };
}

export function renameGroup(state: GroupsState, id: string, name: string): GroupsState {
  const clean = cleanGroupName(name);
  if (!clean) return state;
  return {
    ...state,
    groups: state.groups.map((g) => (g.id === id ? { ...g, name: clean } : g)),
  };
}

export function selectGroup(state: GroupsState, id: string): GroupsState {
  if (!state.groups.some((g) => g.id === id)) return state;
  return { ...state, selectedId: id };
}

export function setHidePlayed(state: GroupsState, id: string, hidePlayed: boolean): GroupsState {
  return {
    ...state,
    groups: state.groups.map((g) => (g.id === id ? { ...g, hidePlayed } : g)),
  };
}

/** Union by id; groups already in `a` win. Selection stays `a`'s. */
export function mergeGroups(a: GroupsState, b: GroupsState): GroupsState {
  const ids = new Set(a.groups.map((g) => g.id));
  return { ...a, groups: [...a.groups, ...b.groups.filter((g) => !ids.has(g.id))] };
}

export function isGroupsState(value: unknown): value is GroupsState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.selectedId === "string" &&
    Array.isArray(s.groups) &&
    s.groups.length > 0 &&
    s.groups.every(
      (g) =>
        typeof g === "object" &&
        g !== null &&
        typeof (g as PlayGroup).id === "string" &&
        typeof (g as PlayGroup).name === "string" &&
        typeof (g as PlayGroup).hidePlayed === "boolean"
    )
  );
}
