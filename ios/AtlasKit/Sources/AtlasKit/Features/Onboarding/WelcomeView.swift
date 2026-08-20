import SwiftUI

/// Screen 5 — Boas-vindas. Everything the map generation needs, on one scroll
/// with the CTA in a dock: the topic, why, and the daily unit the streak counts.
struct WelcomeView: View {
    @Bindable var onboarding: OnboardingViewModel
    @FocusState private var editing: Bool

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("Atlas · aprenda qualquer coisa, a fundo", size: 11)
                    Text("O que você quer aprender?")
                        .font(.atlas(.serif, 34, weight: .medium))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 16)
                        .padding(.bottom, 28)

                    topicField
                    if !onboarding.scopes.isEmpty { scopeOffers.padding(.top, 20) }
                    if !onboarding.message.isEmpty { notice.padding(.top, 16) }

                    field("Por que você está aprendendo isso?", "— orienta o que priorizamos") {
                        Grid(horizontalSpacing: 9, verticalSpacing: 9) {
                            GridRow {
                                option(.exam)
                                option(.pareto)
                            }
                            GridRow {
                                option(.mastery)
                                option(.project)
                            }
                        }
                    }

                    field("Seus interesses", "— opcional") {
                        TextField("ex.: xadrez, investimentos, culinária", text: $onboarding.form.interests)
                            .font(.atlas(.sans, 15))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                            .background(Palette.card, in: .rect(cornerRadius: 11))
                            .overlay {
                                RoundedRectangle(cornerRadius: 11)
                                    .strokeBorder(Palette.hairlineStrong, lineWidth: 1)
                            }
                    }

                    field("Meta diária", "— sua unidade de sequência") {
                        HStack(spacing: 9) {
                            ForEach(dailyTargets, id: \.self) { minutes in
                                pill("\(minutes) min", on: onboarding.form.target == minutes) {
                                    onboarding.form.target = minutes
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 28)
                .padding(.bottom, 8)
            }
            .scrollDismissesKeyboard(.interactively)

            Dock {
                CTAButton("Montar meu mapa →", hero: true) {
                    editing = false
                    onboarding.buildMap()
                }
                Text("~5 minutos para um mapa aceso com uma fronteira clara")
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(Palette.inkGhost)
            }
        }
        .background(Palette.paper)
    }

    // MARK: - Pieces

    private var topicField: some View {
        TextField("Um tema, uma ementa colada…", text: $onboarding.form.topic, axis: .vertical)
            .font(.atlas(.serif, 20))
            .foregroundStyle(Palette.ink)
            .focused($editing)
            .submitLabel(.done)
            .padding(.horizontal, 14)
            .padding(.vertical, 16)
            .background(Palette.card, in: .rect(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14).strokeBorder(Palette.hairlineStrong, lineWidth: 1)
            }
            .shadow(color: Palette.ink.opacity(0.05), radius: 9, y: 4)
        // ponytail: no PDF/ementa upload — it needs a document picker and a
        // multipart POST to /api/extract. Add it when a learner actually has a
        // syllabus on their phone.
    }

    /// The topic was a continent, not a map: pick a territory (#30).
    private var scopeOffers: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("\"\(onboarding.form.topic)\" é um continente, não um mapa. Escolha um território para começar:")
                .font(.atlas(.sans, 13.5))
                .foregroundStyle(Palette.inkMuted)
            ForEach(onboarding.scopes, id: \.label) { scope in
                Button { onboarding.pick(scope) } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(scope.label).font(.atlas(.serif, 16)).foregroundStyle(Palette.ink)
                        Text(scope.note).font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Palette.card, in: .rect(cornerRadius: 11))
                    .overlay {
                        RoundedRectangle(cornerRadius: 11).strokeBorder(Palette.hairlineStrong, lineWidth: 1)
                    }
                }
            }
        }
    }

    private var notice: some View {
        Text(onboarding.message)
            .font(.atlas(.sans, 13.5))
            .foregroundStyle(Palette.amberInk)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.amberBg, in: .rect(cornerRadius: 10))
            .overlay {
                RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.amberInk.opacity(0.2), lineWidth: 1)
            }
    }

    private func field<Content: View>(
        _ title: String, _ hint: String, @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            (Text(title).foregroundStyle(Palette.inkSoft)
                + Text(" \(hint)").foregroundStyle(Palette.inkGhost))
                .font(.atlas(.sans, 14))
            content()
        }
        .padding(.top, 26)
    }

    private func option(_ goal: GoalKind) -> some View {
        pill(goal.label, on: onboarding.form.goal == goal) { onboarding.form.goal = goal }
    }

    /// The design's one selectable control: accent fill and border when on,
    /// paper and a hairline when off. Never under the tap minimum.
    private func pill(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.atlas(.sans, 14, weight: on ? .semibold : .regular))
                .foregroundStyle(on ? Palette.accent : Palette.inkSoft)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, minHeight: 48)
        }
        .background(on ? Palette.accentBg : Palette.card, in: .rect(cornerRadius: 11))
        .overlay {
            RoundedRectangle(cornerRadius: 11)
                .strokeBorder(on ? Palette.accent : Palette.hairlineStrong, lineWidth: 1)
        }
    }
}
