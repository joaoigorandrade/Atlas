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
public func resolvePlan(_ kind: NodeKind, _ domain: Domain) -> [Phase] {
    let base = phasePlans[kind] ?? legacyPhasePlan
    guard let rule = domainPlans[domain] else { return base }
    switch rule {
    case .plan(let replacement):
        return replacement
    case .add(let extra):
        let want = Set(base).union(extra)
        return Phase.allCases.filter { want.contains($0) }
    }
}
