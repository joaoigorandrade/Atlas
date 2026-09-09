import Navigation
import SwiftUI

/// "Feynman" (screen 16) — the teach-back. One blank page, taught in the
/// learner's own words; the judge diffs the finished explanation against a
/// rubric they never saw, and every row it can't find becomes a gap under the
/// node.
struct FeynmanView: View {
    let session: SessionViewModel
    @Environment(AtlasStore.self) private var store
    @EnvironmentObject private var navigator: AtlasNavigator
    @State private var model: FeynmanViewModel?

    var body: some View {
        Group {
            if let model { content(model).transition(.arrival) } else { Color.clear }
        }
        .background(Palette.paper)
        .animation(Motion.enter, value: model == nil)
        .dismissesKeyboardOnTap()
        .task {
            let model = model ?? FeynmanViewModel(session: session, api: store.api)
            self.model = model
            await model.load()
        }
        // The judge outlives the screen otherwise: an answer for a report
        // nobody will see, still being paid for.
        .onDisappear { model?.leave() }
    }

    @ViewBuilder
    private func content(_ model: FeynmanViewModel) -> some View {
        VStack(spacing: 0) {
            PhaseBar(.feynman, title: model.node.label, back: { navigator.pop() })

            if model.reported {
                report(model).transition(.opacity.combined(with: .move(edge: .bottom)))
            } else if model.failed {
                Waiting(verbatim: model.waitingCopy, spinning: model.message.isEmpty)
                Dock { CTAButton("Tentar de novo", tint: Phase.feynman.tint) { Task { await model.retry() } } }
            } else {
                teach(model)
            }
        }
        .animation(Motion.enter, value: model.reported)
        .sensoryFeedback(.success, trigger: model.reported)
    }

    // MARK: - Teaching

