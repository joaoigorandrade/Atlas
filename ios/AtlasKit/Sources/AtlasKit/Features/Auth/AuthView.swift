import SwiftUI

/// Screens 1–4 — Entrar, Criar conta, Confirme seu e-mail, Link expirado.
/// The design draws them as four states of one screen, so they are one file:
/// same kicker, same title slot, same centred column.
public struct AuthView: View {
    @Environment(AtlasStore.self) private var store
    @State private var model: AuthViewModel?
    @FocusState private var focus: Field?
    private let notice: String

    private enum Field { case email, password }

    public init(notice: String = "") { self.notice = notice }

    public var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .background(Palette.paper)
        .dismissesKeyboardOnTap()
        .task { if model == nil { model = AuthViewModel(store: store, notice: notice) } }
        // A link can come back while this screen is already on screen, and the
        // `model == nil` guard above would swallow the sentence it arrived with.
        .onChange(of: notice) { _, sentence in model?.arrive(sentence) }
    }

    private func content(_ model: AuthViewModel) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kicker("Atlas · aprenda qualquer coisa, a fundo", size: 11)
                Text(model.title)
                    .font(.atlas(.serif, 34, weight: .medium))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 16)
                Text(model.blurb)
                    .font(.atlas(.sans, 14.5))
                    .foregroundStyle(Palette.inkMuted)
                    .padding(.top, 12)

                if model.isConfirming {
                    confirmation(model).transition(.opacity.combined(with: .move(edge: .bottom)))
                } else {
                    form(model).transition(.opacity)
                }

                if model.showsMessage {
                    Text(verbatim: model.message)
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
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .padding(.horizontal, Metrics.gutter)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        // Entrar ⇄ Criar conta is one screen changing its mind, and the failure
        // sentence lands under the form rather than replacing it.
        .animation(Motion.standard, value: model.mode)
        .animation(Motion.standard, value: model.status)
        .animation(Motion.standard, value: model.message)
        // The sentence lands below the form with no focus change, so VoiceOver
        // would otherwise report nothing at all after a failed Entrar.
        .onChange(of: model.message) { _, sentence in
            guard !sentence.isEmpty else { return }
            AccessibilityNotification.Announcement(sentence).post()
        }
    }

    // MARK: - The form (screens 1, 2, 4)

    private func form(_ model: AuthViewModel) -> some View {
        @Bindable var model = model
        return VStack(spacing: 12) {
            AuthField(placeholder: "voce@exemplo.com", text: $model.email)
                .autocorrectionDisabled()
                // `.username`, not `.emailAddress`: it is what pairs the field
                // with the password below for iCloud Keychain autofill.
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .focused($focus, equals: .email)
                .submitLabel(.next)
                .onSubmit { focus = .password }

            AuthField(placeholder: "Senha", text: $model.password, secure: !model.revealPassword) {
                Button {
                    model.revealPassword.toggle()
                } label: {
                    Image(systemName: model.revealPassword ? "eye.slash" : "eye")
                        .foregroundStyle(Palette.inkGhost)
                        .frame(width: Metrics.tap, height: Metrics.tap)
                        .contentTransition(.symbolEffect(.replace))
                }
                .pressable()
                .accessibilityLabel(model.revealPassword ? "Ocultar senha" : "Mostrar senha")
            }
            // New account: let iOS offer a strong password instead of filling
            // the saved one.
            .textContentType(model.mode == .signUp ? .newPassword : .password)
            .focused($focus, equals: .password)
            .submitLabel(.go)
            .onSubmit { Task { await model.submit() } }

            CTAButton(model.actionTitle, hero: true) { Task { await model.submit() } }
                .opacity(model.isWorking ? 0.7 : 1)

            Button { model.toggleMode() } label: {
                switchLine(model)
                    .font(.atlas(.sans, 14))
                    .frame(maxWidth: .infinity, minHeight: Metrics.tap)
            }
            .pressable()
        }
        // Nothing in the form is editable while the request is in flight, not
        // just the button.
        .disabled(model.isWorking)
        .padding(.top, 32)
    }

    /// One catalogue sentence with the action interpolated into it — never two
    /// entries spliced, which fixes the word order in Portuguese (ios/AGENTS.md).
    private func switchLine(_ model: AuthViewModel) -> Text {
        let action = Text(model.switchAction)
            .foregroundStyle(Palette.accent).underline().bold()
        return model.mode == .signIn
            ? Text("Novo no Atlas? \(action)").foregroundStyle(Palette.inkMuted)
            : Text("Já tem uma conta? \(action)").foregroundStyle(Palette.inkMuted)
    }

    // MARK: - Screen 3

    private func confirmation(_ model: AuthViewModel) -> some View {
        VStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Confirme seu e-mail").font(.atlas(.sans, 15, weight: .semibold))
                // One catalogue sentence with the address interpolated into it;
                // the address itself is set in the serif so it reads as the
                // datum it is and a typo in it is visible.
                Text("Enviamos um link de confirmação para \(Text(verbatim: model.confirmingAddress).font(.atlas(.serif, 16))). Abra-o para ativar sua conta e depois volte para entrar.")
                    .font(.atlas(.sans, 15))
            }
            .foregroundStyle(Palette.accent)
            .padding(.horizontal, 20).padding(.vertical, 22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.successBg, in: .rect(cornerRadius: 13))
            .overlay {
                RoundedRectangle(cornerRadius: 13).strokeBorder(Palette.accent.opacity(0.22), lineWidth: 1)
            }

            // Without these two the screen is a trap: the form is not drawn, so
            // nothing else on it can put the learner back on it.
            GhostButton(model.resending ? "Reenviando…" : "Reenviar link") {
                Task { await model.resend() }
            }
            .disabled(model.resending)
            GhostButton("Já confirmei — entrar") { model.backToForm() }
        }
        .padding(.top, 32)
    }
}

/// The design's field: a shadowed card holding one serif 20pt line, 52pt tall.
private struct AuthField<Accessory: View>: View {
    let placeholder: LocalizedStringKey
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
    init(placeholder: LocalizedStringKey, text: Binding<String>, secure: Bool = false) {
        self.init(placeholder: placeholder, text: text, secure: secure) { EmptyView() }
    }
}
