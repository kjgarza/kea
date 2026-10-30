"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Copy, ExternalLink, ImagePlus, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { AppSettingsButton, AppSettingsSheet } from "@/components/settings/app-settings-sheet";
import { useAiAvailability } from "@/hooks/use-ai-availability";
import type { AiLanguage, AuthorPhotoResponse } from "@/lib/ai/api";
import { KeaApiError, transcribePuzzlePhotos, type ClientErrorCode } from "@/lib/ai/client";
import { PHOTO_DEFAULT_PACK } from "@/lib/ai/config";
import { isPackSlug, toPackSlug } from "@/lib/ai/photo";
import { editFileUrl, emptyNewFileUrl, getRepoConfig, newFileUrl } from "@/lib/authoring/github";
import { PhotoPrepareError, preparePhoto, type PreparedPhoto } from "@/lib/authoring/image";
import { checkPackYaml, groupPackErrors, puzzleEntries } from "@/lib/authoring/pack-editor";
import { packNameFromFileName } from "@/lib/puzzles/puzzle-pack";
import { useLocale, type PlainMessageKey, type TranslateFn } from "@/lib/i18n";

interface Props {
  /** Pack files in the repo at build time, e.g. "decks/puzzles/kitchen-table-en.yaml". */
  packFiles: string[];
  /** Every deck id in public/decks/index.json at build time. */
  deckIds: string[];
}

type Side = "front" | "back";

type SlotState =
  | { status: "empty" }
  | { status: "preparing" }
  | { status: "ready"; photo: PreparedPhoto }
  | { status: "error"; key: PlainMessageKey };

type Request =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; key: PlainMessageKey };

function errorKey(code: ClientErrorCode | undefined): PlainMessageKey {
  switch (code) {
    case "network":
      return "add.error.network";
    case "missing_passcode":
    case "unauthorized":
      return "add.error.passcode";
    case "rate_limited":
      return "add.error.limited";
    case "unreadable_image":
      return "add.error.unreadable";
    case "payload_too_large":
      return "add.error.tooLarge";
    default:
      return "add.error.generic";
  }
}

/** Photo quick-add (#38): photos → AI transcription → editable pack YAML → GitHub. */
export function PhotoQuickAddScreen({ packFiles, deckIds }: Props) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const availability = useAiAvailability();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-lg mx-auto space-y-4 pb-16">
        <header className="flex items-center justify-between gap-2">
          <Button variant="ghost" className="rounded-full gap-2 -ml-2" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            {t("add.back")}
          </Button>
          <div className="flex items-center gap-1">
            <LocaleSwitch />
            <AppSettingsButton t={t} />
          </div>
        </header>

        <div>
          <h1 className="text-3xl font-bold font-display">{t("add.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("add.intro")}</p>
        </div>

        {availability === "not_configured" ? (
          <Panel testId="add-unavailable">
            <p className="text-muted-foreground">{t("add.unavailable")}</p>
          </Panel>
        ) : (
          <>
            {availability === "missing_passcode" && (
              <Panel testId="add-needs-passcode">
                <p className="text-sm">{t("add.needsPasscode")}</p>
                <Button variant="outline" className="rounded-full" onClick={() => setSettingsOpen(true)}>
                  {t("add.openSettings")}
                </Button>
                <AppSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} t={t} />
              </Panel>
            )}
            <QuickAddForm
              t={t}
              defaultLang={locale}
              disabled={availability !== "available"}
              packFiles={packFiles}
              deckIds={deckIds}
            />
          </>
        )}
      </div>
    </main>
  );
}

function Panel({ children, testId, title }: { children: React.ReactNode; testId?: string; title?: string }) {
  return (
    <section className="rounded-3xl border bg-white/90 p-5 space-y-3" data-testid={testId}>
      {title && <h2 className="text-lg font-semibold font-display">{title}</h2>}
      {children}
    </section>
  );
}

interface FormProps {
  t: TranslateFn;
  defaultLang: AiLanguage;
  disabled: boolean;
  packFiles: string[];
  deckIds: string[];
}

