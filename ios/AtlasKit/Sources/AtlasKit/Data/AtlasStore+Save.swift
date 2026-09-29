import Foundation

// Saving the open run: what a write diffs against, the debounce, and the one
// write on the wire at a time. Split out of `AtlasStore.swift` by reason to
// change — this half moves when the wire format does, not when a screen does.

extension AtlasStore {
    // MARK: - What a write compares against
    //
    // A node, a card, the topic's own fields and the profile, each reduced to
    // the JSON of exactly what is persisted about it. Comparing strings is what
    // makes the diff one line per row rather than a field-by-field equality
    // function that has to be updated every time a column is added — and a
    // string that differs is, by construction, a row that has to be written.

    func nodeShots() -> [String: String] {
        var shots: [String: String] = [:]
        for node in graph.nodes {
            let fields: [String: JSONValue] = [
                "label": .string(node.label),
                "summary": node.summary.map(JSONValue.string) ?? .null,
                "g": .number(Double(node.g)),
                "week": .number(Double(node.week)),
                "x": .number(node.x),
                "y": .number(node.y),
                "isGap": .bool(node.gap == true),
                // `frontier` is derived from the prerequisites on every read, in
                // both clients, and never lands in `StateMap` — so this is a
                // straight copy with the node's generated seed as the fallback.
                "state": .string((states[node.id] ?? node.state).rawValue),
                "shakyReason": shakyReasons[node.id].map { .string($0.rawValue) } ?? .null,
                // The ledger is in the projection because it is a *stored*
                // field and state is derived from it: a save that carried the
                // state and not the record it came from would re-derive a
                // different state the next time the run was opened.
                "phasesDone": .array((phasesDone[node.id] ?? []).map { .string($0.rawValue) }),
                "reviewed": .bool(reviewed.contains(node.id)),
                "consumeProgress": consumeProgress[node.id] ?? .null,
                "socraticProgress": socraticProgress[node.id] ?? .null,
                "feynmanProgress": feynmanProgress[node.id] ?? .null,
                "connectProgress": connectProgress[node.id] ?? .null,
                "phaseProgress": phaseProgress[node.id] ?? .null,
            ]
            shots[node.id] = JSONValue.object(fields).compact
        }
        return shots
    }

    func cardShots() -> [String: String] {
        var shots: [String: String] = [:]
        for card in cards { shots[card.id] = (try? JSONValue(encoding: card))?.compact ?? card.id }
        return shots
    }

    /// The topic's own fields, as the PATCH sends them — and, compacted, the
    /// shot a save diffs against. One body, so the two can't drift.
    private func topicBody() -> JSONValue {
        .object([
            "goal": .string(goal.rawValue),
            "interests": .string(interests),
            "paretoPct": .number(Double(paretoPct)),
            "examDate": .string(examDate),
            "language": .string(language),
            "calibSamples": (try? JSONValue(encoding: calib)) ?? .array([]),
            "misconceptions": (try? JSONValue(encoding: misconceptions)) ?? .array([]),
        ])
    }

    func topicShot() -> String { topicBody().compact }

    /// Something the learner did that the server has not acknowledged yet.
    var unsaved: Bool {
        pendingSave != nil || saving != nil
            || savedNodes != nodeShots() || savedCards != cardShots() || savedTopic != topicShot()
    }

    /// The live run as a row — every persisted field, in one place. The mirror
    /// copy written after a save listed them by hand and had dropped five, so
    /// an offline relaunch reopened with the old goal and content language.
    private func currentRun(over base: AtlasRun) -> AtlasRun {
        var run = base
        run.subject = subject
        run.goal = goal
        run.interests = interests
        run.paretoPct = paretoPct
        run.examDate = examDate
        run.language = language
        run.calibSamples = calib
        run.graph = graph
        run.states = states
        run.shakyReasons = shakyReasons
        run.phasesDone = phasesDone
        run.reviewedNodes = reviewed.sorted()
        run.consumeProgress = consumeProgress
        run.socraticProgress = socraticProgress
        run.feynmanProgress = feynmanProgress
        run.connectProgress = connectProgress
        run.phaseProgress = phaseProgress
        run.misconceptions = misconceptions
        run.cards = cards
        return run
    }

