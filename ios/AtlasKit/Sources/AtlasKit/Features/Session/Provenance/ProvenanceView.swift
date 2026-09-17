import Navigation
import SwiftUI

/// "Provenance" — what is this source for, and what will it actually carry?
///
/// The source panel never leaves the screen. That is the point of the surface:
/// the learner reads and rules at once, the way anyone working with a document
/// does, rather than remembering a passage they were shown earlier.
struct ProvenanceView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: ProvenanceViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Waiting("Procurando uma fonte…") }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .task {
            let model = model ?? ProvenanceViewModel(session: session)
            self.model = model
            await model.load()
        }
    }

    @ViewBuilder
    private func content(_ model: ProvenanceViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.provenance, title: model.node.label, back: { navigator.pop() }) {
                if model.total > 0 {
                    Chip(verbatim: "\(min(model.session.index + 1, model.total))/\(model.total)",
                         tint: Palette.provenanceInk)
                }
            }
            if let content = model.content {
                if model.reported {
                    report(content, model).transition(.opacity)
                } else if let item = model.current {
                    run(content, item, model).transition(.opacity)
                }
            } else {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                if model.failed {
                    Dock {
                        CTAButton("Tentar de novo", tint: Palette.provenanceInk) {
                            Task { await model.load() }
                        }
                    }
                }
            }
        }
        .animation(Motion.standard, value: model.session.index)
    }

    // MARK: - The source, and one claim against it

    private func run(
        _ content: ProvenanceContent, _ item: ProvenanceClaim, _ model: ProvenanceViewModel
    ) -> some View {
        VStack(spacing: 0) {
            SegmentBar(model.rail, value: Text("\(model.score) de \(model.total)"))
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 12)
                .padding(.bottom, 8)
                .background(Palette.paper)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    source(content.source)

                    Kicker("A afirmação", tint: Palette.provenanceInk).padding(.top, 20)
                    Text(verbatim: item.claim)
                        .font(.atlas(.serif, 19))
                        .lineSpacing(5)
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    VStack(spacing: 8) {
                        ForEach(ProvenanceRuling.allCases, id: \.self) { ruling in
                            ChoiceRow(ruling.label, mark: model.mark(ruling),
                                      chosen: model.ruled == ruling,
                                      enabled: !model.settled) { model.rule(ruling) }
                        }
                    }
                    .padding(.top, 14)

                    // Why it is that ruling, and only after the commit — for
                    // `asserts`, what would be needed to settle it.
                    if model.settled {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker("Por quê", tint: Palette.provenanceInk)
                            Text(verbatim: item.because)
                                .font(.atlas(.sans, 14.5))
                                .lineSpacing(4)
                                .foregroundStyle(Palette.inkSoft)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.provenanceBg, in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Palette.provenanceBorder, lineWidth: 1)
                        }
                        .padding(.top, 16)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 18)
                .padding(.bottom, 24)
            }
            Dock {
                CTAButton("Próxima afirmação →", tint: Palette.provenanceInk) { model.next() }
                    .disabled(!model.settled)
            }
        }
    }

    /// Who wrote it, to whom, when — the load-bearing context. Without it the
    /// excerpt is a fact rather than an act by an interested party.
    private func source(_ source: ProvenanceSource) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker("A fonte", tint: Palette.provenanceInk)
            Text(verbatim: source.title)
                .font(.atlas(.sans, 15).weight(.semibold))
                .foregroundStyle(Palette.ink)
                .padding(.top, 8)
            Text(verbatim: "\(source.attribution) · \(source.date)")
                .font(.atlas(.sans, 13))
                .foregroundStyle(Palette.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
            Text(verbatim: source.excerpt)
                .font(.atlas(.serif, 16).italic())
                .lineSpacing(5)
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.provenanceBg, in: .rect(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Palette.provenanceBorder, lineWidth: 1)
        }
    }

    // MARK: - The report

    private func report(_ content: ProvenanceContent, _ model: ProvenanceViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("A leitura", tint: Palette.provenanceInk)
                    Text(model.passed
                         ? "Você a leu como documento, não como registro. É esse o ofício."
                         : "Algumas coisas a fonte apenas afirma.")
                        .font(.atlas(.serif, 22))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                    Text("\(model.score) de \(model.total) afirmações julgadas corretamente.")
                        .font(.atlas(.sans, 14))
                        .foregroundStyle(Palette.inkMuted)
                        .padding(.top, 8)

                    // Taking the source at its word is called out on its own: it
                    // survives a two-thirds score untouched, and it is the one
                    // thing the phase exists to catch.
                    if !model.overtrusted.isEmpty {
                        Text("Você acreditou na fonte — ter sido dito não é ter sido assim.")
                            .font(.atlas(.sans, 13.5))
                            .foregroundStyle(Palette.amberInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12)
                    }

                    // Whose voice is missing is not a claim that can be ruled,
                    // so it is shown here rather than as an item. It is half the
                    // lesson.
                    VStack(alignment: .leading, spacing: 8) {
                        Kicker("O que ela não diz", tint: Palette.provenanceInk)
                        Text(verbatim: content.silence)
                            .font(.atlas(.sans, 14.5))
                            .lineSpacing(4)
                            .foregroundStyle(Palette.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.provenanceBg, in: .rect(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(Palette.provenanceBorder, lineWidth: 1)
                    }
                    .padding(.top, 18)

                    VStack(spacing: 2) {
                        ForEach(content.claims) { item in row(item, model) }
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
            }
        }
        .sensoryFeedback(model.passed ? .success : .warning, trigger: model.reported)
    }

    private func row(_ item: ProvenanceClaim, _ model: ProvenanceViewModel) -> some View {
        let right = model.session.rulings[item.id] == item.ruling
        return HStack(alignment: .top, spacing: 11) {
            Circle()
                .fill(right ? NodeState.mastered.color : NodeState.shaky.color)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: item.claim)
                    .font(.atlas(.sans, 14))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                // The verdict in words as well as in colour: a dot is invisible
                // to VoiceOver and indistinguishable to a colour-blind learner.
                Text(right ? "Julgada corretamente" : "Julgada errado")
                    .font(.atlas(.sans, 12.5))
                    .foregroundStyle(right ? Palette.inkFaint : Palette.amberInk)
                if !right {
                    Text(verbatim: item.because)
                        .font(.atlas(.sans, 13))
                        .foregroundStyle(Palette.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 9)
    }
}
