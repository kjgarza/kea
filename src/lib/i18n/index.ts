/**
 * UI message catalogue (EN/ES). Add strings to `en.ts` first, then `es.ts`
 * (type-checked against `en`). In components: `const { t } = useLocale(deck.language)`.
 */
export { en } from "./en";
export { es } from "./es";
export * from "./types";
export {
  CATALOGUES,
  createTranslator,
  interpolate,
  isLocale,
  localeFromLanguage,
  translate,
} from "./translate";
export { getLocaleOverride, setLocaleOverride, subscribeLocaleOverride } from "./locale-store";
export { useLocale, type UseLocaleResult } from "./use-locale";
