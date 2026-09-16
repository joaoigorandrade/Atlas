import Navigation
import SwiftUI

/// "Recall" — from memory, with nothing in front of you. Distinct from
/// Feynman's unaided *production*: this grades only whether the concept is still
/// there, so the rubric is never on screen before the answer.
struct RecallView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: RecallViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Preparando a página em branco…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .dismissesKeyboardOnTap()
        .task {
            let model = model ?? RecallViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
        .onDisappear { model?.leave() }
    }

    @ViewBuilder
    private func content(_ model: RecallViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.recall, title: model.node.label, back: { navigator.pop() })
            if let content = model.content {
                if model.reported {
                    report(content, model).transition(.opacity.combined(with: .move(edge: .bottom)))
                } else {
                    page(content, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.recallInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
        .animation(Motion.enter, value: model.reported)
    }

    // MARK: - The blank page

    private func page(_ content: RecallContent, _ model: RecallViewModel) -> some View {
        @Bindable var model = model
        return VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Kicker("De memória, sem nada na sua frente", tint: Palette.recallInk)
                // The brief, and nothing else. No rubric, no structure, no list
                // of what to cover: what the learner never thinks to write is
                // the whole finding here.
                Text(verbatim: content.brief)
                    .font(.atlas(.serif, 20))
                    .lineSpacing(5)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)

                if model.cued {
                    Text(verbatim: content.scaffold)
                        .font(.atlas(.sans, 14))
                        .lineSpacing(4)
                        .foregroundStyle(Palette.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.recallBg, in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Palette.recallBorder, lineWidth: 1)
                        }
                        .padding(.top, 14)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }

                AnswerEditor(text: $model.written,
                             placeholder: String(localized: "Escreva tudo o que voltar…"),
                             dictation: model.dictation, fills: true, tint: Palette.recallInk)
                    .padding(.top, 16)

                if !model.message.isEmpty {
                    Text(verbatim: model.message)
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.amberInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                }
            }
            // Not inside a ScrollView: the editor takes every point the page has
            // left, and two nested scrolls is a drag that does different things
            // a few points apart.
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 18)
            .padding(.bottom, 12)

            Dock {
                CTAButton(model.judging ? "Lendo o que você escreveu…" : "Entregar de memória →",
                          tint: Palette.recallInk) { model.submit() }
                    .disabled(!model.canSubmit)
                if !model.cued {
                    GhostButton("Estou travado · uma dica") { model.cue() }
                }
            }
        }
    }

    // MARK: - The retrieval report

    private func report(_ content: RecallContent, _ model: RecallViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("O que voltou", tint: Palette.recallInk)
                    Text(model.passed
                         ? "Recuperado do zero — é esse o sinal em que a revisão se apoia."
                         : "Parte disso não voltou sozinha. Essa é a descoberta.")
                        .font(.atlas(.serif, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                    Text("\(model.score) de \(model.rubric.count) pontos recuperados.")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 8)
                    // A cued retrieval is a different reading, and the report
                    // says so rather than congratulating an unaided one.
                    if model.cued {
                        Text("Recuperado depois de uma dica — vale repetir do zero mais tarde.")
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 10)
                    }
                    if !model.response.isEmpty {
                        Text(verbatim: model.response)
                            .font(.atlas(.serif, 15.5))
                            .lineSpacing(5)
                            .foregroundStyle(Palette.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 16)
                    }

                    VStack(spacing: 2) {
                        ForEach(content.rubric) { row($0, model) }
                    }
                    .padding(.top, 20)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 20)
                .padding(.bottom, 24)
            }
            Dock {
                CTAButton(model.handOffLabel, tint: model.handOffTint) { model.advance() }
                GhostButton("Tentar do zero de novo") { model.again() }
            }
        }
        .sensoryFeedback(model.passed ? .success : .warning, trigger: model.reported)
    }

    private func row(_ owed: RecallRow, _ model: RecallViewModel) -> some View {
        let verdict = model.verdict(owed)
        return HStack(alignment: .top, spacing: 11) {
            Circle()
                .fill(verdict.color)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: owed.point)
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(verbatim: verdict.label)
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(verdict == .good ? Palette.inkFaint : Palette.amberInk)
                if let quote = model.quote(owed) {
                    Text(verbatim: "“\(quote)”")
                        .font(.atlas(.serif, 13.5))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 9)
    }
}
