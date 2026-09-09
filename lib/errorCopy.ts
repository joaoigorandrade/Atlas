// What a failure sounds like, in the learner's language.
//
// `lib/errors.ts` decides *what* went wrong; this decides what to say about it.
// The split matters: an `AtlasError`'s own `message` is upstream prose — an
// OpenRouter body, a PostgREST complaint, `generation failed (502)` — and none
// of it belongs on screen. It goes to the log line next to the request id; the
// learner reads one of the sentences below.
//
// Same co-located `STRINGS = { en, "pt-BR" }` shape every other surface uses, so
// components read it through `useT` and `AtlasApp`'s callbacks read it through
// `ERROR_STRINGS[languageRef.current]`.

import type { ErrorCode } from "@/lib/errors";
import type { Language } from "@/lib/i18n";

/**
 * Which operation failed. The code says *why* and becomes the message; the
 * context says *what* and becomes the kicker above it — which is exactly how
 * the toast was already composed, so "Generation failed / the model didn't
 * answer this time" reads as one thought.
 */
/**
 * The sub-cases worth naming. A code says an upload was `invalid`; only the
 * reason can say *why*, and "that PDF is a scan with no text in it" is a
 * genuinely different instruction from "that file is too big". Set by the
 * server (`AtlasError.reason`, on the wire as `reason`), never by prose.
 */
export type ErrorReason =
  "no_file" | "file_too_big" | "unsupported_type" | "no_text" | "unreadable";

export type ErrorContext =
  | "build"
  | "content"
  | "judge"
  | "upload"
  | "placement"
  | "save"
  | "load"
  | "maps"
  | "openMap"
  | "exclude"
  | "account"
  | "crash";

