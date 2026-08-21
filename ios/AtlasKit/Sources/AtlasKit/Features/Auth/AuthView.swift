import SwiftUI

/// Screens 1–4 — Entrar, Criar conta, Confirme seu e-mail, Link expirado.
/// The design draws them as four states of one screen, so they are one file:
/// same kicker, same title slot, same centred column.
public struct AuthView: View {
    @Environment(AtlasStore.self) private var store
    @State private var model: AuthViewModel?
    private let notice: String

    public init(notice: String = "") { self.notice = notice }

    public var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .background(Palette.paper)
        .task { if model == nil { model = AuthViewModel(store: store, notice: notice) } }
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
    }

    // MARK: - The form (screens 1, 2, 4)

    private func form(_ model: AuthViewModel) -> some View {
        @Bindable var model = model
        return VStack(spacing: 12) {
            AuthField(placeholder: "voce@exemplo.com", text: $model.email)
                .autocorrectionDisabled()
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)

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
            .onSubmit { Task { await model.submit() } }

            CTAButton(model.actionTitle, hero: true) { Task { await model.submit() } }
                .disabled(model.isWorking)
                .opacity(model.isWorking ? 0.7 : 1)

            Button { model.toggleMode() } label: {
                (Text(model.switchPrompt).foregroundStyle(Palette.inkMuted)
                 + Text(model.switchAction).foregroundStyle(Palette.accent).underline().bold())
                    .font(.atlas(.sans, 14))
                    .frame(maxWidth: .infinity, minHeight: Metrics.tap)
            }
            .pressable()
        }
        .padding(.top, 32)
    }

    // MARK: - Screen 3

    private func confirmation(_ model: AuthViewModel) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Confirme seu e-mail").font(.atlas(.sans, 15, weight: .semibold))
            Text(model.confirmationLine).font(.atlas(.sans, 15))
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
