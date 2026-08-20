import Observation
import SwiftUI

/// Screens 1–4 as one state machine: which form is showing, what is in it, and
/// what the server said. Errors and confirmations are sentences the view puts
/// *below* the form — never an alert, and never the server's English.
@Observable
@MainActor
final class AuthViewModel {
    enum Mode { case signIn, signUp }
    enum Status { case idle, working, sent }

    private(set) var mode: Mode = .signIn
    private(set) var status: Status = .idle
    private(set) var message: String
    var email = ""
    var password = ""
    var revealPassword = false

    private let store: AtlasStore

    /// `notice` is the sentence the app arrived with — a spent confirmation
    /// link, from `/login?error=` on the web. Screen 4 is this screen carrying one.
    init(store: AtlasStore, notice: String = "") {
        self.store = store
        message = notice
    }

    var title: String { mode == .signIn ? "Entre no seu mapa" : "Crie sua conta" }

    var blurb: String {
        "Seu mapa, sequência e progresso ficam na sua conta"
            + (mode == .signIn ? " — entre com seu e-mail e senha." : " — escolha um e-mail e senha para começar.")
    }

    var actionTitle: String {
        switch (status, mode) {
        case (.working, .signIn): "Entrando…"
        case (.working, .signUp): "Criando conta…"
        case (_, .signIn): "Entrar →"
        case (_, .signUp): "Criar conta →"
        }
    }

    var switchPrompt: String { mode == .signIn ? "Novo no Atlas? " : "Já tem uma conta? " }
    var switchAction: String { mode == .signIn ? "Criar uma conta" : "Entrar" }
    var isWorking: Bool { status == .working }
    var isConfirming: Bool { status == .sent }
    var showsMessage: Bool { !message.isEmpty && status != .sent }
    var confirmationLine: String {
        "Enviamos um link de confirmação para \(email.trimmed). Abra-o para ativar sua conta e depois volte para entrar."
    }

    func toggleMode() {
        mode = mode == .signIn ? .signUp : .signIn
        // Switching modes clears the arrival notice on purpose.
        message = ""
    }

    func submit() async {
        let address = email.trimmed
        guard address.contains("@") else { return fail("Digite o e-mail da sua conta.") }
        guard password.count >= 6 else { return fail("A senha precisa ter pelo menos 6 caracteres.") }

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
