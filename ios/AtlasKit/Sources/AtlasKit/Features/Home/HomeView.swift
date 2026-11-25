import Navigation
import SwiftUI

/// "Início" — the web dashboard at phone width (`DashboardScreen`): the
/// greeting and a line on the frontier, the day's two decisions as stacked hero
/// plates, today across every map, then each map as a plate of its own.
public struct HomeView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var tabs: AtlasTabNavigator
    @State private var model: HomeViewModel?

    public init() {}

    public var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .paper()
        .task {
            if model == nil { model = HomeViewModel(store: store) }
            model?.warm()
        }
    }

    private func content(_ model: HomeViewModel) -> some View {
        VStack(spacing: 0) {
            // The web's masthead: the atlas's name, the streak in words, the
            // avatar. The greeting moved down into the page, as it is there.
            // ponytail: the web's compass rose isn't drawn; port `CompassRose`
            // if the bare title reads as missing something.
            TopBar {
                Text(verbatim: "Atlas").font(.atlas(.display, 21)).foregroundStyle(Palette.ink)
            } trailing: {
                HStack(spacing: 10) {
                    HStack(spacing: 7) {
                        Circle().fill(Palette.gilt).frame(width: 8, height: 8)
                            .shadow(color: Palette.gilt.opacity(0.6), radius: 4)
                        Text("\(model.streak) dias de sequência")
                            .font(.atlas(.serif, 14))
                            .foregroundStyle(Palette.inkMuted)
                            // A day landing on the streak is a reward moment,
                            // and the design's one springy token pays for it.
                            .contentTransition(.numericText())
                    }
                    Button { tabs.switchTab(to: .profile) } label: { Avatar(model.email) }
                        .accessibilityLabel("Abrir o perfil")
                }
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(verbatim: model.today, size: 11)
                    Text(model.greeting)
                        .font(.atlas(.display, 38))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 8)
                    Text(verbatim: model.lede)
                        .font(.atlas(.serif, 16))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 4)

                    // The web's two hero plates, stacked as they are under
                    // 768px: today's review in verdigris, the frontier in gilt.
                    VStack(spacing: 16) {
                        reviewTile(model)
                        continueTile(model)
                    }
                    .padding(.top, 28)
                    .animation(Motion.standard, value: model.next?.id)

                    if !model.dayPlan.isEmpty { todayPlan(model).padding(.top, 24) }

                    if model.hasRun {
                        HStack(alignment: .firstTextBaseline) {
                            Text("Seus mapas").font(.atlas(.serif, 22)).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            newMapButton(model)
                        }
                        .padding(.top, 32)
                        ForEach(model.continents) { group in
                            continentPlate(group, model).padding(.top, 8)
                        }
                        // One plate per map, as the web's map cards; the open
                        // one framed in gilt.
                        ForEach(model.looseMaps) { map in
                            Card(border: model.isOpen(map) ? Palette.gilt : Palette.rule) { mapRow(map, model) }
                                .padding(.top, 12)
                                // Switching maps re-sorts this list; the plates
                                // slide rather than teleport past each other.
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 16)
                .padding(.bottom, 24)
                // The streak is the one reward beat on this screen; the map
                // list only ever needs to not jump.
                .animation(Motion.spring, value: model.streak)
                .animation(Motion.standard, value: model.maps.map(\.subject))
                .animation(Motion.standard, value: model.maps.map(\.continent))
                .animation(Motion.standard, value: model.folded)
            }
        }
        // Long-press a card to exclude it. The map, its mastery states, its
        // cards and everything generated for it are one row, and the delete
        // takes all of it — so it is asked about first, like the account is.
        .alert(model.deleteAsk, isPresented: model.isConfirmingDelete) {
            Button("Manter", role: .cancel) { model.cancelDelete() }
            Button("Excluir", role: .destructive) { Task { await model.delete() } }
        } message: {
            Text("O mapa, seus estados de domínio, seus cartões e tudo que foi gerado para ele são apagados. Sua sequência permanece. Não dá para desfazer.")
        }
        .alert(model.dissolveAsk, isPresented: model.isConfirmingDissolve) {
            Button("Manter", role: .cancel) {}
            Button("Desfazer", role: .destructive) { Task { await model.dissolve() } }
        } message: {
            Text("Os mapas continuam em Seus mapas; só o agrupamento some.")
        }
        .alert("Nome do continente", isPresented: model.isNaming) {
            TextField("Nome do continente", text: Bindable(model).draftName)
            Button("Cancelar", role: .cancel) {}
            Button("Salvar") { Task { await model.saveName() } }
        }
    }

    /// A continent: a header that folds, its member maps as rows, and the land
    /// still uncharted — each one tap from being built into it.
    private func continentPlate(_ group: HomeViewModel.ContinentGroup, _ model: HomeViewModel) -> some View {
        let folded = model.folded.contains(group.continent.id)
        return VStack(spacing: 0) {
            HStack(spacing: 4) {
                Button { model.toggleFold(group.continent.id) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Palette.inkFaint)
                            .rotationEffect(.degrees(folded ? 0 : 90))
                        VStack(alignment: .leading, spacing: 0) {
                            Kicker("Continente", tint: Palette.amberInk)
                            Text(verbatim: group.continent.name).font(.atlas(.display, 17)).foregroundStyle(Palette.ink)
                        }
                        Spacer(minLength: 0)
                        if folded {
                            Text(verbatim: "\(group.maps.count)").font(.atlas(.caps, 13)).foregroundStyle(Palette.inkFaint)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: Metrics.tap, alignment: .leading)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityValue(folded ? Text("Recolhido") : Text("Aberto"))
                Menu {
                    Button("Renomear", systemImage: "pencil") { model.startRename(group.continent) }
                    Button("Desfazer o continente", systemImage: "square.split.2x1", role: .destructive) {
                        model.askToDissolve(group.continent)
                    }
                } label: {
                    Image(systemName: "ellipsis").foregroundStyle(Palette.inkMuted)
                        .frame(width: Metrics.tap, height: Metrics.tap)
                }
                .accessibilityLabel("Opções do continente")
            }
            .padding(.leading, 12)
            .padding(.vertical, 4)

            if !folded {
                ForEach(group.maps) { map in
                    Divider().overlay(Palette.hairline)
                    mapRow(map, model)
                }
                ForEach(group.uncharted, id: \.label) { scope in
                    Divider().overlay(Palette.hairline)
                    Button { Task { await model.chart(scope, in: group.continent) } } label: {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 1) {
                                Kicker("Terra inexplorada")
                                Text(verbatim: scope.label).font(.atlas(.serif, 16.5)).foregroundStyle(Palette.inkSoft)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            Text("Mapear →").font(.atlas(.serif, 15, weight: .semibold)).foregroundStyle(Palette.amberInk)
                        }
                        .padding(.horizontal, 14)
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .contentShape(.rect)
                    }
                    .pressable()
                }
            }
        }
        .background(Palette.card)
        .plate()
    }

    // MARK: - Today: two hero plates (`HeroCard` on the web)

    /// The frontier plate: the concept under way, the phase it opens on and
    /// what it still costs — one tap into the pass, pushed over the map so
    /// that finishing it lands where the change can be seen.
    private func continueTile(_ model: HomeViewModel) -> some View {
        Button {
            if let node = model.next {
                tabs.navigate(to: .session(node, phase: nil), inTab: .map)
            } else {
                tabs.switchTab(to: .map)
            }
        } label: {
            if let node = model.next {
                hero(label: model.continueKicker, title: node.label, body: model.continueNote ?? "",
                     cta: "Continuar →", frame: Palette.gilt, ink: Palette.amberInk, dot: Palette.gilt)
            } else {
                hero(label: "Sua fronteira", title: model.frontierHeadline, body: "",
                     cta: "Abrir o mapa →", frame: Palette.gilt, ink: Palette.amberInk, dot: Palette.gilt)
            }
        }
        .buttonStyle(Pressable())
    }

    /// Today's review: every map's due cards added up. Review deals one map
    /// at a time, so the tap opens the map with the most waiting — switching
    /// to it first when it is not the open one.
    private func reviewTile(_ model: HomeViewModel) -> some View {
        Button {
            Task {
                if let target = model.reviewTarget, !model.isOpen(target) { await model.open(target) }
                tabs.switchTab(to: .review)
            }
        } label: {
            hero(label: "Revisão de hoje", title: model.reviewTitle, body: model.reviewNote,
                 cta: "Iniciar revisão →", frame: Palette.accent, ink: Palette.accent, dot: Palette.accent)
        }
        .buttonStyle(Pressable())
        .disabled(model.switching != nil)
    }

    /// One hero plate: a dotted kicker, a Garamond title, a line, and the call
    /// to action written out as a link line — the web's `HeroCard`.
    private func hero(label: LocalizedStringKey, title: String, body: String, cta: LocalizedStringKey,
                      frame: Color, ink: Color, dot: Color) -> some View {
        Card(border: frame) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Circle().fill(dot).frame(width: 7, height: 7)
                    Kicker(label, tint: ink, size: 10.5)
                }
                .padding(.bottom, 14)
                Text(verbatim: title)
                    .font(.atlas(.serif, 28))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 6)
                if !body.isEmpty {
                    Text(verbatim: body)
                        .font(.atlas(.serif, 15))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 16)
                }
                Text(cta).font(.atlas(.serif, 15, weight: .semibold)).foregroundStyle(ink)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 22)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Today across every map (W4.6): each row opens its map.
    private func todayPlan(_ model: HomeViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker("Hoje, em todos os seus mapas", tint: Palette.accent)
            ForEach(model.dayPlan) { item in
                Button {
                    Task {
                        if let map = model.maps.first(where: { $0.subject == item.subject }) {
                            await model.open(map)
                            tabs.switchTab(to: .map)
                        }
                    }
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(verbatim: item.subject).font(.atlas(.display, 16)).foregroundStyle(Palette.ink)
                            Text(verbatim: model.line(item)).font(.atlas(.serif, 14))
                                .foregroundStyle(Palette.inkMuted)
                        }
                        Spacer(minLength: 8)
                        Text(verbatim: "~\(item.minutes) min").font(.atlas(.caps, 12)).foregroundStyle(Palette.inkFaint)
                    }
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(.rect)
                }
                .buttonStyle(Pressable())
                .disabled(model.switching != nil)
                Divider().overlay(Palette.hairline)
            }
        }
    }

    /// Both tiles are the same block: a kicker, a title, one line.
    private func tile(kicker: Kicker, title: String, note: String, border: Color) -> some View {
        Card(border: border) {
            VStack(alignment: .leading, spacing: 4) {
                kicker
                Text(verbatim: title)
                    .font(.atlas(.display, 19))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Text(verbatim: note)
                    .font(.atlas(.serif, 14))
                    .foregroundStyle(Palette.inkMuted)
                    .lineLimit(2)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
        }
    }

    // MARK: - One map

    /// One saved map, laid out as the web's map card: its goal and state over
    /// its name, a hairline of progress, and what it holds. Loose maps get a
    /// plate each; a continent's members sit as rows inside its plate.
    /// Tapping the open one goes to its map; tapping another switches the whole
    /// store onto it first, which is a round trip, so the row says so.
    private func mapRow(_ map: AtlasRun, _ model: HomeViewModel) -> some View {
        let open = model.isOpen(map)
        let due = model.dueCount(map)
        let pct = Int((map.mastered * 100).rounded())
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Kicker(map.goal.label)
                Spacer(minLength: 4)
                Chip(pct >= 100 ? "Completo" : pct > 0 ? "Em andamento" : "Recém-iniciado",
                     tint: Palette.accent, background: Palette.accentBg)
                Menu { mapActions(map, model) } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(Palette.inkMuted)
                        .frame(width: 36, height: Metrics.tap)
                }
                .accessibilityLabel(Text("Opções do mapa"))
            }
            Button {
                Task {
                    await model.open(map)
                    tabs.switchTab(to: .map)
                }
            } label: {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 8) {
                        Text(verbatim: map.subject)
                            .font(.atlas(.serif, 20))
                            .foregroundStyle(Palette.ink)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        if model.switching == map.id { AtlasPulse(size: 14) }
                    }
                    .padding(.bottom, 14)
                    ProgressBar(value: map.mastered).padding(.bottom, 9)
                    HStack {
                        Text("\(pct)% dominado")
                        Spacer(minLength: 8)
                        if due > 0 {
                            Text("\(due) para revisar").foregroundStyle(Palette.accent)
                        } else {
                            Text("\(model.frontierCount(map)) na fronteira")
                        }
                    }
                    .font(.atlas(.serif, 14))
                    .foregroundStyle(Palette.inkMuted)
                    .lineLimit(1)
                }
                // The row's 8 trailing is for the menu's own hit area; the body
                // needs the 20 the leading edge has, or its last word met the rule.
                .padding(.trailing, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(Pressable())
            .disabled(model.switching != nil)
            .contextMenu { mapActions(map, model) }
            .accessibilityValue(open ? Text("Em andamento") : Text(verbatim: ""))
        }
        .padding(.leading, 20)
        .padding(.trailing, 8)
        .padding(.bottom, 18)
        .padding(.top, 6)
    }

    @ViewBuilder
    private func mapActions(_ map: AtlasRun, _ model: HomeViewModel) -> some View {
        if map.continent != nil {
            Button("Sair do continente", systemImage: "arrow.up.forward.square") {
                Task { await model.move(map, to: nil) }
            }
        } else {
            Menu("Adicionar a um continente", systemImage: "square.stack.3d.up") {
                ForEach(model.continents) { group in
                    Button { Task { await model.move(map, to: group.continent) } } label: {
                        Text(verbatim: group.continent.name)
                    }
                }
                Button("Novo continente…", systemImage: "plus") { model.startContinent(with: map) }
            }
        }
        Button("Excluir este tópico", systemImage: "trash", role: .destructive) {
            model.askToDelete(map)
        }
    }

    /// Clearing the run is what shows onboarding, so there is nowhere to
    /// navigate to — the shell swaps itself out from under this screen. A link
    /// beside the "Seus mapas" heading, where the web keeps it.
    private func newMapButton(_ model: HomeViewModel) -> some View {
        Button { Task { await model.newMap() } } label: {
            Text("+ Novo mapa")
                .font(.atlas(.serif, 15))
                .foregroundStyle(Palette.accent)
                .frame(minHeight: Metrics.tap)
                .contentShape(.rect)
        }
        .pressable()
    }
}
