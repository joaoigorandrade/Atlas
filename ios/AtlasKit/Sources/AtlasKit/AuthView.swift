import SwiftUI

/// Screens 1–4 — Entrar, Criar conta, Confirme seu e-mail, Link expirado.
/// The design draws them as four states of one screen, so they are one file:
/// same kicker, same title slot, same centred column. Errors and confirmations
/// sit *below* the form, never in an alert.
public struct AuthView: View {
    @Environment(AtlasStore.self) private var store

    private enum Mode { case signIn, signUp }
    private enum Status { case idle, working, sent }

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var revealPassword = false
    @State private var status: Status = .idle
    @State private var message: String

    /// The sentence the app arrived with — a spent confirmation link, from
    /// `/login?error=` on the web. Screen 4 is this screen carrying one.
    public init(notice: String = "") {
        _message = State(initialValue: notice)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kicker("Atlas · aprenda qualquer coisa, a fundo", size: 11)
                Text(mode == .signIn ? "Entre no seu mapa" : "Crie sua conta")
                    .font(.atlas(.serif, 34, weight: .medium))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 16)
                Text("Seu mapa, sequência e progresso ficam na sua conta"
                     + (mode == .signIn ? " — entre com seu e-mail e senha."
                                        : " — escolha um e-mail e senha para começar."))
                    .font(.atlas(.sans, 14.5))
                    .foregroundStyle(Palette.inkMuted)
                    .padding(.top, 12)

                if status == .sent { confirmation } else { form }

                if !message.isEmpty, status != .sent {
                    Text(message)
                        .font(.atlas(.sans, 13.5))
                        .foregroundStyle(Palette.amberInk)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.amberBg, in: .rect(cornerRadius: 10))
                        .overlay {
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(Palette.amberInk.opacity(0.2), lineWidth: 1)
                        }
                        .padding(.top, 16)
                }
            }
            .padding(.horizontal, Metrics.gutter)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Palette.paper)
    }

    // MARK: - The form (screens 1, 2, 4)

    @ViewBuilder
    private var form: some View {
        VStack(spacing: 12) {
            emailField

            AuthField(placeholder: "Senha", text: $password, secure: !revealPassword) {
                Button {
                    revealPassword.toggle()
                } label: {
                    Image(systemName: revealPassword ? "eye.slash" : "eye")
                        .foregroundStyle(Palette.inkGhost)
                        .frame(width: Metrics.tap, height: Metrics.tap)
                }
                .accessibilityLabel(revealPassword ? "Ocultar senha" : "Mostrar senha")
            }
            .onSubmit(submit)

            CTAButton(
                status == .working
                    ? (mode == .signIn ? "Entrando…" : "Criando conta…")
                    : (mode == .signIn ? "Entrar →" : "Criar conta →"),
                hero: true,
                action: submit
            )
            .disabled(status == .working)
            .opacity(status == .working ? 0.7 : 1)

            Button {
                mode = mode == .signIn ? .signUp : .signIn
                // Switching modes clears the arrival notice on purpose.
                message = ""
            } label: {
                (Text(mode == .signIn ? "Novo no Atlas? " : "Já tem uma conta? ")
                    .foregroundStyle(Palette.inkMuted)
                 + Text(mode == .signIn ? "Criar uma conta" : "Entrar")
                    .foregroundStyle(Palette.accent).underline().bold())
                    .font(.atlas(.sans, 14))
                    .frame(maxWidth: .infinity, minHeight: Metrics.tap)
            }
        }
        .padding(.top, 32)
    }

    /// Split out only because the keyboard modifiers below are iOS-only and the
    /// package also builds for the host, where `swift test` runs.
    private var emailField: some View {
        let field = AuthField(placeholder: "voce@exemplo.com", text: $email)
            .autocorrectionDisabled()
        #if os(iOS)
        return field
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
        #else
        return field
        #endif
    }

    // MARK: - Screen 3

    private var confirmation: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Confirme seu e-mail").font(.atlas(.sans, 15, weight: .semibold))
            Text("Enviamos um link de confirmação para \(email.trimmed). Abra-o para ativar sua conta e depois volte para entrar.")
                .font(.atlas(.sans, 15))
        }
        .foregroundStyle(Palette.accent)
        .padding(.horizontal, 20).padding(.vertical, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.successBg, in: .rect(cornerRadius: 13))
        .overlay {
            RoundedRectangle(cornerRadius: 13).strokeBorder(Palette.accent.opacity(0.22), lineWidth: 1)
        }
        .padding(.top, 32)
    }

    // MARK: - Submit

    private func submit() {
        let address = email.trimmed
        guard address.contains("@") else { return fail("Digite o e-mail da sua conta.") }
        guard password.count >= 6 else { return fail("A senha precisa ter pelo menos 6 caracteres.") }

        status = .working
        message = ""
        Task {
            do {
                if mode == .signIn {
                    try await store.signIn(email: address, password: password)
                } else if try await store.signUp(email: address, password: password) == false {
                    status = .sent
                    return
                }
                // Signed in: RootView swaps this screen for the shell.
                status = .idle
            } catch {
                fail(sentence(for: error))
            }
        }
    }

    private func fail(_ text: String) {
        status = .idle
        message = text
    }

    /// The learner reads the code, never the server's `message` (ios/AGENTS.md).
    private func sentence(for error: Error) -> String {
        switch (error as? AtlasError)?.code {
        case "invalid_credentials", "auth": "E-mail ou senha incorretos."
        case "email_not_confirmed": "Confirme seu e-mail pelo link que enviamos e tente de novo."
        case "user_already_exists": "Já existe uma conta com esse e-mail — entre por ela."
        case "weak_password": "A senha precisa ter pelo menos 6 caracteres."
        case "validation_failed", "request": "Confira o e-mail e a senha e tente de novo."
        case "over_email_send_rate_limit", "over_request_rate_limit", "rate_limit":
            "Tentativas demais por agora. Espere um minuto e tente de novo."
        default: "Não conseguimos falar com o servidor agora. Tente de novo."
        }
    }
}

/// The design's field: a shadowed card holding one serif 20pt line, 52pt tall.
private struct AuthField<Accessory: View>: View {
    let placeholder: String
    @Binding var text: String
    var secure: Bool = false
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if secure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .font(.atlas(.serif, 20))
            .foregroundStyle(Palette.ink)
            .frame(minHeight: Metrics.cta)
            accessory()
        }
        .padding(.horizontal, 16)
        .padding(6)
        .background(Palette.card, in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.hairlineStrong, lineWidth: 1)
        }
        .shadow(color: Palette.ink.opacity(0.05), radius: 9, y: 4)
    }
}

extension AuthField where Accessory == EmptyView {
    init(placeholder: String, text: Binding<String>, secure: Bool = false) {
        self.init(placeholder: placeholder, text: text, secure: secure) { EmptyView() }
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
