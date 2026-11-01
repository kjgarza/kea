/**
 * Build-time feature switches.
 *
 * AI-assisted play (AI keeper, solo, theory grading, case investigator and
 * answer judge) is deferred to a later release: the controls stay visible but
 * disabled, with a "coming later" hint. Set `NEXT_PUBLIC_KEA_AI_PLAY=1` at
 * build time to turn it back on. AI authoring (photo quick-add) is not
 * affected; it only needs the Worker URL.
 */
export function isAiPlayEnabled(): boolean {
  return process.env.NEXT_PUBLIC_KEA_AI_PLAY === "1";
}
