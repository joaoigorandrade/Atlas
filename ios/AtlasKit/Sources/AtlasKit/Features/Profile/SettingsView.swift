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
                    Text("Ajuste a jornada").font(.atlas(.display, 30)).foregroundStyle(Palette.ink)

                    field("Objetivo", "orienta o que priorizamos") {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 9), GridItem(.flexible(), spacing: 9)], spacing: 9) {
                            ForEach(GoalKind.allCases, id: \.self) { goal in
                                choice(goal.label, on: store.goal == goal) { model.choose(goal: goal) }
                            }
                        }
                    }

                    field("Meta diária", "unidade de sequência") {
                        HStack(spacing: 9) {
                            ForEach(dailyTargets, id: \.self) { minutes in
                                choice("\(minutes) min", on: store.dailyTarget == minutes) { model.choose(dailyTarget: minutes) }
                            }
                        }
                    }

                    field("Idioma", "a interface e o conteúdo gerado") {
                        HStack(spacing: 9) {
                            ForEach(AtlasAPI.languages, id: \.self) { code in
                                choice(code == "pt-BR" ? "Português" : "English", on: store.language == code) {
                                    model.choose(language: code)
                                }
                            }
                        }
                    }

                    field("País", "temas de finanças, direito e impostos usam as regras dele") {
                        Menu {
                            ForEach(Self.countries, id: \.self) { code in
                                Button(Locale.current.localizedString(forRegionCode: code) ?? code) {
                                    store.setCountry(code)
                                }
                            }
                        } label: {
                            Chip(verbatim: Locale.current.localizedString(forRegionCode: store.country ?? "") ?? "—",
                                 dot: Palette.accent)
                        }
                    }

                    field("Voz", "fale em vez de digitar") {
                        VStack(spacing: 0) {
                            toggle("Ditado", "microfone em toda caixa de resposta", $store.dictationOn)
                            Divider().overlay(Palette.hairline)
                            toggle("Leitura em voz alta", "as seções do Consume podem ser ouvidas", $store.readAloudOn)
                        }
                        .background(Palette.card, in: .rect(cornerRadius: 3))
                        .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
                    }

                    field("Lembrete", "para voltar quando os cartões vencem") {
                        VStack(alignment: .leading, spacing: 0) {
                            Toggle(isOn: Binding(get: { model.reminderOn }, set: { model.toggleReminder($0) })) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Lembrete de revisão").font(.atlas(.serif, 16)).foregroundStyle(Palette.ink)
                                    Text("uma notificação por dia").font(.atlas(.serif, 14)).foregroundStyle(Palette.inkFaint)
                                }
                            }
                            .tint(Palette.accent)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 60)
                            if model.reminderOn {
                                Divider().overlay(Palette.hairline)
                                DatePicker("Horário", selection: Bindable(model).reminderTime,
                                           displayedComponents: .hourAndMinute)
                                    .font(.atlas(.serif, 16))
                                    .foregroundStyle(Palette.ink)
                                    .tint(Palette.accent)
                                    .padding(.horizontal, 16)
                                    .frame(minHeight: 56)
                            }
                        }
                        .background(Palette.card)
                        .plate()
                        if model.reminderDenied {
                            Text("As notificações do Atlas estão desligadas nos Ajustes do iPhone.")
                                .font(.atlas(.serif, 14.5))
                                .foregroundStyle(Palette.amberInk)
                            Button("Abrir os Ajustes") { openSettings() }
                                .font(.atlas(.serif, 15))
                                .foregroundStyle(Palette.accent)
                                .frame(minHeight: Metrics.tap)
                        }
                    }
                    .animation(Motion.standard, value: model.reminderOn)

                    data(model)
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 24)
                .padding(.bottom, 30)
            }
        }
        // Said in the old language, since the interface has not switched yet.
        .alert("Idioma alterado", isPresented: model.isLanguageChanged) {
            Button("Abrir os Ajustes") { openSettings() }
            Button("OK", role: .cancel) {}
        } message: {
            Text("O conteúdo novo já sai nesse idioma. A interface muda na próxima vez que o Atlas abrir — ou agora, pelo idioma do app nos Ajustes do iPhone.")
        }
        .alert("Apagar minha conta?", isPresented: model.isConfirmingDelete) {
            Button("Cancelar", role: .cancel) { model.cancelDelete() }
            Button("Apagar tudo", role: .destructive) { Task { await model.delete() } }
        } message: {
            Text("Seu mapa, seu progresso e seus cartões são apagados do servidor. Não dá para desfazer.")
        }
    }

    /// The app's own page in the iPhone's settings — its language and its
    /// notifications both live there.
    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }

    // MARK: - Your data

    private func data(_ model: SettingsViewModel) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Kicker("Seus dados").padding(.bottom, 3)
            ShareLink(item: model.exportedMap) { ghostLabel("Exportar mapa (JSON)") }
            ShareLink(item: model.exportedCards) { ghostLabel("Exportar cartões (CSV)") }
            Button { model.askToDelete() } label: {
                Text("Apagar minha conta")
                    .font(.atlas(.serif, 15, weight: .semibold))
                    .foregroundStyle(Palette.dangerInk)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Palette.dangerBg, in: .rect(cornerRadius: 3))
                    .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(Palette.dangerInk.opacity(0.3), lineWidth: 1) }
            }
            .pressable()
            if !model.message.isEmpty {
                Text(verbatim: model.message).font(.atlas(.serif, 14.5)).foregroundStyle(Palette.dangerInk)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.top, 20)
        .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
        .animation(Motion.standard, value: model.message)
    }

    // MARK: - The pieces the design repeats

    /// The countries offered — where the app's learners are.
    static let countries = ["BR", "PT", "US", "GB", "CA", "AU", "IE", "ES", "MX", "AR", "CO", "CL",
                            "FR", "DE", "IT", "NL", "AO", "MZ", "IN", "JP"]

    private func field<Content: View>(_ title: LocalizedStringKey, _ note: LocalizedStringKey,
                                      @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 5) {
                Text(title).font(.atlas(.serif, 15.5)).foregroundStyle(Palette.inkSoft)
                Text("— \(Text(note))").font(.atlas(.serif, 15.5)).foregroundStyle(Palette.inkGhost)
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
                .boxed(on ? Palette.accentBg : Palette.card, border: on ? Palette.accent : Palette.hairlineStrong)
        }
        .pressable()
        .animation(Motion.snap, value: on)
    }

    private func toggle(_ title: LocalizedStringKey, _ note: LocalizedStringKey, _ value: Binding<Bool>) -> some View {
        Toggle(isOn: value) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.atlas(.serif, 16)).foregroundStyle(Palette.ink)
                Text(note).font(.atlas(.serif, 14)).foregroundStyle(Palette.inkFaint)
            }
        }
        .tint(Palette.accent)
        .padding(.horizontal, 16)
        .frame(minHeight: 60)
    }

    private func ghostLabel(_ title: LocalizedStringKey) -> some View {
        Text(title)
            .font(.atlas(.serif, 15))
            .foregroundStyle(Palette.inkSoft)
            .frame(maxWidth: .infinity, minHeight: 48)
            .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }
}
