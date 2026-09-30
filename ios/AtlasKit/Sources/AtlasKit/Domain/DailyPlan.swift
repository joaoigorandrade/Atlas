import Foundation

// One plan for the day across every map (W4.6) — the port of `dailyPlan.ts`.
// Per map, what today asks of it: the cards due, then the next rung that is
// actually open (in-progress work first, then the goal's frontier, skipping a
// gate held until tomorrow). Ranked by what is due and how close the map's
// date is, and taken until the learner's daily minutes are spent.

public struct DayItem: Identifiable, Equatable, Sendable {
    public var id: String { subject }
    public let subject: String
    public let due: Int
    public let nextLabel: String?
    public let nextPhase: Phase?
    public let daysLeft: Int?
    public let minutes: Int
}

@MainActor
func dayItem(_ map: AtlasRun, now: Date) -> DayItem {
    let due = AtlasStore.due(map.cards)
    let display = displayStates(map.states, map.graph)
    let inFlight = map.graph.nodes.filter {
        $0.gap != true && (display[$0.id] == .learning || display[$0.id] == .shaky)
    }
    let nowMs = now.timeIntervalSince1970 * 1000
    var next: (String, Phase)?
    for node in inFlight + orderedFrontier(display, map.graph, map.goal) {
        guard let phase = primaryPhase(node.plan, map.phasesDone[node.id] ?? [],
                                       state: display[node.id] ?? .unknown) else { continue }
        if case .number(let opens)? = map.phaseProgress[node.id]?.fields?[phase.rawValue]?.fields?["opensAt"],
           opens > nowMs { continue }
        next = (node.label, phase)
        break
    }
    var daysLeft: Int?
    if let date = try? Date(map.examDate, strategy: isoDay),
       let days = Calendar.current.dateComponents(
           [.day], from: Calendar.current.startOfDay(for: now), to: date
       ).day, days > 0 {
        daysLeft = days
    }
    let minutes = Int((Double(due) * cardMinutes + Double(next?.1.minutes ?? 0)).rounded())
    return DayItem(subject: map.subject, due: due, nextLabel: next?.0, nextPhase: next?.1,
                   daysLeft: daysLeft, minutes: minutes)
}

/// ponytail: a date counts as thirty due cards spread over the days left —
/// the same heuristic as the web; tune once real deadlines exist.
private func urgency(_ item: DayItem) -> Double {
    Double(item.due) + (item.daysLeft.map { 30 / Double($0) } ?? 0)
}

@MainActor
public func dailyPlan(_ maps: [AtlasRun], targetMinutes: Int, now: Date = .now) -> [DayItem] {
    let items = maps.map { dayItem($0, now: now) }
        .filter { $0.due > 0 || $0.nextPhase != nil }
        .sorted { urgency($0) > urgency($1) }
    // The day's budget: maps in order until the minutes are spent — always one.
    var spent = 0
    return items.enumerated().compactMap { index, item in
        guard index == 0 || spent + item.minutes <= targetMinutes else { return nil }
        spent += item.minutes
        return item
    }
}
