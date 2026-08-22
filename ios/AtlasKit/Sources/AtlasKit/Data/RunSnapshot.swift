import Foundation

/// One row of `run_states` — a whole run, as the app reads and writes it.
///
/// **The web app owns this format.** `lib/persistence.ts` defines `RunSnapshot`
/// at v9 and writes far more of it than this client has screens for: node
/// positions, unfinished Socratic and Feynman passes, the run-wide misconception
/// roll-up. So the decode here is partial on purpose, and the encode is a
/// *merge* — every key this file does not name is carried back exactly as it
/// arrived. Without that, opening the app on a phone would silently discard a
/// week of work done in the browser, because the browser rebuilds the whole
/// snapshot literal on every save and cannot preserve what it never loaded.
///
/// ponytail: partial, not a port. The one field that genuinely cannot be shared
/// is the card queue — the web schedules with FSRS and this client with SM-2
/// (`ScheduledCard`), so its cards travel under `iosCards` and the web's `cards`
/// key rides through the merge untouched. Fold the two together when the SM-2
/// note in `Retain.swift` is paid off.
public struct RunSnapshot: Sendable, Identifiable {
    /// Half the primary key — `(user_id, subject)`. Renaming it writes a new row.
    public var subject: String
    public var graph = ConceptGraph()
    public var states: StateMap = [:]
    public var interests = ""
    public var goal: GoalKind = .exam
    public var target = 15
    /// The language the *content* was generated in, which is a property of the
    /// run and not of the device reading it. Nil on a row written before the
    /// field existed: guessing would freeze the wrong answer permanently.
    public var language: String?
    public var calib: [CalibSample] = []
    public var reviewed: Set<String> = []
    public var cards: [ScheduledCard] = []
    /// Where the learner got to in each node's reading pass. Shared with the
    /// web whole — the keys only its screens fill in ride along inside each
    /// record, the same way this row's do (`ConsumeProgress`).
    public var consumeProgress: [String: ConsumeProgress] = [:]

    /// The web's `form` and `adherence` objects, held whole. This client owns
    /// four keys of the first and one of the second; the exam date, the banked
    /// freezes and the two-week history belong to screens only the browser has.
    private var form: [String: JSONValue] = [:]
    private var adherence: [String: JSONValue] = [:]
    /// Every other key in the row, untouched. See the note above.
    private var extras: [String: JSONValue] = [:]

    public var id: String { subject }

    public init(subject: String) { self.subject = subject }
}

// MARK: - The wire form

public extension RunSnapshot {
    /// Every snapshot version the web's loader accepts. A row outside this set
    /// is not a run this app can read, and is skipped rather than guessed at.
    static let versions: ClosedRange<Double> = 1...9

    /// Read a row. Nil when the `snapshot` column holds something this app has
    /// no version for — a future format, or a half-written row.
    init?(subject: String, snapshot: JSONValue) {
        guard let row = snapshot.fields,
              case .number(let version)? = row["v"], Self.versions.contains(version)
        else { return nil }
        self.init(subject: subject)
        form = row["form"]?.fields ?? [:]
        adherence = row["adherence"]?.fields ?? [:]
        graph = Self.read(row, "graph") ?? ConceptGraph()
        states = Self.read(row, "states") ?? [:]
        interests = Self.read(form, "interests") ?? ""
        goal = Self.read(form, "goal") ?? .exam
        target = Self.read(form, "target") ?? 15
        language = Self.read(row, "language")
        calib = Self.read(row, "calibSamples") ?? []
        reviewed = Set(Self.read(row, "reviewedNodes") ?? [String]())
        cards = Self.read(row, "iosCards") ?? []
        consumeProgress = Self.read(row, "consumeProgress") ?? [:]
        // Everything this client renders is now held as itself; the rest stays
        // as JSON so the merge below can hand it straight back.
        extras = row
        for key in ["v", "form", "adherence", "graph", "states", "language",
                    "calibSamples", "reviewedNodes", "iosCards", "consumeProgress"] {
            extras[key] = nil
        }
    }

    /// The row to upsert: this client's state written over the one it loaded.
    var snapshot: JSONValue {
        var row = extras
        row["v"] = .number(9)
        row["graph"] = (try? JSONValue(encoding: graph)) ?? .object([:])
        row["states"] = (try? JSONValue(encoding: states)) ?? .object([:])
        row["calibSamples"] = (try? JSONValue(encoding: calib)) ?? .array([])
        row["reviewedNodes"] = .array(reviewed.sorted().map(JSONValue.string))
        row["iosCards"] = (try? JSONValue(encoding: cards)) ?? .array([])
        row["consumeProgress"] = (try? JSONValue(encoding: consumeProgress)) ?? .object([:])
        if let language { row["language"] = .string(language) }

        var form = self.form
        form["topic"] = .string(subject)
        form["goal"] = .string(goal.rawValue)
        form["interests"] = .string(interests)
        form["target"] = .number(Double(target))
        // The web reads `form.examDate` and `adherence.lastDay` on load without
        // guarding either, so a row this client wrote first has to carry both
        // objects in full — a missing key there is a crash in the browser, not
        // a default.
        form["examDate"] = form["examDate"] ?? .string("")
        row["form"] = .object(form)
        row["adherence"] = .object(Self.whole(adherence))

        // Same reason: three more keys the web assigns straight into state
        // without a fallback of its own.
        row["positions"] = row["positions"] ?? .object([:])
        row["spawnedIds"] = row["spawnedIds"] ?? .array(
            graph.nodes.filter { $0.gap == true }.map { .string($0.id) }
        )
        row["litToday"] = row["litToday"] ?? .array([])
        return .object(row)
    }

    /// Share of the map learned at least once — the dashboard card's figure.
    /// Read from a row exactly the way `AtlasStore` reads it from the open run.
    var mastered: Double {
        guard !graph.nodes.isEmpty else { return 0 }
        let count = graph.nodes.filter { (states[$0.id] ?? .unknown) == .mastered }.count
        return Double(count) / Double(graph.nodes.count)
    }

    /// `displayStates` is the one derivation of the frontier, here too.
    var frontierCount: Int {
        displayStates(states, graph).values.filter { $0 == .frontier }.count
    }

    private static func read<T: Decodable>(_ row: [String: JSONValue], _ key: String) -> T? {
        guard let value = row[key] else { return nil }
        return try? value.decode(T.self)
    }

    /// An `AdherenceState` the web can load: whatever the row carried, with
    /// every key it needs present. The streak itself is the device's — this
    /// client counts it in `UserDefaults` and the two do not agree yet.
    private static func whole(_ adherence: [String: JSONValue]) -> [String: JSONValue] {
        var whole = adherence
        for (key, fallback): (String, JSONValue) in [
            ("streak", .number(0)), ("best", .number(0)), ("freezes", .number(0)),
            ("metToday", .bool(false)), ("usualTime", .string("")),
            ("reminderOn", .bool(false)), ("history", .array([])), ("lastDay", .string("")),
        ] {
            whole[key] = whole[key] ?? fallback
        }
        return whole
    }
}
