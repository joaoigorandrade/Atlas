import SwiftUI

/// "Configurações" — the four things the learner can change about the journey,
/// and their data. Pushed from the profile; the tab bar stays behind it.
struct SettingsView: View {
    @Environment(AtlasStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingDelete = false
    @State private var message = ""

    var body: some View {
        @Bindable var store = store
        return VStack(spacing: 0) {
            TopBar {
                HStack(spacing: 10) {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17, weight: .medium))
                            .foregroundStyle(Palette.inkMuted)
                            .frame(width: Metrics.tap, height: Metrics.tap)
                    }
                    .accessibilityLabel("Voltar")
                    Kicker("Configurações", size: 10.5)
                }
                .padding(.leading, -12)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    Text("Ajuste a jornada").font(.atlas(.serif, 30)).foregroundStyle(Palette.ink)

                    field("Objetivo", "orienta o que priorizamos") {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 9), GridItem(.flexible(), spacing: 9)], spacing: 9) {
                            ForEach(GoalKind.allCases, id: \.self) { goal in
                                choice(goal.label, on: store.goal == goal) { store.goal = goal }
                            }
                        }
                    }

                    field("Meta diária", "unidade de sequência") {
                        HStack(spacing: 9) {
                            ForEach(dailyTargets, id: \.self) { minutes in
                                choice("\(minutes) min", on: store.dailyTarget == minutes) { store.dailyTarget = minutes }
                            }
                        }
                    }

                    field("Idioma", "conteúdo gerado") {
                        HStack(spacing: 9) {
                            ForEach(AtlasAPI.languages, id: \.self) { code in
                                choice(code == "pt-BR" ? "Português" : "English", on: store.language == code) {
                                    store.language = code
                                }
                            }
                        }
                    }

                    field("Voz", "fale em vez de digitar") {
                        VStack(spacing: 0) {
                            toggle("Ditado", "microfone em toda caixa de resposta", $store.dictationOn)
                            Divider().overlay(Palette.hairline)
                            toggle("Leitura em voz alta", "as seções do Consume podem ser ouvidas", $store.readAloudOn)
                        }
                        .background(Palette.card, in: .rect(cornerRadius: 14))
                        .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                    }

                    data
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 24)
                .padding(.bottom, 30)
            }
        }
        .background(Palette.paper)
        .navigationBarBackButtonHidden()
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .alert("Apagar minha conta?", isPresented: $confirmingDelete) {
            Button("Cancelar", role: .cancel) {}
            Button("Apagar tudo", role: .destructive) { delete() }
        } message: {
            Text("Seu mapa, seu progresso e seus cartões são apagados do servidor. Não dá para desfazer.")
        }
    }

    // MARK: - Your data

    private var data: some View {
        VStack(alignment: .leading, spacing: 9) {
            Kicker("Seus dados").padding(.bottom, 3)
            ShareLink(item: exportedMap) { ghostLabel("Exportar mapa (JSON)") }
            ShareLink(item: exportedCards) { ghostLabel("Exportar cartões (CSV)") }
            Button { confirmingDelete = true } label: {
                Text("Apagar minha conta")
                    .font(.atlas(.sans, 13.5, weight: .semibold))
                    .foregroundStyle(Palette.dangerInk)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Palette.dangerBg, in: .rect(cornerRadius: 12))
                    .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.dangerInk.opacity(0.3), lineWidth: 1) }
            }
            if !message.isEmpty {
                Text(message).font(.atlas(.sans, 13)).foregroundStyle(Palette.dangerInk)
            }
        }
        .padding(.top, 20)
        .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
    }

    /// The map as it is stored, states included — the same JSON the web app
    /// exports, so a run moves between the two.
    private var exportedMap: String {
        struct Export: Encodable { let topic: String; let graph: ConceptGraph; let states: StateMap }
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let data = try? encoder.encode(Export(topic: store.subject, graph: store.graph, states: store.states))
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    /// Front, back, node, due — a deck any spaced-repetition app can read.
    /// A quoted field with a quote in it doubles it, which is the whole of CSV.
    private var exportedCards: String {
        func cell(_ text: String) -> String { "\"\(text.replacingOccurrences(of: "\"", with: "\"\""))\"" }
        let rows = store.cards.map { scheduled in
            [
                cell(scheduled.card.front ?? (scheduled.card.cloze ?? []).joined(separator: " ______ ")),
                cell(scheduled.card.back),
                cell(scheduled.card.node),
                cell(scheduled.due.formatted(.iso8601)),
            ].joined(separator: ",")
        }
        return (["frente,verso,no,vencimento"] + rows).joined(separator: "\n")
    }

    private func delete() {
        Task {
            do {
                try await store.api.deleteAccount()
                store.signOut()
            } catch {
                message = Onboarding.copy(for: error, doing: "apagar sua conta")
            }
        }
    }

    // MARK: - The pieces the design repeats

    private func field<Content: View>(_ title: String, _ note: String,
                                      @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 5) {
                Text(title).font(.atlas(.sans, 14)).foregroundStyle(Palette.inkSoft)
                Text("— \(note)").font(.atlas(.sans, 14)).foregroundStyle(Palette.inkGhost)
            }
            content()
        }
    }

    private func choice(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.atlas(.sans, 14, weight: on ? .semibold : .regular))
                .foregroundStyle(on ? Palette.accent : Palette.inkSoft)
                .frame(maxWidth: .infinity, minHeight: 48)
        }
        .background(on ? Palette.accentBg : Palette.card, in: .rect(cornerRadius: 11))
        .overlay {
            RoundedRectangle(cornerRadius: 11)
                .strokeBorder(on ? Palette.accent : Palette.hairlineStrong, lineWidth: 1)
        }
    }

    private func toggle(_ title: String, _ note: String, _ value: Binding<Bool>) -> some View {
        Toggle(isOn: value) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.atlas(.sans, 14.5)).foregroundStyle(Palette.ink)
                Text(note).font(.atlas(.sans, 12.5)).foregroundStyle(Palette.inkFaint)
            }
        }
        .tint(Palette.accent)
        .padding(.horizontal, 16)
        .frame(minHeight: 60)
    }

    private func ghostLabel(_ title: String) -> some View {
        Text(title)
            .font(.atlas(.sans, 13.5))
            .foregroundStyle(Palette.inkSoft)
            .frame(maxWidth: .infinity, minHeight: 48)
            .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }
}
