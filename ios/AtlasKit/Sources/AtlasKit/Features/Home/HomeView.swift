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
        .task { if model == nil { model = HomeViewModel(store: store) } }
    }

    private func content(_ model: HomeViewModel) -> some View {
        VStack(spacing: 0) {
            TopBar {
                Text("Atlas").font(.atlas(.serif, 19, weight: .semibold)).foregroundStyle(Palette.ink)
            } trailing: {
                HStack(spacing: 12) {
                    if model.streak > 0 {
                        Chip("\(model.streak) dias", dot: NodeState.frontier.color,
                             tint: Palette.amberInk, background: Palette.amberBg)
                    }
                    Button { tabs.switchTab(to: .profile) } label: { Avatar(model.email) }
                        .accessibilityLabel("Abrir o perfil")
                }
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(model.today)
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

                    if model.hasRun {
                        Text("Seus mapas").font(.atlas(.serif, 21)).foregroundStyle(Palette.ink)
                            .padding(.top, 32)
                        mapCard(model).padding(.top, 14)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 26)
                .padding(.bottom, 24)
            }
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
        .buttonStyle(.plain)
    }

    private func frontierCard(_ model: HomeViewModel) -> some View {
        Button { tabs.switchTab(to: .map) } label: {
            Card(border: NodeState.frontier.color.opacity(0.28)) {
                summary(kicker: "Sua fronteira", kickerTint: Palette.amberInk,
                        headline: model.frontierHeadline, note: model.frontierNote,
                        action: "Abrir o mapa →", actionTint: Palette.amberInk)
            }
        }
        .buttonStyle(.plain)
    }

    /// Both cards are the same block — kicker, headline, one sentence, one link.
    private func summary(kicker: String, kickerTint: Color, headline: String,
                         note: String, action: String, actionTint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker(kicker, tint: kickerTint)
            Text(headline).font(.atlas(.serif, 26)).foregroundStyle(Palette.ink)
            Text(note).font(.atlas(.sans, 13.5)).foregroundStyle(Palette.inkMuted)
            Text(action)
                .font(.atlas(.sans, 13.5, weight: .semibold))
                .foregroundStyle(actionTint)
                .padding(.top, 8)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// ponytail: one card, because the app holds one run. The design's list and
    /// its "+ Novo mapa" need several `run_states` rows, which is the same
    /// change that makes any of this survive a relaunch.
    private func mapCard(_ model: HomeViewModel) -> some View {
        Card(border: NodeState.frontier.color.opacity(0.35)) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Kicker(model.goal)
                    Spacer(minLength: 0)
                    Chip("Em andamento", tint: Palette.accent, background: Palette.accentBg)
                }
                Text(model.subject).font(.atlas(.serif, 19)).foregroundStyle(Palette.ink)
                ProgressView(value: model.mastered).tint(Palette.accent)
                HStack {
                    Text(model.mastered.formatted(.percent.precision(.fractionLength(0))) + " dominado")
                    Spacer()
                    Text("\(model.frontier.count) na fronteira")
                }
                .font(.atlas(.sans, 12.5))
                .foregroundStyle(Palette.inkFaint)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
