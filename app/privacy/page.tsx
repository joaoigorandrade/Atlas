// Privacy & data page (#33). Static, reachable signed-out (see middleware).
// Plain-language account of what Atlas stores and how to remove it.

"use client";

import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    backToAtlas: "← Atlas",
    kicker: "Privacy & data",
    title: "What Atlas keeps, and how to take it back",
    intro:
      "Atlas stores only what it needs to run your learning loop across sessions. No advertising, no data sales, no third-party trackers.",
    whatWeStore: "What we store",
    accountLabel: "Your account.",
    accountBody:
      "Your email address and a password, used only to sign you in. The password is stored hashed by our auth provider — never in plain text, never seen by us.",
    runStateLabel: "Your run state.",
    runStateBody:
      "Your concept map, mastery states, review cards and their schedule, streak, and settings — one record keyed to your account. This is what survives a refresh.",
    generationLogLabel: "Generation log.",
    generationLogBody:
      "A per-call record (which kind of content, when) used to enforce fair-use limits. It holds no learning content.",
    thirdParties: "What we send to third parties",
    thirdPartiesBody:
      "Learning content is written by a language model reached through OpenRouter. Your topic and interests are part of those prompts; your email and account are never sent. Hosting and the database are provided by Vercel and Supabase.",
    deletingData: "Deleting your data",
    deletingDataPre: "Open ",
    deletingDataStrong: "Settings → Account → Delete account & all data",
    deletingDataPost:
      ". That removes your run state and generation log immediately, and your account with them. It cannot be undone.",
    questions: "Questions about your data? Reach out to the account you signed up with.",
  },
  "pt-BR": {
    backToAtlas: "← Atlas",
    kicker: "Privacidade e dados",
    title: "O que o Atlas guarda, e como recuperar",
    intro:
      "O Atlas armazena apenas o necessário para rodar seu ciclo de aprendizado entre sessões. Sem publicidade, sem venda de dados, sem rastreadores de terceiros.",
    whatWeStore: "O que armazenamos",
    accountLabel: "Sua conta.",
    accountBody:
      "Seu endereço de e-mail e uma senha, usados apenas para o login. A senha é armazenada com hash pelo nosso provedor de autenticação — nunca em texto puro, nunca vista por nós.",
    runStateLabel: "O estado da sua jornada.",
    runStateBody:
      "Seu mapa de conceitos, estados de domínio, cartões de revisão e seu cronograma, sequência e configurações — um único registro vinculado à sua conta. É isso que sobrevive a um recarregamento.",
    generationLogLabel: "Registro de geração.",
    generationLogBody:
      "Um registro por chamada (que tipo de conteúdo, quando) usado para aplicar limites de uso justo. Não contém conteúdo de aprendizado.",
    thirdParties: "O que enviamos a terceiros",
    thirdPartiesBody:
      "O conteúdo de aprendizado é escrito por um modelo de linguagem acessado via OpenRouter. Seu tema e interesses fazem parte desses prompts; seu e-mail e conta nunca são enviados. A hospedagem e o banco de dados são fornecidos por Vercel e Supabase.",
    deletingData: "Excluindo seus dados",
    deletingDataPre: "Acesse ",
    deletingDataStrong: "Configurações → Conta → Excluir conta e todos os dados",
    deletingDataPost:
      ". Isso remove imediatamente o estado da sua jornada e o registro de geração, e sua conta junto com eles. Não pode ser desfeito.",
    questions: "Dúvidas sobre seus dados? Entre em contato pela conta com a qual você se cadastrou.",
  },
} as const;

const P: React.CSSProperties = {
  fontSize: 15.5,
  lineHeight: 1.65,
  color: color.inkSoft,
  margin: "0 0 18px",
};
const H: React.CSSProperties = {
  fontFamily: font.serif,
  fontWeight: 500,
  fontSize: 21,
  margin: "34px 0 12px",
  color: color.ink,
};

export default function PrivacyPage() {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        minHeight: "100vh",
        background: color.paper,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <main style={{ width: "100%", maxWidth: 640, padding: "64px 28px 96px" }}>
        <a href="/" style={{ fontSize: 13.5, color: color.inkMuted }}>
          {t.backToAtlas}
        </a>
        <div style={{ ...kicker(11, "0.2em"), margin: "28px 0 14px" }}>
          {t.kicker}
        </div>
        <h1
          style={{
            fontFamily: font.serif,
            fontWeight: 500,
            fontSize: 34,
            lineHeight: 1.1,
            margin: "0 0 28px",
          }}
        >
          {t.title}
        </h1>

        <p style={P}>{t.intro}</p>

        <h2 style={H}>{t.whatWeStore}</h2>
        <p style={P}>
          <strong>{t.accountLabel}</strong> {t.accountBody}
        </p>
        <p style={P}>
          <strong>{t.runStateLabel}</strong> {t.runStateBody}
        </p>
        <p style={P}>
          <strong>{t.generationLogLabel}</strong> {t.generationLogBody}
        </p>

        <h2 style={H}>{t.thirdParties}</h2>
        <p style={P}>{t.thirdPartiesBody}</p>

        <h2 style={H}>{t.deletingData}</h2>
        <p style={P}>
          {t.deletingDataPre}
          <strong>{t.deletingDataStrong}</strong>
          {t.deletingDataPost}
        </p>

        <p style={{ ...P, marginTop: 34, color: color.inkGhost, fontSize: 13.5 }}>
          {t.questions}
        </p>
      </main>
    </div>
  );
}
