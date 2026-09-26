// The domain axis: what settles a claim in this corner of the world. The port
// of `lib/curriculum/domains.ts`.
//
// `NodeKind` says what the learner must be able to *do* — tell instances apart,
// run a sequence, predict what changes. It deliberately does not say what
// subject the node belongs to, and it structurally cannot: "settle it by
// deriving it" and "settle it by reading the source in context" are not two
// kinds of doing, they are two kinds of *warrant*. That is this axis.
//
// The two are orthogonal almost everywhere — a `procedure` exists in every
// domain — which is why this is a second field rather than more `NodeKind`
// cases. `general` behaves exactly as the pre-domain engine did.

/// What settles a claim here.
///
/// The discriminator is the *warrant*, never the subject: history and religion
/// are both `interpretive` because their epistemics are identical — a text, a
/// context, a contested reading, provenance that matters.
///
/// `performative` and `craft` split on one question: **can the app observe the
/// production?** It can hear a spoken sentence and it cannot see a sofa. That
/// decides whether the app grades the work or debriefs the learner about work
/// it never saw, which is a different ladder and a different gate.
public enum Domain: String, Codable, Sendable, CaseIterable {
    /// Derivation from stated rules. Mathematics, logic, theory.
    case formal
    /// It runs, or it fails. Code, engineering, protocols.
    case executable
    /// Measurement, carrying uncertainty. The sciences, medicine.
    case empirical
    /// A source, read in context, contested. History, religion, law.
    case interpretive
    /// Production under real conditions, which the app can observe. Language.
    case performative
    /// Production the app cannot observe — a physical artifact. Woodwork.
    case craft
    /// No stance. The pre-domain default, and the fallback for anything unclear.
    case general
}

/// A domain off the wire, or `general` for anything this build does not know.
/// Lenient for the same reason `asNodeKind` is: a map built by a newer server
/// must still draw here.
public func asDomain(_ raw: String?) -> Domain {
    Domain(rawValue: raw ?? "") ?? .general
}

/// How a domain changes the ladder.
///
/// Two rule shapes, because two genuinely different things happen. `add` merges
/// rungs into whatever the node's kind already runs — this is what gives a
/// `concept` node in a `formal` map something to actually compute, since
/// `phasePlans[.concept]` carries no execution rung at all. `plan` replaces the
/// kind's ladder outright, for the domains where kind stops being the thing
/// that decides: explaining the preterite in your own words is not speaking
/// Spanish, so `performative` takes Socratic, Feynman and Crucible *off*.
public enum DomainPlanRule: Sendable {
    case add([Phase])
    case plan([Phase])
}

public let domainPlans: [Domain: DomainPlanRule] = [
    // A claim is settled by deriving it, so the learner has to derive one.
    .formal: .add([.trace, .perform, .drill]),
    // Same three: reading about a program is not running one.
    .executable: .add([.trace, .perform, .drill]),
    // Settled by measurement, so the test is whether it forecasts one.
    .empirical: .add([.predict, .perform]),
    // A claim is settled by a source read in context, so the learner reads one
    // and then carries the disagreement honestly.
    .interpretive: .add([.provenance, .steelman]),
    // Production the app can hear. Nothing here is served by explaining the
    // language in prose.
    .performative: .plan([.consume, .discriminate, .drill, .produce, .recall, .retain]),
    // Work the app never sees. Predict runs the failures in simulation before
    // the learner runs them in oak; Perform is the debrief of work already done.
    .craft: .plan([.consume, .discriminate, .predict, .perform, .retain]),
]

/// The ladder a `(kind, domain)` pair runs, before anything is stored.
///
/// The merge is a *filter over `Phase.allCases`* rather than a concatenation,
/// which is what makes the subsequence invariant hold by construction: whatever
/// the two tables ask for comes back in canonical order with no duplicates.
///
/// Then the two cost axes only ever *remove* rungs: a support concept drops the
/// depth phases, and Socratic is dropped for an easy concept (and for a support
/// one unless it is hard). Defaults reproduce the pre-axes ladder. Mirrors
/// `resolvePlan` in `phases.ts`.
public func resolvePlan(
    _ kind: NodeKind, _ domain: Domain,
    _ importance: NodeImportance = .core, _ difficulty: NodeDifficulty = .medium
) -> [Phase] {
    let base = phasePlans[kind] ?? legacyPhasePlan
    var want: Set<Phase>
    switch domainPlans[domain] {
    case nil: want = Set(base)
    case .plan(let replacement): want = Set(replacement)
    case .add(let extra): want = Set(base).union(extra)
    }
    let support = importance == .support
    if support { want.subtract([.feynman, .connect, .crucible, .drill, .steelman]) }
    if difficulty == .easy || (support && difficulty != .hard) { want.remove(.socratic) }
    return Phase.allCases.filter { want.contains($0) }
}

/// What settles a claim about this topic, read off the map it produced.
///
/// The port of `topicDomainOf` in `lib/curriculum/domains.ts`. There is no
/// topic-level domain column to read: it was dropped precisely because it could
/// only drift from the nodes it claimed to summarise. The commonest non-general
/// domain among the nodes IS the topic's domain, and a map with none is
/// `general` — which is what a mixed map (an ML course with `formal` and
/// `executable` nodes) should fall back to for a question asked about the whole
/// topic.
public func topicDomainOf(_ nodes: [ConceptNode]) -> Domain {
    var counts: [Domain: Int] = [:]
    for node in nodes {
        guard let domain = node.domain, domain != .general else { continue }
        counts[domain, default: 0] += 1
    }
    // Walked in `allCases` order, first past the post — so a tie always breaks
    // the same way and the same map always answers the same thing. A dictionary
    // walk would not, and the answer reaches a cache key.
    var best: Domain = .general
    var most = 0
    for domain in Domain.allCases where (counts[domain] ?? 0) > most {
        best = domain
        most = counts[domain] ?? 0
    }
    return best
}