export const ERROR_STRINGS = {
  en: {
    code: {
      offline: "You're offline — nothing was lost. This picks up the moment you're back.",
      auth: "Your session expired. Sign in again to pick up where you left off.",
      rate_limit: "Too many requests at once — give it a few seconds and try again.",
      timeout:
        "That took too long to come back. Try again — it usually lands on the second pass.",
      upstream: "The model didn't answer this time. Nothing is lost — try again.",
      invalid: "That didn't go through. Adjust it and try again.",
      notfound: "That isn't here any more.",
      // Never rendered — a declined warm is swallowed by the queue — but the
      // table stays total so a missing key can't become an empty toast.
      declined: "Skipped in the background.",
      unknown: "Something went wrong on our side. Try again in a moment.",
    } satisfies Record<ErrorCode, string>,
    context: {
      build: "Couldn't build the map",
      content: "Generation failed",
      judge: "Couldn't read that answer",
      upload: "Couldn't read that file",
      placement: "Placement skipped",
      save: "Progress not saved",
      load: "Couldn't load your progress",
      maps: "Couldn't load your maps",
      openMap: "Couldn't open that map",
      exclude: "Couldn't exclude",
      account: "Couldn't delete right now",
      crash: "This screen hit a snag",
    } satisfies Record<ErrorContext, string>,
    reason: {
      no_file: "No file came through — pick one and try again.",
      file_too_big:
        "That file is over 10 MB — trim it to the outline pages and try again.",
      unsupported_type:
        "PDF or plain text only — or just paste the outline as your topic.",
      no_text:
        "No text in that file — a scanned PDF is just pictures. The typed topic still works.",
      unreadable: "Couldn't read that file — the typed topic still works.",
    } satisfies Record<ErrorReason, string>,
    retry: "Try again",
    dismiss: "Dismiss",
    signIn: "Sign in again",
    backToMap: "Back to the map",
    reload: "Reload",
    offlineBanner:
      "You're offline — your progress is safe here until the connection returns.",
    notSaved: "Progress not saved · retrying",
    crashBody:
      "Your map and everything you've learned are untouched — only this screen stopped.",
    notFoundKicker: "Nothing here",
    notFoundTitle: "This page isn't part of the map.",
    notFoundBody:
      "The link may be old, or the topic may have been excluded since it was written.",
    backHome: "Back to your map",
  },
  "pt-BR": {
    code: {
      offline:
        "Você está sem conexão — nada foi perdido. Retomamos assim que ela voltar.",
      auth: "Sua sessão expirou. Entre de novo para continuar de onde parou.",
      rate_limit: "Pedidos demais de uma vez — espere alguns segundos e tente de novo.",
      timeout:
        "Isso demorou demais para responder. Tente de novo — costuma dar certo na segunda.",
      upstream: "O modelo não respondeu desta vez. Nada foi perdido — tente de novo.",
      invalid: "Isso não passou. Ajuste e tente de novo.",
      notfound: "Isso não está mais aqui.",
      declined: "Ignorado em segundo plano.",
      unknown: "Algo deu errado do nosso lado. Tente de novo em um instante.",
    } satisfies Record<ErrorCode, string>,
    context: {
      build: "Não deu para montar o mapa",
      content: "Falha ao gerar",
      judge: "Não deu para avaliar essa resposta",
      upload: "Não deu para ler esse arquivo",
      placement: "Nivelamento pulado",
      save: "Progresso não salvo",
      load: "Não deu para carregar seu progresso",
      maps: "Não deu para carregar seus mapas",
      openMap: "Não deu para abrir esse mapa",
      exclude: "Não deu para excluir",
      account: "Não deu para excluir agora",
      crash: "Esta tela travou",
    } satisfies Record<ErrorContext, string>,
    reason: {
      no_file: "Nenhum arquivo chegou — escolha um e tente de novo.",
      file_too_big:
        "Esse arquivo passa de 10 MB — corte para as páginas do sumário e tente de novo.",
      unsupported_type:
        "Só PDF ou texto simples — ou cole o sumário direto como seu tópico.",
      no_text:
        "Nenhum texto nesse arquivo — um PDF escaneado é só imagem. O tópico digitado ainda funciona.",
      unreadable: "Não deu para ler esse arquivo — o tópico digitado ainda funciona.",
    } satisfies Record<ErrorReason, string>,
    retry: "Tentar de novo",
    dismiss: "Fechar",
    signIn: "Entrar de novo",
    backToMap: "Voltar ao mapa",
    reload: "Recarregar",
    offlineBanner:
      "Você está sem conexão — seu progresso fica seguro aqui até a conexão voltar.",
    notSaved: "Progresso não salvo · tentando de novo",
    crashBody: "Seu mapa e tudo o que você aprendeu estão intactos — só esta tela parou.",
    notFoundKicker: "Nada por aqui",
    notFoundTitle: "Esta página não faz parte do mapa.",
    notFoundBody:
      "O link pode estar velho, ou o tópico pode ter sido excluído desde então.",
    backHome: "Voltar ao seu mapa",
  },
} as const;

export type ErrorStrings = (typeof ERROR_STRINGS)["en"];

/** The two lines a failure gets: what failed, and why. */
export interface ErrorLines {
  kicker?: string;
  message: string;
}

/** Compose the pair for one error, in one language. Callers that already hold
 *  the strings (a component with `useT`) can index them directly; this is for
 *  the callback sites in `AtlasApp`, which hold a `Language` and not a hook. */
export function errorLines(
  language: Language,
  code: ErrorCode,
  context?: ErrorContext,
  reason?: string,
): ErrorLines {
  const strings = ERROR_STRINGS[language];
  // A reason is more specific than its code, so it wins when we have copy for
  // it. Unknown reasons fall through rather than blanking the message — the
  // server can add one before the client knows the word for it.
  const specific =
    reason && reason in strings.reason
      ? strings.reason[reason as ErrorReason]
      : undefined;
  return {
    kicker: context ? strings.context[context] : undefined,
    message: specific ?? strings.code[code],
  };
}
