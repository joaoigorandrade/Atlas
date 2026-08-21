import Navigation
import SwiftUI

/// "Configurações" — the four things the learner can change about the journey,
/// and their data. Pushed from the profile; the tab bar stays behind it.
struct SettingsView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: SettingsViewModel?

    var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .background(Palette.paper)
        .navigationBarBackButtonHidden()
        .toolbar(.hidden, for: .navigationBar)
        .task { if model == nil { model = SettingsViewModel(store: store) } }
    }

    private func content(_ model: SettingsViewModel) -> some View {
        @Bindable var store = store
        return VStack(spacing: 0) {
            TopBar {
                HStack(spacing: 10) {
                    BackButton { navigator.pop() }
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

                    field("Idioma", "conteúdo gerado, não a interface") {
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

                    data(model)
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 24)
                .padding(.bottom, 30)
            }
        }
        .alert("Apagar minha conta?", isPresented: model.isConfirmingDelete) {
            Button("Cancelar", role: .cancel) { model.cancelDelete() }
            Button("Apagar tudo", role: .destructive) { Task { await model.delete() } }
        } message: {
            Text("Seu mapa, seu progresso e seus cartões são apagados do servidor. Não dá para desfazer.")
        }
    }

    // MARK: - Your data

    private func data(_ model: SettingsViewModel) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Kicker("Seus dados").padding(.bottom, 3)
            ShareLink(item: model.exportedMap) { ghostLabel("Exportar mapa (JSON)") }
            ShareLink(item: model.exportedCards) { ghostLabel("Exportar cartões (CSV)") }
            Button { model.askToDelete() } label: {
                Text("Apagar minha conta")
                    .font(.atlas(.sans, 13.5, weight: .semibold))
                    .foregroundStyle(Palette.dangerInk)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Palette.dangerBg, in: .rect(cornerRadius: 12))
                    .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.dangerInk.opacity(0.3), lineWidth: 1) }
            }
            .pressable()
            if !model.message.isEmpty {
                Text(verbatim: model.message).font(.atlas(.sans, 13)).foregroundStyle(Palette.dangerInk)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.top, 20)
        .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
        .animation(Motion.standard, value: model.message)
    }

    // MARK: - The pieces the design repeats

    private func field<Content: View>(_ title: LocalizedStringKey, _ note: LocalizedStringKey,
                                      @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 5) {
                Text(title).font(.atlas(.sans, 14)).foregroundStyle(Palette.inkSoft)
                (Text(verbatim: "— ") + Text(note)).font(.atlas(.sans, 14)).foregroundStyle(Palette.inkGhost)
            }
            content()
        }
    }

    private func choice(_ title: LocalizedStringKey, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.atlas(.sans, 14, weight: on ? .semibold : .regular))
                .foregroundStyle(on ? Palette.accent : Palette.inkSoft)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(on ? Palette.accentBg : Palette.card, in: .rect(cornerRadius: 11))
                .overlay {
                    RoundedRectangle(cornerRadius: 11)
                        .strokeBorder(on ? Palette.accent : Palette.hairlineStrong, lineWidth: 1)
                }
        }
        .pressable()
        .animation(Motion.snap, value: on)
    }

    private func toggle(_ title: LocalizedStringKey, _ note: LocalizedStringKey, _ value: Binding<Bool>) -> some View {
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

    private func ghostLabel(_ title: LocalizedStringKey) -> some View {
        Text(title)
            .font(.atlas(.sans, 13.5))
            .foregroundStyle(Palette.inkSoft)
            .frame(maxWidth: .infinity, minHeight: 48)
            .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }
}