function QuickAddForm({ t, defaultLang, disabled, packFiles, deckIds }: FormProps) {
  const [slots, setSlots] = useState<Record<Side, SlotState>>({
    front: { status: "empty" },
    back: { status: "empty" },
  });
  const [lang, setLang] = useState<AiLanguage>(defaultLang);
  const [pack, setPack] = useState(PHOTO_DEFAULT_PACK);
  const [request, setRequest] = useState<Request>({ status: "idle" });
  const [result, setResult] = useState<AuthorPhotoResponse | null>(null);
  const [yaml, setYaml] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const packSuggestions = useMemo(
    () => [...new Set(packFiles.map((f) => packNameFromFileName(f)?.pack).filter((p): p is string => !!p))],
    [packFiles]
  );

  const setSlot = (side: Side, state: SlotState) => setSlots((prev) => ({ ...prev, [side]: state }));

  const onFile = async (side: Side, file: File | undefined) => {
    if (!file) return;
    setSlot(side, { status: "preparing" });
    try {
      const photo = await preparePhoto(file);
      setSlot(side, { status: "ready", photo });
    } catch (error) {
      const tooLarge = error instanceof PhotoPrepareError && error.reason === "too_large";
      setSlot(side, { status: "error", key: tooLarge ? "add.photos.tooLarge" : "add.photos.decodeError" });
    }
  };

  const front = slots.front.status === "ready" ? slots.front.photo : null;
  const back = slots.back.status === "ready" ? slots.back.photo : null;
  const packValid = isPackSlug(pack);
  const canRead = !disabled && !!front && packValid && request.status !== "pending";

  const read = async () => {
    if (!front || !packValid) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRequest({ status: "pending" });
    try {
      const images = [front, back]
        .filter((p): p is PreparedPhoto => !!p)
        .map(({ mediaType, data }) => ({ mediaType, data }));
      const response = await transcribePuzzlePhotos({ images, lang, pack }, { signal: controller.signal });
      setResult(response);
      setYaml(response.yaml);
      setRequest({ status: "idle" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRequest({ status: "error", key: errorKey(error instanceof KeaApiError ? error.code : undefined) });
    }
  };

  const startOver = () => {
    abortRef.current?.abort();
    setSlots({ front: { status: "empty" }, back: { status: "empty" } });
    setResult(null);
    setYaml("");
    setRequest({ status: "idle" });
  };

  return (
    <>
      <Panel title={t("add.photos.title")} testId="add-photos">
        <div className="grid grid-cols-2 gap-3">
          <PhotoSlot side="front" label={t("add.photos.front")} state={slots.front} t={t} onFile={onFile} onRemove={() => setSlot("front", { status: "empty" })} />
          <PhotoSlot side="back" label={t("add.photos.back")} state={slots.back} t={t} onFile={onFile} onRemove={() => setSlot("back", { status: "empty" })} />
        </div>
        <p className="text-xs text-muted-foreground">{t("add.photos.privacy")}</p>
      </Panel>

      <Panel title={t("add.pack.title")} testId="add-pack">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("add.pack.language")}</span>
          <select
            className="h-10 w-full rounded-md border bg-transparent px-3 text-base"
            value={lang}
            onChange={(e) => setLang(e.target.value as AiLanguage)}
            data-testid="add-lang"
          >
            <option value="en">{t("locale.name.en")}</option>
            <option value="es">{t("locale.name.es")}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("add.pack.name")}</span>
          <Input
            value={pack}
            onChange={(e) => setPack(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            onBlur={() => setPack((p) => toPackSlug(p) || PHOTO_DEFAULT_PACK)}
            list="add-pack-suggestions"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!packValid}
            data-testid="add-pack-input"
            className="h-10"
          />
          <datalist id="add-pack-suggestions">
            {packSuggestions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <span className={`block text-xs ${packValid ? "text-muted-foreground" : "text-destructive"}`}>
            {packValid ? t("add.pack.hint") : t("add.pack.invalid")}
          </span>
        </label>
        <Button className="w-full rounded-full h-12 gap-2" disabled={!canRead} onClick={read} data-testid="add-read">
          {request.status === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {request.status === "pending" ? t("add.reading") : t("add.read")}
        </Button>
        {request.status === "error" && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-3 space-y-2" role="alert" data-testid="add-error">
            <p className="text-sm">{t(request.key)}</p>
            <Button variant="outline" size="sm" className="rounded-full gap-1" onClick={read} disabled={!canRead}>
              <RotateCcw className="h-3 w-3" />
              {t("add.retry")}
            </Button>
          </div>
        )}
      </Panel>

      {result && (
        <YamlEditor
          t={t}
          yaml={yaml}
          onChange={setYaml}
          packFiles={packFiles}
          deckIds={deckIds}
          onStartOver={startOver}
        />
      )}
    </>
  );
}

interface SlotProps {
  side: Side;
  label: string;
  state: SlotState;
  t: TranslateFn;
  onFile: (side: Side, file: File | undefined) => void;
  onRemove: () => void;
}

function PhotoSlot({ side, label, state, t, onFile, onRemove }: SlotProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFile(side, e.target.files?.[0]);
    e.target.value = ""; // allow picking the same file again
  };
  return (
    <div className="space-y-2" data-testid={`add-photo-${side}`} data-status={state.status}>
      <p className="text-sm font-medium">{label}</p>
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-dashed bg-muted/40 flex items-center justify-center">
        {state.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data: URL preview
          <img src={state.photo.previewUrl} alt={label} className="h-full w-full object-cover" data-testid={`add-photo-preview-${side}`} />
        ) : state.status === "preparing" ? (
          <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("add.photos.preparing")}
          </span>
        ) : (
          <Camera className="h-8 w-8 text-muted-foreground" aria-hidden />
        )}
        {state.status === "ready" && (
          <button
            type="button"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
            onClick={onRemove}
            aria-label={`${t("add.photos.remove")}: ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {state.status === "ready" && (
        <p className="text-xs text-muted-foreground">
          {t("add.photos.size", {
            width: state.photo.width,
            height: state.photo.height,
            kb: Math.round(state.photo.bytes / 1024),
          })}
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-destructive" role="alert">
          {t(state.key)}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <Button variant="outline" size="sm" className="rounded-full gap-1" onClick={() => cameraRef.current?.click()}>
          <Camera className="h-3 w-3" />
          {state.status === "ready" ? t("add.photos.replace") : t("add.photos.take")}
        </Button>
        <Button variant="ghost" size="sm" className="rounded-full gap-1" onClick={() => pickRef.current?.click()}>
          <ImagePlus className="h-3 w-3" />
          {t("add.photos.choose")}
        </Button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={`${label}: ${t("add.photos.take")}`}
        onChange={handle}
        data-testid={`add-photo-camera-${side}`}
      />
      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label={`${label}: ${t("add.photos.choose")}`}
        onChange={handle}
        data-testid={`add-photo-input-${side}`}
      />
    </div>
  );
}

interface EditorProps {
  t: TranslateFn;
  yaml: string;
  onChange: (yaml: string) => void;
  packFiles: string[];
  deckIds: string[];
  onStartOver: () => void;
}

function YamlEditor({ t, yaml, onChange, packFiles, deckIds, onStartOver }: EditorProps) {
  const check = useMemo(() => checkPackYaml(yaml), [yaml]);
  const groups = useMemo(() => groupPackErrors(check.errors), [check.errors]);
  const valid = check.errors.length === 0;
  const repo = useMemo(() => getRepoConfig(), []);
  const fileName = check.fileName;
  const exists = fileName ? packFiles.includes(fileName) : false;
  const deckClash = !!check.deckId && !exists && deckIds.includes(check.deckId);
  const prefilled = fileName && valid && !exists ? newFileUrl(repo, fileName, yaml) : null;

  return (
    <>
      <Panel title={t("add.yaml.title")} testId="add-yaml-panel">
        <p className="text-sm text-muted-foreground">{t("add.yaml.body")}</p>
        <textarea
          className="min-h-[24rem] w-full rounded-2xl border bg-white p-3 font-mono text-xs leading-relaxed"
          value={yaml}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("add.yaml.label")}
          aria-invalid={!valid}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          data-testid="add-yaml"
        />
        {fileName && (
          <p className="text-xs text-muted-foreground" data-testid="add-file-name">
            {t("add.yaml.file", { fileName })}
          </p>
        )}
        <div data-testid="add-validation" data-valid={valid} aria-live="polite">
          {valid ? (
            <p className="text-sm text-green-700">{t("add.yaml.valid", { deckId: check.deckId ?? "" })}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">{t("add.yaml.invalid")}</p>
              <ul className="space-y-2" data-testid="add-errors">
                {groups.map((g) => (
                  <li
                    key={`${g.puzzle ?? "pack"}|${g.field}`}
                    className="rounded-xl border border-destructive/30 bg-destructive/5 p-2 text-sm"
                    data-testid="add-error-field"
                    data-field={g.field}
                  >
                    <p className="font-mono text-xs font-semibold">
                      {g.puzzle ? `${g.puzzle} › ` : ""}
                      {g.field === "general" ? t("add.yaml.pack") : g.field}
                    </p>
                    {g.messages.map((m) => (
                      <p key={m}>{m}</p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      {valid && fileName && (
        <Panel title={t("add.github.title")} testId="add-github">
          {deckClash && (
            <p className="text-sm text-destructive" role="alert" data-testid="add-deck-clash">
              {t("add.github.deckClash", { deckId: check.deckId ?? "" })}
            </p>
          )}
          {exists ? (
            <>
              <p className="text-sm" data-testid="add-pack-exists">
                {t("add.github.exists", { fileName })}
              </p>
              <CopyButton key={yaml} t={t} text={puzzleEntries(yaml)} label={t("add.copy.puzzle")} testId="add-copy-puzzle" />
              <LinkButton href={editFileUrl(repo, fileName)} testId="add-github-edit">
                {t("add.github.edit", { fileName })}
              </LinkButton>
            </>
          ) : prefilled ? (
            <>
              <p className="text-sm text-muted-foreground">{t("add.github.newBody", { fileName })}</p>
              {!deckClash && (
                <LinkButton href={prefilled} testId="add-github-link" primary>
                  {t("add.github.new")}
                </LinkButton>
              )}
              <CopyButton key={yaml} t={t} text={yaml} label={t("add.copy.yaml")} testId="add-copy-yaml" />
            </>
          ) : (
            <>
              <p className="text-sm" data-testid="add-too-long">
                {t("add.github.tooLong")}
              </p>
              <CopyButton key={yaml} t={t} text={yaml} label={t("add.copy.yaml")} testId="add-copy-yaml" />
              {!deckClash && (
                <LinkButton href={emptyNewFileUrl(repo, fileName)} testId="add-github-link">
                  {t("add.github.openEmpty")}
                </LinkButton>
              )}
            </>
          )}
        </Panel>
      )}

      <Button variant="ghost" className="w-full rounded-full gap-2" onClick={onStartOver} data-testid="add-start-over">
        <RotateCcw className="h-4 w-4" />
        {t("add.startOver")}
      </Button>
    </>
  );
}

function LinkButton({ href, children, testId, primary }: { href: string; children: React.ReactNode; testId: string; primary?: boolean }) {
  return (
    <Button asChild variant={primary ? "default" : "outline"} className="w-full rounded-full h-12 gap-2">
      <a href={href} target="_blank" rel="noopener noreferrer" data-testid={testId}>
        <ExternalLink className="h-4 w-4" />
        {children}
      </a>
    </Button>
  );
}

function CopyButton({ t, text, label, testId }: { t: TranslateFn; text: string; label: string; testId: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("failed");
    }
  };
  return (
    <div className="space-y-1">
      <Button variant="outline" className="w-full rounded-full gap-2" onClick={copy} data-testid={testId}>
        <Copy className="h-4 w-4" />
        {state === "done" ? t("add.copy.done") : label}
      </Button>
      {state === "failed" && (
        <p className="text-xs text-destructive" role="alert">
          {t("add.copy.failed")}
        </p>
      )}
    </div>
  );
}
