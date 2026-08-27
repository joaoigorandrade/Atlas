import Observation
import SwiftUI

/// Screens 1–4 as one state machine: which form is showing, what is in it, and
/// what the server said. Errors and confirmations are sentences the view puts
/// *below* the form — never an alert, and never the server's English.
@Observable
@MainActor
final class AuthViewModel {
    enum Mode: Equatable { case signIn, signUp }
    enum Status: Equatable { case idle, working, sent }

    private(set) var mode: Mode = .signIn
    private(set) var status: Status = .idle
    private(set) var message: String
    var email = ""
    var password = ""
    var revealPassword = false
    private(set) var resending = false

    private let store: AtlasStore

    /// `notice` is the sentence the app arrived with — a spent confirmation
    /// link, from `/login?error=` on the web. Screen 4 is this screen carrying one.
    init(store: AtlasStore, notice: String = "") {
        self.store = store
        message = notice
    }

    var title: LocalizedStringKey { mode == .signIn ? "Entre no seu mapa" : "Crie sua conta" }

    /// Two whole sentences, never one built from halves: a clause spliced onto
    /// a stem translates as neither language's grammar.
    var blurb: LocalizedStringKey {
        mode == .signIn
            ? "Seu mapa, sequência e progresso ficam na sua conta — entre com seu e-mail e senha."
            : "Seu mapa, sequência e progresso ficam na sua conta — escolha um e-mail e senha para começar."
    }

    var actionTitle: LocalizedStringKey {
        switch (status, mode) {
        case (.working, .signIn): "Entrando…"
        case (.working, .signUp): "Criando conta…"
        case (_, .signIn): "Entrar →"
        case (_, .signUp): "Criar conta →"
        }
    }

    /// Only the action half: the view interpolates it into one whole sentence
    /// (`AuthView.form`) rather than concatenating two catalogue entries.
    var switchAction: LocalizedStringKey { mode == .signIn ? "Criar uma conta" : "Entrar" }
    var isWorking: Bool { status == .working }
    var isConfirming: Bool { status == .sent }
    var showsMessage: Bool { !message.isEmpty }
    /// The address the link went to, shown as data so the learner can proof-read
    /// it — "the email never arrived" is usually a typo they can see.
    var confirmingAddress: String { email.trimmed }

    /// A notice can arrive *after* this screen was built — the app was already
    /// open on it when the link came back. It replaces whatever was showing.
    func arrive(_ notice: String) {
        guard !notice.isEmpty else { return }
        status = .idle
        message = notice
    }

    /// Screen 3 tells the learner to come back and sign in, so it has to have a
    /// way back to the form. Without this the screen is a dead end.
    func backToForm() {
        status = .idle
        mode = .signIn
        password = ""
        message = ""
    }

    /// "O link nunca chegou." Same address, one more email.
    func resend() async {
        guard !resending else { return }
        resending = true
        defer { resending = false }
        do {
            try await store.resendConfirmation(email: confirmingAddress)
            message = String(localized: "Enviamos outro link para esse e-mail.")
        } catch {
            message = sentence(for: error)
        }
    }

    func toggleMode() {
        mode = mode == .signIn ? .signUp : .signIn
        // Switching modes clears the arrival notice on purpose.
        message = ""
    }

    func submit() async {
        // Return on the password field fires this too, and it is not disabled
        // while the CTA is.
        guard status != .working else { return }
        let address = email.trimmed
        guard address.contains("@") else { return fail(String(localized: "Digite o e-mail da sua conta.")) }
        guard password.count >= 6 else { return fail(String(localized: "A senha precisa ter pelo menos 6 caracteres.")) }

        status = .working
        message = ""
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

    private func fail(_ text: String) {
        status = .idle
        message = text
    }

    /// The learner reads the code, never the server's `message` (ios/AGENTS.md).
    private func sentence(for error: Error) -> String {
        switch (error as? AtlasError)?.code {
        case "invalid_credentials", "auth": String(localized: "E-mail ou senha incorretos.")
        case "email_not_confirmed": String(localized: "Confirme seu e-mail pelo link que enviamos e tente de novo.")
        case "user_already_exists": String(localized: "Já existe uma conta com esse e-mail — entre por ela.")
        case "weak_password": String(localized: "A senha precisa ter pelo menos 6 caracteres.")
        case "validation_failed", "request": String(localized: "Confira o e-mail e a senha e tente de novo.")
        case "offline": String(localized: "Você está sem conexão. Verifique e tente de novo.")
        case "over_email_send_rate_limit", "over_request_rate_limit", "rate_limit":
            String(localized: "Tentativas demais por agora. Espere um minuto e tente de novo.")
        default: String(localized: "Não conseguimos falar com o servidor agora. Tente de novo.")
        }
    }
}
