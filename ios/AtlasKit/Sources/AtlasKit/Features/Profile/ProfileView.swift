import Navigation
import SwiftUI

/// "Perfil" — who is signed in, what the run adds up to, and the three rows
/// that leave it. The desktop's two-column stat block stacks into a 2×2 grid.
struct ProfileView: View {
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @EnvironmentObject private var tabs: AtlasTabNavigator
    @State private var model: ProfileViewModel?

    var body: some View {
        Group {
            if let model { content(model) } else { Color.clear }
        }
        .background(Palette.paper)
        .task { if model == nil { model = ProfileViewModel(store: store) } }
    }

    private func content(_ model: ProfileViewModel) -> some View {
        VStack(spacing: 0) {
            TopBar { Kicker("Perfil", tint: Palette.accent, size: 10.5) }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 18) {
                        Avatar(model.email, size: 66)
                        Text(verbatim: model.email)
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.inkMuted)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }

                    stats(model).padding(.top, 28)
                    profile(model).padding(.top, 28)
                    rows(model).padding(.top, 14)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 26)
                .padding(.bottom, 28)
            }
        }
    }

    // MARK: - The four headline numbers

    private func stats(_ model: ProfileViewModel) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            stat(model.streak, "dias de sequência", tint: Palette.amberInk)
            stat(model.masteredShare, "território dominado")
            stat(model.masteredCount, "conceitos dominados")
            stat(model.cardCount, "cartões em rotação")
        }
    }

    private func stat(_ value: String, _ label: LocalizedStringKey, tint: Color = Palette.ink) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(verbatim: value).font(.atlas(.serif, 26)).foregroundStyle(tint)
            Text(label).font(.atlas(.sans, 12.5)).foregroundStyle(Palette.inkFaint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .background(Palette.card, in: .rect(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }

    // MARK: - What the run is for

    private func profile(_ model: ProfileViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker("Perfil de aprendizado")
            Text("Aprendendo atualmente para").font(.atlas(.sans, 13.5))
                .foregroundStyle(Palette.inkMuted).padding(.top, 14)
            Text(model.goal).font(.atlas(.serif, 19)).foregroundStyle(Palette.ink).padding(.top, 5)

            let interests = model.interests
            if !interests.isEmpty {
                Text("Interesses — usados para analogias").font(.atlas(.sans, 13.5))
                    .foregroundStyle(Palette.inkMuted).padding(.top, 18)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 8, alignment: .leading)],
                          alignment: .leading, spacing: 8) {
                    ForEach(interests, id: \.self) {
                        Chip(verbatim: $0, tint: Palette.accent, background: Palette.accentBg)
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

    private func rows(_ model: ProfileViewModel) -> some View {
        VStack(spacing: 0) {
            Button { navigator.navigate(to: .settings) } label: {
                row("Preferências e notificações", "Meta diária, idioma, voz")
            }
            Divider().overlay(Palette.hairline)
            Button { tabs.switchTab(to: .review) } label: {
                row("Cronograma de revisão", model.queueLine)
            }
            Divider().overlay(Palette.hairline)
            Button { model.signOut() } label: {
                row("Sair", nil, tint: NodeState.gap.color)
            }
        }
        .buttonStyle(.plain)
        .background(Palette.card, in: .rect(cornerRadius: Metrics.cardRadius))
        .overlay { RoundedRectangle(cornerRadius: Metrics.cardRadius).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }

    private func row(_ title: LocalizedStringKey, _ note: LocalizedStringKey?, tint: Color = Palette.ink) -> some View {
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
