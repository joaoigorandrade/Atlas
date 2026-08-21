import Observation
import SwiftUI

/// Screen 14's state: the sections that have landed, which one is being read,
/// and whether its check has been passed. The view renders this and nothing
/// else — including the segment rail, whose colours are prepared here so `body`
/// isn't mapping an array every redraw.
@Observable
@MainActor
final class ConsumeViewModel {
    private(set) var chunks: [ConsumeChunk] = []
    /// The stream is still going — the last section on screen isn't the last one.
    private(set) var writing = true
    private(set) var index = 0
    /// The check's picked option for the section on screen — reset per section.
    private(set) var picked: Int?
    private(set) var message = ""
    /// Which lens is open over the prose, if any. Bound by the sheet.
    var lens: AltKey?
    let speaker = Speaker()

    private let session: SessionViewModel
    private let api: AtlasAPI

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    var chunk: ConsumeChunk? { chunks[safe: index] }
    var next: ConsumeChunk? { chunks[safe: index + 1] }

    /// A section closes on its check: getting it right is what earns Continue.
    var passed: Bool {
        guard let check = chunk?.check else { return true }
        guard let picked else { return false }
        return check.opts[safe: picked]?.correct == true
    }

    /// One colour per landed section, prepared outside the layout pass.
    private(set) var rail: [Color?] = []

    /// The prose as it is spoken — the section on screen, nothing around it.
    var spoken: String { chunk?.body.joined(separator: " ") ?? "" }

    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo sua leitura…") : message }

    func load() async {
        do {
            for try await landed in await api.consume(session.context) {
                chunks = landed
                rebuildRail()
            }
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever sua leitura"))
        }
        writing = false
    }

    func pick(_ option: Int) {
        guard picked == nil else { return }
        picked = option
    }

    func advance() {
        speaker.stop()
        withAnimation(Motion.standard) {
            index += 1
            picked = nil
            rebuildRail()
        }
    }

    /// The lens opens over the prose; the section behind it is never swapped.
    func open(_ lens: AltKey) { self.lens = lens }

    func toggleReadAloud() { speaker.toggle(spoken, api: api) }

    /// Handing to the next phase is the only thing this screen writes.
    func finish() {
        guard passed else { return }
        speaker.stop()
        session.advance()
    }

    /// The lens context: the section on screen, so the model view walks *this*
    /// material rather than the concept in general.
    func lensContext(_ lens: AltKey) -> [String: JSONValue]? {
        guard let chunk else { return nil }
        var context = session.context
        context["lens"] = .string(lens.rawValue)
        context["kicker"] = .string(chunk.kicker)
        context["sectionBody"] = .array(chunk.body.map { .string($0) })
        context["takeaway"] = .string(chunk.takeaway)
        return context
    }

    private func rebuildRail() {
        rail = chunks.indices.map {
            $0 < index ? Palette.accent : ($0 == index ? NodeState.frontier.color : nil)
        }
    }
}
