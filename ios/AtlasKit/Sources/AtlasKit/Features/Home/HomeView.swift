import Navigation
import SwiftUI

/// "Início" — the reference screen, and the day's two decisions: what is due
/// for review, and what the frontier is. Every other screen is built the way
/// this one is: a `TopBar`, a scrolling body on `Metrics.gutter`, tokens for
/// everything. Both cards send the learner to another tab — this screen decides
/// nothing on its own.
public struct HomeView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var tabs: AtlasTabNavigator
    @State private var model: HomeViewModel?

    public init() {}

    public var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .background(Palette.paper)
        .task {
            if model == nil { model = HomeViewModel(store: store) }
            // Home is the other door into Review, and it used to be the cold
            // one: only the map warmed the card draft, so opening Review from
            // here meant watching it be written. A run whose nodes are all
            // covered returns from this immediately.
            store.warmRetain()
        }
    }

    private func content(_ model: HomeViewModel) -> some View {
        VStack(spacing: 0) {
            TopBar {
                Text(verbatim: "Atlas").font(.atlas(.serif, 19, weight: .semibold)).foregroundStyle(Palette.ink)
            } trailing: {
                HStack(spacing: 12) {
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
                    Kicker(verbatim: model.today)
                    Text(model.greeting)
                        .font(.atlas(.serif, 30))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 9)
                    Text(model.frontierLine)
                        .font(.atlas(.sans, 14.5))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 6)

                    reviewCard(model).padding(.top, 26)
                    frontierCard(model).padding(.top, 14)
                        .animation(Motion.standard, value: model.frontierHeadline)

                    if model.hasRun {
                        Text("Seus mapas").font(.atlas(.serif, 21)).foregroundStyle(Palette.ink)
                            .padding(.top, 32)
                        ForEach(model.continents) { group in
                            continentSection(group, model).padding(.top, 18)
                        }
                        ForEach(model.looseMaps) { map in
                            mapCard(map, model).padding(.top, 14)
                                // Switching maps re-sorts this list; the cards
                                // slide rather than teleport past each other.
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                        newMapButton(model).padding(.top, 14)
                        if !model.message.isEmpty {
                            Text(verbatim: model.message)
                                .font(.atlas(.sans, 13))
                                .foregroundStyle(Palette.dangerInk)
                                .padding(.top, 12)
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 26)
                .padding(.bottom, 24)
                // The streak is the one reward beat on this screen; the map
                // list only ever needs to not jump.
                .animation(Motion.spring, value: model.streak)
                .animation(Motion.standard, value: model.maps.map(\.subject))
                .animation(Motion.standard, value: model.maps.map(\.continent))
                .animation(Motion.standard, value: model.message)
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

    /// A continent: its name, its member maps, and the land still uncharted —
    /// each of those one tap from being built into it.
    private func continentSection(_ group: HomeViewModel.ContinentGroup, _ model: HomeViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Kicker("Continente", tint: Palette.amberInk)
                    Text(verbatim: group.continent.name).font(.atlas(.serif, 19)).foregroundStyle(Palette.ink)
                }
                Spacer(minLength: 0)
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
            ForEach(group.maps) { map in
                mapCard(map, model).padding(.top, 10)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
            ForEach(group.uncharted, id: \.label) { scope in
                Button { Task { await model.chart(scope, in: group.continent) } } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Kicker("Terra inexplorada")
                        Text(verbatim: scope.label).font(.atlas(.serif, 16)).foregroundStyle(Palette.ink)
                        Text(verbatim: scope.note).font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted)
                        Text("Mapear →").font(.atlas(.sans, 13.5, weight: .semibold))
                            .foregroundStyle(Palette.amberInk).padding(.top, 4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .overlay {
                        RoundedRectangle(cornerRadius: 11)
                            .strokeBorder(Palette.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    }
                }
                .pressable()
                .padding(.top, 10)
            }
            // Closes the continent, so a loose map below doesn't read as a member.
            Rectangle().fill(Palette.hairlineStrong).frame(height: 1).padding(.top, 18)
        }
    }

    private func reviewCard(_ model: HomeViewModel) -> some View {
        Button { tabs.switchTab(to: .review) } label: {
            Card(border: Palette.accent.opacity(0.22)) {
                summary(kicker: "Revisão de hoje", kickerTint: Palette.accent,
                        headline: model.reviewHeadline, note: model.reviewNote,
                        action: model.reviewAction, actionTint: Palette.accent)
            }
        }
        .buttonStyle(Pressable())
    }

    private func frontierCard(_ model: HomeViewModel) -> some View {
        Button { tabs.switchTab(to: .map) } label: {
            Card(border: NodeState.frontier.color.opacity(0.28)) {
                summary(kicker: "Sua fronteira", kickerTint: Palette.amberInk,
                        headline: model.frontierHeadline, note: model.frontierNote,
                        action: "Abrir o mapa →", actionTint: Palette.amberInk)
            }
        }
        .buttonStyle(Pressable())
    }

    /// Both cards are the same block — kicker, headline, one sentence, one link.
    private func summary(kicker: LocalizedStringKey, kickerTint: Color, headline: String,
                         note: String, action: LocalizedStringKey, actionTint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker(kicker, tint: kickerTint)
            // Headline and note carry the frontier node's own label and summary
            // when it has one, so they are rendered as written.
            Text(verbatim: headline).font(.atlas(.serif, 26)).foregroundStyle(Palette.ink)
            Text(verbatim: note).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.inkMuted)
            Text(action)
                .font(.atlas(.sans, 13.5, weight: .semibold))
                .foregroundStyle(actionTint)
                .padding(.top, 8)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// One saved run. Tapping the open one goes to its map; tapping any other
    /// switches the whole store onto it first, which is a round trip, so the
    /// tab change waits for it.
    private func mapCard(_ map: AtlasRun, _ model: HomeViewModel) -> some View {
        let open = model.isOpen(map)
        return Button {
            Task {
                await model.open(map)
                tabs.switchTab(to: .map)
            }
        } label: {
            Card(border: NodeState.frontier.color.opacity(open ? 0.35 : 0.16)) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Kicker(map.goal.label)
                        Spacer(minLength: 0)
                        Chip(model.status(map),
                             tint: open ? Palette.accent : Palette.inkFaint,
                             background: open ? Palette.accentBg : Palette.chipBg)
                    }
                    Text(verbatim: map.subject).font(.atlas(.serif, 19)).foregroundStyle(Palette.ink)
                    ProgressView(value: map.mastered).tint(Palette.accent)
                        .animation(Motion.reward, value: map.mastered)
                    HStack {
                        Text("\(map.mastered.formatted(.percent.precision(.fractionLength(0)))) dominado")
                        Spacer()
                        Text("\(model.frontierCount(map)) na fronteira")
                    }
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(Palette.inkFaint)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 18)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(Pressable())
        .contextMenu {
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
    }

    /// Clearing the run is what shows onboarding, so there is nowhere to
    /// navigate to — the shell swaps itself out from under this screen.
    private func newMapButton(_ model: HomeViewModel) -> some View {
        GhostButton("+ Novo mapa") { Task { await model.newMap() } }
    }
}
