import Navigation
import SwiftUI

/// "Início" — the day's two decisions and every map, on one screen. The
/// greeting is the title bar rather than a hero block, continue and review are
/// two tiles side by side, and the maps are ruled rows in one plate — a map
/// card used to be 180pt, and the first screen showed none of them.
public struct HomeView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var tabs: AtlasTabNavigator
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var model: HomeViewModel?

    public init() {}

    public var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .background(Palette.paper)
        .task {
            if model == nil { model = HomeViewModel(store: store) }
            model?.warm()
        }
    }

    private func content(_ model: HomeViewModel) -> some View {
        VStack(spacing: 0) {
            TopBar {
                VStack(alignment: .leading, spacing: 1) {
                    Kicker(verbatim: model.today)
                    Text(model.greeting).font(.atlas(.display, 21)).foregroundStyle(Palette.ink)
                }
            } trailing: {
                HStack(spacing: 10) {
                    if model.streak > 0 {
                        Chip("\(model.streak) dias", dot: NodeState.frontier.color,
                             tint: Palette.amberInk, background: Palette.amberBg)
                            // A day landing on the streak is a reward moment,
                            // and the design's one springy token pays for it.
                            .contentTransition(.numericText())
                            .transition(.scale(scale: 0.6).combined(with: .opacity))
                    }
                    Button { tabs.switchTab(to: .profile) } label: { Avatar(model.email) }
                        .accessibilityLabel("Abrir o perfil")
                }
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Side by side at the ordinary sizes; stacked when the type
                    // is too large for two columns to hold a title each.
                    let tiles = typeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(alignment: .top, spacing: 10))
                    tiles {
                        continueTile(model)
                        reviewTile(model)
                    }
                    .animation(Motion.standard, value: model.next?.id)

                    if !model.dayPlan.isEmpty { todayPlan(model).padding(.top, 24) }

                    if model.hasRun {
                        Kicker("Seus mapas").padding(.top, 24)
                        ForEach(model.continents) { group in
                            continentPlate(group, model).padding(.top, 8)
                        }
                        if !model.looseMaps.isEmpty {
                            VStack(spacing: 0) {
                                ForEach(Array(model.looseMaps.enumerated()), id: \.element.id) { index, map in
                                    if index > 0 { Divider().overlay(Palette.hairline) }
                                    mapRow(map, model)
                                        // Switching maps re-sorts this list; the rows
                                        // slide rather than teleport past each other.
                                        .transition(.opacity.combined(with: .move(edge: .top)))
                                }
                            }
                            .background(Palette.card)
                            .plate()
                            .padding(.top, 8)
                        }
                        newMapButton(model).padding(.top, 4)
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

    // MARK: - Today: two tiles

    /// "Continuar": the concept under way, the phase it opens on and what it
    /// still costs — one tap into the pass, pushed over the map so that
    /// finishing it lands where the change can be seen.
    private func continueTile(_ model: HomeViewModel) -> some View {
        Button {
            if let node = model.next {
                tabs.navigate(to: .session(node, phase: nil), inTab: .map)
            } else {
                tabs.switchTab(to: .map)
            }
        } label: {
            if let node = model.next {
                tile(kicker: Kicker(model.continueKicker, tint: Palette.amberInk),
                     title: node.label, note: model.continueNote ?? "",
                     border: NodeState.frontier.color.opacity(0.6))
            } else {
                tile(kicker: Kicker("Sua fronteira", tint: Palette.amberInk),
                     title: model.frontierHeadline, note: String(localized: "Abrir o mapa"),
                     border: NodeState.frontier.color.opacity(0.6))
            }
        }
        .buttonStyle(Pressable())
    }

    /// "Revisar": every map's due cards added up. Review deals one map at a
    /// time, so the tap opens the map with the most waiting — switching to it
    /// first when it is not the open one.
    private func reviewTile(_ model: HomeViewModel) -> some View {
        Button {
            Task {
                if let target = model.reviewTarget, !model.isOpen(target) { await model.open(target) }
                tabs.switchTab(to: .review)
            }
        } label: {
            tile(kicker: Kicker("Revisar", tint: Palette.accent),
                 title: model.reviewTitle, note: model.reviewNote,
                 border: Palette.accent.opacity(0.45))
        }
        .buttonStyle(Pressable())
        .disabled(model.switching != nil)
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

    // MARK: - One map, one row

    /// One saved run as a ruled row: its name, a hairline of progress, and one
    /// line of what it holds. The open map carries a gilt rule down its edge
    /// instead of a chip; its goal lives in the "…" and on the profile.
    /// Tapping the open one goes to its map; tapping another switches the whole
    /// store onto it first, which is a round trip, so the row says so.
    private func mapRow(_ map: AtlasRun, _ model: HomeViewModel) -> some View {
        let open = model.isOpen(map)
        let due = model.dueCount(map)
        let share = map.mastered.formatted(.percent.precision(.fractionLength(0)))
        return HStack(spacing: 0) {
            Button {
                Task {
                    await model.open(map)
                    tabs.switchTab(to: .map)
                }
            } label: {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(verbatim: map.subject)
                            .font(.atlas(.display, 17))
                            .foregroundStyle(Palette.ink)
                            .lineLimit(1)
                        if model.switching == map.id { ProgressView().controlSize(.mini) }
                    }
                    ProgressBar(value: map.mastered)
                    Group {
                        if due > 0 {
                            Text("\(share) · \(model.frontierCount(map)) na fronteira · \(Text("\(due) para revisar").foregroundStyle(Palette.accent))")
                        } else {
                            Text("\(share) · \(model.frontierCount(map)) na fronteira")
                        }
                    }
                    .font(.atlas(.serif, 14))
                    .foregroundStyle(Palette.inkFaint)
                    .lineLimit(1)
                }
                .padding(.leading, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(Pressable())
            .disabled(model.switching != nil)
            .contextMenu { mapActions(map, model) }
            .accessibilityValue(open ? Text("Em andamento") : Text(verbatim: ""))

            Menu { mapActions(map, model) } label: {
                Image(systemName: "ellipsis")
                    .foregroundStyle(Palette.inkMuted)
                    .frame(width: Metrics.tap, height: Metrics.tap)
            }
            .accessibilityLabel(Text("Opções do mapa"))
        }
        .overlay(alignment: .leading) {
            if open { Rectangle().fill(Palette.gilt).frame(width: 3) }
        }
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
    /// navigate to — the shell swaps itself out from under this screen. A quiet
    /// line under the list, the web's italic `quiet` button: it is the rarest
    /// thing done here, and a full-width button was the loudest.
    private func newMapButton(_ model: HomeViewModel) -> some View {
        Button { Task { await model.newMap() } } label: {
            Text("+ Novo mapa")
                .font(.atlas(.display, 16).italic())
                .foregroundStyle(Palette.inkMuted)
                .frame(minHeight: Metrics.tap)
                .contentShape(.rect)
        }
        .pressable()
    }
}

/// A hairline of progress — `ProgressView` draws a 4pt capsule that reads as a
/// control; a row only needs the proportion.
private struct ProgressBar: View {
    let value: Double
    var body: some View {
        Rectangle().fill(Palette.hairlineStrong)
            .frame(height: 2)
            .overlay(alignment: .leading) {
                GeometryReader { geo in
                    Rectangle().fill(Palette.accent).frame(width: geo.size.width * min(max(value, 0), 1))
                }
            }
            .padding(.trailing, 4)
            .animation(Motion.reward, value: value)
            .accessibilityHidden(true)
    }
}
