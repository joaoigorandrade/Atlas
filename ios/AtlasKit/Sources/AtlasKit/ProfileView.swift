import SwiftUI

/// "Perfil" — who is signed in, what the run adds up to, and the three rows
/// that leave it. The desktop's two-column stat block stacks into a 2×2 grid.
struct ProfileView: View {
    @Environment(AtlasStore.self) private var store
    @Binding var tab: Tab

    private var email: String { store.session?.email ?? "" }

    var body: some View {
        VStack(spacing: 0) {
            TopBar {
                Kicker("Perfil", tint: Palette.accent, size: 10.5)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 18) {
                        Avatar(email, size: 66)
                        Text(email)
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.inkMuted)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }

                    stats.padding(.top, 28)
                    profile.padding(.top, 28)
                    rows.padding(.top, 14)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 26)
                .padding(.bottom, 28)
            }
        }
        .background(Palette.paper)
    }

    // MARK: - The four headline numbers

    private var stats: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            stat("\(store.streak)", "dias de sequência", tint: Palette.amberInk)
            stat(store.mastered.formatted(.percent.precision(.fractionLength(0))), "território dominado")
            stat("\(store.masteredCount)", "conceitos dominados")
            stat("\(store.cards.count)", "cartões em rotação")
        }
    }

    private func stat(_ value: String, _ label: String, tint: Color = Palette.ink) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(value).font(.atlas(.serif, 24)).foregroundStyle(tint)
            Text(label).font(.atlas(.sans, 12.5)).foregroundStyle(Palette.inkFaint)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: .rect(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }

    // MARK: - What the run is for

    private var profile: some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker("Perfil de aprendizado")
            Text("Aprendendo atualmente para").font(.atlas(.sans, 13.5))
                .foregroundStyle(Palette.inkMuted).padding(.top, 14)
            Text(store.goal.label).font(.atlas(.serif, 19)).foregroundStyle(Palette.ink).padding(.top, 5)

            let interests = store.interests
                .split(whereSeparator: { ",;".contains($0) })
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            if !interests.isEmpty {
                Text("Interesses — usados para analogias").font(.atlas(.sans, 13.5))
                    .foregroundStyle(Palette.inkMuted).padding(.top, 18)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 8, alignment: .leading)],
                          alignment: .leading, spacing: 8) {
                    ForEach(interests, id: \.self) {
                        Chip($0, tint: Palette.accent, background: Palette.accentBg)
                    }
                }
                .padding(.top, 10)
            }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: .rect(cornerRadius: Metrics.cardRadius))
        .overlay { RoundedRectangle(cornerRadius: Metrics.cardRadius).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }

    // MARK: - The way out

    private var rows: some View {
        VStack(spacing: 0) {
            NavigationLink { SettingsView().environment(store) } label: {
                row("Preferências e notificações", "Meta diária, idioma, voz")
            }
            Divider().overlay(Palette.hairline)
            Button { tab = .review } label: {
                row("Cronograma de revisão", queueLine)
            }
            Divider().overlay(Palette.hairline)
            Button { store.signOut() } label: {
                row("Sair", nil, tint: NodeState.gap.color)
            }
        }
        .buttonStyle(.plain)
        .background(Palette.card, in: .rect(cornerRadius: Metrics.cardRadius))
        .overlay { RoundedRectangle(cornerRadius: Metrics.cardRadius).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }

    private var queueLine: String {
        let due = store.queue.count
        return due == 0
            ? "Fila limpa hoje"
            : "\(due) pendentes · ~\(Int((Double(due) * cardMinutes).rounded())) min hoje"
    }

    private func row(_ title: String, _ note: String?, tint: Color = Palette.ink) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.atlas(.sans, 15)).foregroundStyle(tint)
                if let note {
                    Text(note).font(.atlas(.sans, 12.5)).foregroundStyle(Palette.inkFaint)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 13))
                .foregroundStyle(tint == Palette.ink ? Palette.inkGhost : tint)
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 64)
        .contentShape(.rect)
    }
}