    static func profileShot(target: Int, streak: Int, day: String) -> String {
        JSONValue.object([
            "dailyTarget": .number(Double(target)),
            "streak": .number(Double(streak)),
            "lastDay": .string(day),
        ]).compact
    }

    /// Persist the open run a beat after the last change. Every write the
    /// learner makes lands here — a graded card, a spawned gap, a settings tap
    /// — so the debounce is what keeps a session from being one request per tap.
    func saveSoon() {
        guard !quiet, signedIn else { return }
        saveIn(pacing.change)
    }

    /// Arm the one pending write. Two seconds behind a change, fifteen behind a
    /// failure — a phone in a tunnel must not retry every two seconds all
    /// afternoon, and any change the learner makes supersedes the retry anyway.
    private func saveIn(_ delay: Duration) {
        pendingSave?.cancel()
        pendingSave = Task {
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            // Let go of the handle before flushing: `saveNow` cancels whatever
            // is pending, and that used to be *this* task — which cancelled the
            // write it had just started and dropped it on the floor.
            pendingSave = nil
            await saveNow()
        }
    }

    /// Write what changed.
    ///
    /// The whole run used to go up on every tick, which is why the generated
    /// content had to be split into a second column on a longer debounce so a
    /// node drag would stop re-uploading every section the learner had read.
    /// Neither is needed now: content is never uploaded at all, and this sends
    /// a payload the size of what actually moved.
    ///
    /// A failure is kept — `saveFailed` draws the chip and a retry is armed, so
    /// a session worked through offline lands as soon as there is signal.
    ///
    /// One at a time. `saveIn` lets go of its handle before it gets here, so a
    /// second debounce, a map switch or a sign-out could start a write while
    /// one was still on the wire: both diffed against the same baseline, sent
    /// the same changes, and could land out of order — the server keeping the
    /// older node while the baseline said the newer one was saved. A caller
    /// arriving mid-write waits for it, then writes whatever is left.
    func saveNow() async {
        pendingSave?.cancel()
        pendingSave = nil
        while let running = saving { await running.value }
        // The task lets go of the slot itself, as its last step: cleared after
        // the `await` instead, a caller woken by the same completion re-read
        // the finished task and spun on it before this line could run.
        let write = Task {
            await self.write()
            self.saving = nil
        }
        saving = write
        await write.value
    }

