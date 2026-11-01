import type { en } from "./en";

/** Supported UI locales. */
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Every message key, taken from the English source catalogue. */
export type MessageKey = keyof typeof en;

/** Shape every locale catalogue must satisfy: exactly the English keys. */
export type Messages = { readonly [K in MessageKey]: string };

/** Placeholder names in a message template, e.g. "{count} cards" -> "count". */
type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never;

/** Variables `t(key, vars)` requires for a key (from its English template). */
export type MessageVars<K extends MessageKey> = {
  [P in Placeholders<(typeof en)[K]>]: string | number;
};

/** Args after the key: none when the message has no placeholders. */
export type MessageArgs<K extends MessageKey> =
  [Placeholders<(typeof en)[K]>] extends [never] ? [] : [vars: MessageVars<K>];

/** A bound translate function for one locale. */
export type TranslateFn = <K extends MessageKey>(key: K, ...args: MessageArgs<K>) => string;

/** Keys whose message has no placeholders (usable as `t(key)` alone). */
export type PlainMessageKey = {
  [K in MessageKey]: MessageArgs<K> extends [] ? K : never;
}[MessageKey];
