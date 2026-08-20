import SwiftUI

/// "Início" — the reference screen, and the day's two decisions: what is due
/// for review, and what the frontier is. Every other screen is built the way
/// this one is: a `TopBar`, a scrolling body on `Metrics.gutter`, tokens for
/// everything.
public struct HomeView: View {
    @Environment(AtlasStore.self) private var store
    /// Both cards send the learner to another tab — this screen decides
    /// nothing on its own.
    @Binding var tab: Tab

    public init(tab: Binding<Tab>) { _tab = tab }

    private var queue: [ScheduledCard] { store.queue }

    public var body: some View {
        VStack(spacing: 0) {
            TopBar {
                Text("Atlas").font(.atlas(.serif, 19, weight: .semibold)).foregroundStyle(Palette.ink)
            } trailing: {
                HStack(spacing: 12) {
                    if store.streak > 0 {
                        Chip("\(store.streak) dias", dot: NodeState.frontier.color,
                             tint: Palette.amberInk, background: Palette.amberBg)
                    }
                    Button { tab = .profile } label: { Avatar(store.session?.email) }
                        .accessibilityLabel("Abrir o perfil")
                }
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                    Text(greeting)
                        .font(.atlas(.serif, 30))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 9)
                    Text("Você está na fronteira de \(store.frontier.count) conceitos. Continue de onde parou.")
                        .font(.atlas(.sans, 14.5))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 6)

                    reviewCard.padding(.top, 26)
                    frontierCard.padding(.top, 14)

                    if !store.subject.isEmpty {
                        Text("Seus mapas").font(.atlas(.serif, 21)).foregroundStyle(Palette.ink)
                            .padding(.top, 32)
                        mapCard.padding(.top, 14)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 26)
                .padding(.bottom, 24)
            }
        }
        .background(Palette.paper)
    }

    private var greeting: String {
        switch Calendar.current.component(.hour, from: .now) {
        case ..<12: "Bom dia"
        case ..<18: "Boa tarde"
        default: "Boa noite"
        }
    }

    /// The queue, framed in minutes against the daily target — never a wall of
    /// cards, and never a number that isn't due.
    private var reviewCard: some View {
        Button { tab = .review } label: {
            Card(border: Palette.accent.opacity(0.22)) {
                VStack(alignment: .leading, spacing: 6) {
                    Kicker("Revisão de hoje", tint: Palette.accent)
                    Text(queue.isEmpty ? "Fila limpa" : "\(queue.count) cartões pendentes")
                        .font(.atlas(.serif, 26))
                        .foregroundStyle(Palette.ink)
                    Text(queue.isEmpty
                         ? "Nada a recuperar agora. O próximo cartão volta assim que a memória começar a esfriar."
                         : "~\(Int((Double(queue.count) * cardMinutes).rounded())) min · no momento exato em que essas memórias estão prestes a desvanecer.")
                        .font(.atlas(.sans, 13.5))
                        .foregroundStyle(Palette.inkMuted)
                    Text(queue.isEmpty ? "Abrir a revisão →" : "Iniciar revisão →")
                        .font(.atlas(.sans, 13.5, weight: .semibold))
                        .foregroundStyle(Palette.accent)
                        .padding(.top, 8)
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
    }

    private var frontierCard: some View {
        Button { tab = .map } label: {
            Card(border: NodeState.frontier.color.opacity(0.28)) {
                VStack(alignment: .leading, spacing: 6) {
                    Kicker("Sua fronteira", tint: Palette.amberInk)
                    Text(store.frontier.first?.label ?? "Seu mapa ainda está vazio")
                        .font(.atlas(.serif, 26))
                        .foregroundStyle(Palette.ink)
                    Text(store.frontier.first?.summary ?? "Monte um mapa para acender sua primeira fronteira.")
                        .font(.atlas(.sans, 13.5))
                        .foregroundStyle(Palette.inkMuted)
                    Text("Abrir o mapa →")
                        .font(.atlas(.sans, 13.5, weight: .semibold))
                        .foregroundStyle(Palette.amberInk)
                        .padding(.top, 8)
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
    }

    /// ponytail: one card, because the app holds one run. The design's list and
    /// its "+ Novo mapa" need several `run_states` rows, which is the same
    /// change that makes any of this survive a relaunch.
    private var mapCard: some View {
        Card(border: NodeState.frontier.color.opacity(0.35)) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Kicker(store.goal.label)
                    Spacer(minLength: 0)
                    Chip("Em andamento", tint: Palette.accent, background: Palette.accentBg)
                }
                Text(store.subject).font(.atlas(.serif, 19)).foregroundStyle(Palette.ink)
                ProgressView(value: store.mastered).tint(Palette.accent)
                HStack {
                    Text(store.mastered.formatted(.percent.precision(.fractionLength(0))) + " dominado")
                    Spacer()
                    Text("\(store.frontier.count) na fronteira")
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

/// The learner's initials on the dark disc — the design's one avatar, on the
/// home bar and at the top of the profile.
struct Avatar: View {
    private let email: String?
    private let size: CGFloat
    init(_ email: String?, size: CGFloat = 34) { self.email = email; self.size = size }

    var body: some View {
        Text(initials)
            .font(.atlas(.mono, size * 0.38, weight: .semibold))
            .foregroundStyle(Palette.accentInk)
            .frame(width: size, height: size)
            .background(Palette.ink, in: .circle)
    }

    /// Two letters from the address — the account has no display name to ask.
    private var initials: String {
        let name = email?.split(separator: "@").first.map(String.init) ?? ""
        let parts = name.split(whereSeparator: { ".-_+".contains($0) }).prefix(2)
        let letters = parts.compactMap(\.first).map { String($0) }.joined()
        return letters.isEmpty ? "A" : letters.uppercased()
    }
}