    private func write() async {
        guard signedIn else { return }
        // A session that is present but dead — the access token expired and the
        // refresh was refused — leaves `signedIn` true forever, because it is
        // `session != nil`. This used to return silently, having just cancelled
        // the queued save: the profile screen still showed the email and "Sair"
        // while every write went nowhere. Say so and keep trying, the way every
        // other failure in this function does.
        guard var token = await bearer() else {
            saveFailed = true
            saveIn(pacing.retry)
            return
        }

        let profile = Self.profileShot(target: dailyTarget, streak: streak, day: lastActiveDay)
        let nodes = nodeShots()
        let cardsNow = cardShots()
        let topic = topicShot()
        let epoch = runEpoch
        // The PATCH moves the row's `updated_at`; the mirror has to follow, or
        // the next launch reads its own write as another device's and re-opens.
        var touched = false

        do {
            if profile != savedProfile {
                try await runs.patchProfile(.object([
                    "dailyTarget": .number(Double(dailyTarget)),
                    "language": .string(language),
                    "adherence": .object([
                        "streak": .number(Double(streak)),
                        "lastDay": .string(lastActiveDay),
                    ]),
                ]), token: token)
                savedProfile = profile
            }
            // A run whose row never landed is not a run with nothing to save —
            // it is the one that most needs saving. `ensureTopic` makes it, and
            // a failure arms the retry instead of dropping the map on the floor.
            guard let topicId = await ensureTopic(token: token) else {
                if !subject.isEmpty {
                    saveFailed = true
                    saveIn(pacing.retry)
                }
                return
            }
            guard epoch == runEpoch else { return }

            var deltas: [NodeDelta] = []
            for node in graph.nodes where savedNodes[node.id] != nodes[node.id] {
                var delta = NodeDelta(id: node.id)
                delta.label = node.label
                delta.summary = node.summary
                delta.g = node.g
                delta.week = node.week
                delta.x = node.x
                delta.y = node.y
                delta.isGap = node.gap == true
                delta.state = states[node.id] ?? node.state
                delta.shakyReason = .some(shakyReasons[node.id])
                delta.phasesDone = phasesDone[node.id] ?? []
                delta.reviewed = reviewed.contains(node.id)
                delta.consumeProgress = consumeProgress[node.id]
                delta.socraticProgress = socraticProgress[node.id]
                delta.feynmanProgress = feynmanProgress[node.id]
                delta.connectProgress = connectProgress[node.id]
                delta.phaseProgress = phaseProgress[node.id]
                // Only a node the server has never seen needs its edges; an
                // existing one's prerequisites are already rows, and re-sending
                // them on every drag would be the write amplification this
                // whole change replaced.
                if savedNodes[node.id] == nil {
                    delta.prereqs = graph.edges.filter { $0.to == node.id }.map(\.from)
                    // Both columns are NOT NULL with a default, and a delta that
                    // names neither lets the default stand — which is what a
                    // spawned gap wants. A node that carries them says so once,
                    // on the write that creates the row, and never again.
                    delta.kind = node.kind
                    delta.domain = node.domain
                    delta.importance = node.importance
                    delta.difficulty = node.difficulty
                    delta.phasePlan = node.phasePlan
                }
                deltas.append(delta)
            }
            let removed = savedNodes.keys.filter { nodes[$0] == nil }
            if !deltas.isEmpty || !removed.isEmpty {
                try await runs.patchNodes(topicId, deltas: deltas, remove: Array(removed), token: token)
                guard epoch == runEpoch else { return }
                savedNodes = nodes
            }

            let changed = cards.filter { savedCards[$0.id] != cardsNow[$0.id] }
            if !changed.isEmpty {
                try await runs.putCards(topicId, cards: changed, token: token)
                guard epoch == runEpoch else { return }
                savedCards = cardsNow
            }

            if topic != savedTopic {
                try await runs.patchTopic(topicId, body: topicBody(), token: token)
                guard epoch == runEpoch else { return }
                savedTopic = topic
                touched = true
            }
        } catch {
            // A 401 means the token died between the check above and the write.
            // Renewing and arming a retry is the difference between a save that
            // lands and an afternoon of work nobody knows is unsaved.
            if (error as? AtlasError)?.code == "auth", let renewed = await bearer(renew: true) {
                token = renewed
            }
            // A 404 means the row this run is addressed to is gone — deleted
            // from another device, or a create that never landed. The id is the
            // thing that is wrong, and `ensureTopic` returns a cached one
            // unconditionally, so the armed retry re-addressed the same dead id
            // every fifteen seconds forever and nothing the learner did was
            // ever saved. Dropping it makes the retry create a fresh row and
            // re-send the whole run to it.
            if (error as? AtlasError)?.status == 404, epoch == runEpoch { forgetTopicRow() }
            saveFailed = true
            saveIn(pacing.retry)
            return
        }
        saveFailed = false
        // The learner can have signed out — or signed in as somebody else —
        // while those writes were in flight.
        guard session?.accessToken == token else { return }
        guard epoch == runEpoch else { return }
        if let index = library.firstIndex(where: { $0.id == topicId }) {
            library[index] = currentRun(over: library[index])
            if touched { library[index].updatedAt = ISODate.now() }
            // The mirror holds what the server acknowledged, never what the
            // screen hopes it did — so it is written here, after the write
            // landed, and not beside the state change that caused it.
            local.save(library[index])
        }
    }
}
