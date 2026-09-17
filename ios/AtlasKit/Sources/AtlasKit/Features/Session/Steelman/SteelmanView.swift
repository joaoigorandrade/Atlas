import Navigation
import SwiftUI

/// "Steelman" — both sides at full strength, then say where you stand.
///
/// The surface enforces the phase's own standard structurally: neither case can
/// be sent alone, and the two verdicts arrive together. A learner who could send
/// their own side first would get a mark to write the other against, which is
/// the asymmetry the phase exists to remove.
struct SteelmanView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: SteelmanViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Procurando o que se disputa…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .task {
            let model = model ?? SteelmanViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
        .onDisappear { model?.leave() }
        .sheet(item: Binding(
            get: { model?.editing.map(Editing.init) },
            set: { if $0 == nil { model?.editing = nil } }
        )) { _ in
            if let model {
                @Bindable var model = model
                VoiceSheet(
                    dictation: model.dictation,
                    tint: Phase.steelman.tint,
                    text: $model.draft,
                    placeholder: "Escreva o argumento que eles mesmos fariam",
                    sendTitle: "Pronto",
                    busy: model.draft.trimmed.count < 40,
                    escapes: [],
                    listen: { model.listen() },
                    send: { model.commit() },
                    keyboard: { model.commit() }
                )
                .presentationDetents([.height(VoiceSheet.height), .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Palette.paper)
            }
        }
    }

    /// The sheet's identity — `sheet(item:)` needs one, and the position id is it.
    private struct Editing: Identifiable { let id: String }

    @ViewBuilder
    private func content(_ model: SteelmanViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.steelman, title: model.node.label, back: { navigator.pop() })
            if let content = model.content {
                if model.reported {
                    report(content, model).transition(.opacity)
                } else {
                    compose(content, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.steelmanInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Writing both sides

    private func compose(_ content: SteelmanContent, _ model: SteelmanViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("A questão", tint: Palette.steelmanInk)
                    Text(verbatim: content.question)
                        .font(.atlas(.serif, 20))
                        .lineSpacing(5)
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    ForEach(content.positions) { position in
                        side(position, model).padding(.top, 18)
                    }

                    Kicker("Com qual você fica?", tint: Palette.steelmanInk).padding(.top, 24)
                    VStack(spacing: 8) {
                        ForEach(content.positions) { position in
                            ChoiceRow(position.label,
                                      chosen: model.session.holds == position.id) {
                                model.hold(position.id)
                            }
                        }
                    }
                    .padding(.top, 10)

                    Kicker("O que faria você mudar de ideia?", tint: Palette.steelmanInk)
                        .padding(.top, 24)
                    Text("Aponte algo que poderia de fato acontecer ou ser descoberto.")
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 6)
                    TextField("Um achado, um documento, um fato…",
                              text: Binding(get: { model.disconfirmer },
                                            set: { model.disconfirmer = $0 }),
                              axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.atlas(.sans, 15))
                        .lineLimit(2...5)
                        .padding(13)
                        .background(Palette.card, in: .rect(cornerRadius: 11))
                        .overlay {
                            RoundedRectangle(cornerRadius: 11)
                                .strokeBorder(Palette.hairlineStrong, lineWidth: 1)
                        }
                        .padding(.top, 10)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 18)
                .padding(.bottom, 24)
            }
            Dock {
                // Blocked until BOTH cases are written, a side is held, and the
                // disconfirmer is real. Sending one side first would hand the
                // learner a mark to write the other against.
                CTAButton(model.judging ? "Lendo os dois argumentos…" : "Enviar os dois →",
                          tint: Palette.steelmanInk) { model.submit() }
                    .disabled(!model.canSubmit)
            }
        }
    }

    private func side(_ position: SteelmanPosition, _ model: SteelmanViewModel) -> some View {
        let written = model.session.cases[position.id] ?? ""
        return VStack(alignment: .leading, spacing: 0) {
            Kicker("O argumento mais forte a favor de", tint: Palette.steelmanInk)
            Text(verbatim: position.label)
                .font(.atlas(.sans, 15).weight(.semibold))
                .foregroundStyle(Palette.ink)
                .padding(.top, 6)
            // Named by who actually held it: a position nobody held is a
            // strawman with better manners.
            Text(verbatim: "Defendido por \(position.heldBy)")
                .font(.atlas(.sans, 13))
                .foregroundStyle(Palette.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
            Button { model.open(position.id) } label: {
                Text(written.isEmpty ? "Escrever…" : written)
                    .font(.atlas(.sans, 14.5))
                    .lineSpacing(4)
                    .foregroundStyle(written.isEmpty ? Palette.inkFaint : Palette.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(13)
                    .background(Palette.card, in: .rect(cornerRadius: 11))
                    .overlay {
                        RoundedRectangle(cornerRadius: 11)
                            .strokeBorder(Palette.hairlineStrong, lineWidth: 1)
                    }
            }
            .buttonStyle(.plain)
            .padding(.top, 10)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.steelmanBg, in: .rect(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Palette.steelmanBorder, lineWidth: 1)
        }
    }

    // MARK: - The report

    private func report(_ content: SteelmanContent, _ model: SteelmanViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("Os dois lados", tint: Palette.steelmanInk)
                    Text(model.passed
                         ? "Você manteve a questão aberta. Isso é uma posição, não uma torcida."
                         : model.missedForDisconfirmer
                           ? "Sem algo que faria você mudar de ideia, você escolheu em vez de julgar."
                           : "Um dos lados não recebeu seu melhor argumento.")
                        .font(.atlas(.serif, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)

                    if let response = model.session.response {
                        Text(verbatim: response)
                            .font(.atlas(.sans, 14.5))
                            .lineSpacing(4)
                            .foregroundStyle(Palette.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12)
                    }

                    VStack(spacing: 12) {
                        ForEach(content.positions) { position in row(position, model) }
                    }
                    .padding(.top, 22)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 20)
                .padding(.bottom, 24)
            }
            Dock {
                CTAButton(model.handOffLabel, tint: model.handOffTint) { model.advance() }
            }
        }
        .sensoryFeedback(model.passed ? .success : .warning, trigger: model.reported)
    }

    /// Each side with its own ruling — the two are judged independently, so the
    /// report shows them that way rather than as one score.
    private func row(_ position: SteelmanPosition, _ model: SteelmanViewModel) -> some View {
        let verdict = model.session.verdicts[position.id]
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle().fill(verdict?.tint ?? Palette.inkFaint).frame(width: 7, height: 7)
                Text(verbatim: position.label)
                    .font(.atlas(.sans, 14).weight(.semibold))
                    .foregroundStyle(Palette.ink)
                Spacer()
                if let verdict {
                    Text(verdict.label)
                        .font(.atlas(.mono, 11))
                        .textCase(.uppercase)
                        .kerning(1.1)
                        .foregroundStyle(verdict.tint)
                }
            }
            Text(verbatim: model.session.cases[position.id] ?? "")
                .font(.atlas(.sans, 13.5))
                .lineSpacing(4)
                .foregroundStyle(Palette.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: .rect(cornerRadius: 11))
        .overlay {
            RoundedRectangle(cornerRadius: 11)
                .strokeBorder(Palette.hairline, lineWidth: 1)
        }
    }
}