    /// One page, one growing box, one Submit. Not one card per rubric row: the
    /// rows are hidden on purpose, and walking the learner through them one at
    /// a time turns a continuous explanation into N short answers to N implicit
    /// questions — with the order of the rows leaking the shape of the answer.
    private func teach(_ model: FeynmanViewModel) -> some View {
        VStack(spacing: 0) {
            // Two layouts, and the type scale picks. At the ordinary sizes the
            // page does not scroll and the box takes every point left over —
            // one drag, one thing it does, and no empty paper under a 150pt
            // keyhole. At the accessibility sizes the prompt alone is taller
            // than the screen, so the page has to scroll or the dock and the
            // top bar are pushed off both ends of it.
            // ponytail: that does nest the editor's own scroll inside the
            // page's, at AX sizes only, where nothing else fits.
            if typeSize.isAccessibilitySize {
                ScrollView {
                    page(model)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Metrics.gutter)
                }
            } else {
                page(model)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Metrics.gutter)
            }
            Dock {
                // Two controls side by side is a phone-width assumption; at the
                // accessibility sizes it is the thing that shears the labels.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { stuck(model); submit(model) }
                    VStack(spacing: 10) { submit(model); stuck(model) }
                }
            }
        }
    }

    private func page(_ model: FeynmanViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker("Ensine de volta · sou o aluno que nunca ouviu falar disso",
                   tint: Phase.feynman.tint)
                .padding(.top, 18)

            Text("Me ensine isso como se eu nunca tivesse ouvido falar.")
                .font(.atlas(.serif, 21))
                .foregroundStyle(Palette.ink)
                .padding(.top, 10)

            // At the accessibility sizes the page is the box; the second
            // sentence is the first thing that has to go, or the input is
            // below the fold on entry.
            if !typeSize.isAccessibilitySize {
                Text("Com suas próprias palavras, de ponta a ponta. O que você não consegue explicar é exatamente o que ainda não domina.")
                    .font(.atlas(.sans, 13.5))
                    .foregroundStyle(Palette.inkMuted)
                    .padding(.top, 6)
            }

            if model.scaffolded { scaffold.padding(.top, 14) }
            if !model.stillOwed.isEmpty && model.hasPreviousPass { owed(model).padding(.top, 14) }
            if model.truncated { truncated(model).padding(.top, 14) }
            if !model.message.isEmpty && !model.truncated {
                Text(verbatim: model.message)
                    .font(.atlas(.sans, 13.5))
                    .foregroundStyle(Palette.amberInk)
                    .padding(.top, 14)
            }

            AnswerEditor(text: Binding(get: { model.explanation }, set: { model.explanation = $0 }),
                         placeholder: String(localized: "Explique com suas próprias palavras — como se eu nunca tivesse ouvido falar"),
                         dictation: model.dictation,
                         fills: !typeSize.isAccessibilitySize,
                         tint: Phase.feynman.tint)
                .padding(.top, 16)
                .padding(.bottom, 20)
        }
    }

    @ViewBuilder
    private func stuck(_ model: FeynmanViewModel) -> some View {
        if !model.scaffolded {
            GhostButton("Estou travado") { model.scaffold() }
        }
    }

    private func submit(_ model: FeynmanViewModel) -> some View {
        CTAButton(model.submitTitle, tint: Phase.feynman.tint) { model.submit() }
            .disabled(!model.canSubmit)
    }

    /// The freeze nudge — on request, never on arrival. Handing it over
    /// unasked gives away a piece of the diagnostic for free.
    private var scaffold: some View {
        Text("Sem pânico de tela em branco. Comece pelo mais simples: que problema esse conceito realmente resolve? Ensine-me isso primeiro — o resto sai sozinho.")
            .font(.atlas(.sans, 13))
            .foregroundStyle(Palette.amberInk)
            .padding(.horizontal, 13).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.amberBg)
            .overlay(alignment: .leading) { Rectangle().fill(NodeState.frontier.color).frame(width: 3) }
            .clipShape(.rect(bottomTrailingRadius: 8, topTrailingRadius: 8))
    }

    /// The second pass is a different exercise: teach me just the things you
    /// didn't. These rows are already on the report the learner just read, so
    /// naming them here reveals nothing new — and it is a far shorter loop than
    /// re-teaching the whole concept from nothing.
    private func owed(_ model: FeynmanViewModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Kicker("Me ensine só estas partes", tint: Phase.feynman.tint)
            ForEach(model.stillOwed, id: \.self) { point in
                HStack(alignment: .top, spacing: 9) {
                    Circle().fill(NodeState.gap.color).frame(width: 6, height: 6).padding(.top, 6)
                    Text(verbatim: point).font(.atlas(.serif, 15)).foregroundStyle(Palette.ink)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(13)
        .background(Palette.cardAlt, in: .rect(cornerRadius: 12))
    }

    /// The rubric came back short. The learner is about to be graded against a
    /// smaller test than the concept earns, and is owed both the fact and the
    /// way out of it.
    private func truncated(_ model: FeynmanViewModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("A lista de tópicos veio incompleta — seu aluno vai avaliar menos partes do que deveria.")
                .font(.atlas(.sans, 13))
                .foregroundStyle(Palette.amberInk)
            Button("Escrever os tópicos de novo") { Task { await model.retry() } }
                .font(.atlas(.sans, 13, weight: .semibold))
                .foregroundStyle(Phase.feynman.tint)
                .frame(minHeight: Metrics.tap, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 13).padding(.vertical, 4)
        .background(Palette.amberBg, in: .rect(cornerRadius: 8))
    }

    // MARK: - The Gap Report

    private func report(_ model: FeynmanViewModel) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("Relatório de lacunas · sua explicação, comparada",
                           tint: Phase.feynman.tint, size: 11)
                    // A learner who explained everything well used to get the
                    // same neutral list as one who skipped everything. A phase
                    // that cannot be won is a phase learners stop taking
                    // seriously.
                    Text(model.headline)
                        .font(.atlas(.serif, 21))
                        .foregroundStyle(model.clean ? NodeState.mastered.color : Palette.ink)
                        .padding(.top, 10)

                    if let delta = model.delta {
                        // The one place in the product where the learner
                        // watches the loop work on them.
                        Chip(verbatim: delta, dot: NodeState.mastered.color).padding(.top, 12)
                    }

                    student(model.response).padding(.top, 18)

                    if !model.explanation.trimmed.isEmpty {
                        Kicker("O que você ensinou").padding(.top, 24)
                        // Their own words with the fragments that earned each
                        // verdict marked — "what I actually said" is the object
                        // of study, not an abstract list of rubric rows.
                        Text(model.markedExplanation)
                            .font(.atlas(.serif, 15.5))
                            .lineSpacing(4)
                            .foregroundStyle(Palette.inkSoft)
                            .padding(.top, 10)
                    }

                    Kicker("Ponto a ponto").padding(.top, 24)
                    ForEach(model.rows) { row in verdict(row, model) }

                    jargon(model).padding(.top, 24)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Metrics.gutter)
                .padding(.vertical, 22)
            }
            Dock {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { again(model); advance(model) }
                    VStack(spacing: 10) { advance(model); again(model) }
                }
            }
        }
    }

    private func again(_ model: FeynmanViewModel) -> some View {
        // The one place the loop is visible working: the explanation is still
        // there, and the next report is the delta.
        GhostButton("↺ Ensinar de novo") { model.teachAgain() }
    }

    private func advance(_ model: FeynmanViewModel) -> some View {
        CTAButton(model.gapCount == 0
                  ? "Diff limpo · Connect →"
                  : "Anexar \(model.gapCount) e continuar →",
                  tint: Palette.connectInk) { model.advance() }
    }

    /// The judge's reaction is written *in the voice of someone who has never
    /// heard of this* — that framing is the whole Feynman conceit, and it read
    /// as an anonymous paragraph under a kicker. Same bytes, given a speaker.
    private func student(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: "person.fill.questionmark")
                .font(.system(size: 15))
                .foregroundStyle(Palette.accentInk)
                .frame(width: 34, height: 34)
                .background(Phase.feynman.tint, in: .circle)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Kicker("Aluno confuso", tint: Phase.feynman.tint)
                Text(verbatim: text)
                    .font(.atlas(.serif, 17))
                    .lineSpacing(4)
                    .foregroundStyle(Palette.ink)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Palette.card, in: .rect(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func verdict(_ row: FeynmanViewModel.Row, _ model: FeynmanViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 11) {
                Circle().fill(row.verdict.color).frame(width: 8, height: 8).padding(.top, 6)
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: row.beat.subPoint)
                        .font(.atlas(.serif, 15.5))
                        .foregroundStyle(Palette.ink)
                    HStack(spacing: 8) {
                        // The verdict was carried by dot colour alone — green,
                        // grey and red, which is nothing to a colour-blind
                        // learner and nothing to VoiceOver.
                        Text(verbatim: row.verdict.label)
                            .font(.atlas(.mono, 10.5))
                            .tracking(0.8)
                            .foregroundStyle(row.verdict.color)
                        if row.wasGap && row.verdict == .good {
                            Text("era lacuna")
                                .font(.atlas(.mono, 10.5))
                                .tracking(0.8)
                                .foregroundStyle(Palette.inkFaint)
                        }
                    }
                    if let quote = row.quote {
                        Text(verbatim: "“\(quote)”").font(.atlas(.sans, 13)).foregroundStyle(Palette.inkMuted)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            if row.verdict.isGap, row.beat.fix != nil, model.fixing != row.beat.id {
                Button("Corrigir agora →") { model.openFix(row.beat) }
                    .font(.atlas(.sans, 13, weight: .semibold))
                    .foregroundStyle(Phase.feynman.tint)
                    .frame(minHeight: Metrics.tap, alignment: .leading)
                    .padding(.leading, 19)
            }
            if model.fixing == row.beat.id, let open = model.fix {
                fix(open.fix, model).padding(.top, 10).padding(.leading, 19)
            }
        }
        .padding(.top, 14)
    }

    /// The targeted micro-pass. One probe, aimed straight at this row — already
    /// written and already paid for on every generation. Getting it right flips
    /// the row green and takes the gap off what will attach to the map: the
    /// difference between reporting a gap and closing one.
    private func fix(_ fix: FeynmanFix, _ model: FeynmanViewModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Kicker("Passagem socrática focada", tint: Phase.feynman.tint)
            Text(verbatim: fix.probe)
                .font(.atlas(.serif, 16))
                .foregroundStyle(Palette.ink)
            ForEach(fix.replies) { reply in
                ChoiceRow(reply.label,
                          mark: model.ruledOut(reply) ? .wrong : .unmarked,
                          chosen: model.ruledOut(reply),
                          enabled: !model.ruledOut(reply)) {
                    model.answerFix(reply)
                }
            }
            if let reaction = model.fixReaction {
                Text(verbatim: reaction)
                    .font(.atlas(.sans, 13.5))
                    .foregroundStyle(Palette.amberInk)
                    .transition(.opacity)
            }
            Button("Fechar") { model.closeFix() }
                .font(.atlas(.sans, 13))
                .foregroundStyle(Palette.inkMuted)
                .frame(minHeight: Metrics.tap, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Palette.cardAlt, in: .rect(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairlineStrong, lineWidth: 1) }
    }

    /// An empty jargon list is a real result — *you explained every term you
    /// used* — and one of the few unambiguous wins this phase can hand out. It
    /// used to be drawn only when the list was non-empty, so the win was never
    /// said out loud.
    @ViewBuilder
    private func jargon(_ model: FeynmanViewModel) -> some View {
        if model.jargon.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Kicker("Jargão", tint: NodeState.mastered.color)
                Text("Você abriu todos os termos que usou. Nenhuma palavra ficou como se eu já a conhecesse.")
                    .font(.atlas(.sans, 13.5))
                    .foregroundStyle(Palette.inkSoft)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Kicker("Jargão que você usou sem abrir")
                Text("Você usou estes termos como se eu já os conhecesse — nomear não é explicar.")
                    .font(.atlas(.sans, 13))
                    .foregroundStyle(Palette.inkMuted)
                FlowChips(model.jargon.map { ($0, NodeState.shaky) })
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @Environment(\.dynamicTypeSize) private var typeSize
}
