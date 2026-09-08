import Foundation
import SwiftData

/// The on-device mirror of what the server holds.
///
/// Before this, nothing survived the process: no SwiftData, no Core Data, no
/// file cache. A relaunch always waited on the network, and a relaunch with no
/// network showed "não foi possível carregar seus mapas" over a map the phone
/// had drawn ten seconds earlier. The row was in Postgres and nowhere else.
///
/// What it is for: paint first, then revalidate. `loadLibrary` reads here and
/// draws, and the bootstrap request updates behind an already-interactive map.
/// It is a cache of the API's answers, not a second source of truth — every
/// write still goes to the server, and a conflict is settled by `updatedAt`.
///
/// ponytail: three models and no migration plan. The store is disposable — if
/// its schema ever changes under a build, deleting the file and re-fetching is
/// correct, and `LocalStore.open` does exactly that rather than carrying a
/// versioning ladder for a cache.
@Model
public final class LocalTopic {
    #Index<LocalTopic>([\.id])
    @Attribute(.unique) public var id: String
    public var subject: String
    public var updatedAt: String
    /// The topic exactly as `/api/v1` sent it. Held whole rather than shredded
    /// into columns: this is a cache of one JSON answer, and re-deriving the
    /// answer from parts is how a mirror starts disagreeing with its source.
    public var payload: Data

    public init(id: String, subject: String, updatedAt: String, payload: Data) {
        self.id = id
        self.subject = subject
        self.updatedAt = updatedAt
        self.payload = payload
    }
}

/// One generated payload, mirrored. Same address as `node_content` on the
/// server: a topic, a node, a kind and the variant that distinguishes two
/// walkthroughs of the same section.
@Model
public final class LocalContent {
    #Index<LocalContent>([\.topicId])
    @Attribute(.unique) public var key: String
    public var topicId: String
    public var nodeId: String
    public var kind: String
    public var variant: String
    public var payload: Data

    public init(topicId: String, nodeId: String, kind: String, variant: String, payload: Data) {
        key = "\(topicId)|\(nodeId)|\(kind)|\(variant)"
        self.topicId = topicId
        self.nodeId = nodeId
        self.kind = kind
        self.variant = variant
        self.payload = payload
    }
}

/// The mirror's front door. One container, opened once, and every method a
/// no-op when it could not be opened — a cache that fails must cost a network
/// round trip, never a screen.
@MainActor
public final class LocalStore {
    private let context: ModelContext?

    /// `inMemory` is for tests: the mirror is a file in Application Support, and
    /// a suite that shares one would have each case opening the maps the last
    /// one left behind.
    public init(inMemory: Bool = false) {
        context = Self.open(inMemory: inMemory).map(ModelContext.init)
    }

    /// A store that could not be opened is almost always a schema this build no
    /// longer understands. Deleting and re-creating is the right answer for a
    /// cache: everything in it is re-fetchable, and refusing to launch over it
    /// would be a crash on the one screen that has nothing to do with content.
    private static func open(inMemory: Bool) -> ModelContainer? {
        let schema = Schema([LocalTopic.self, LocalContent.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: inMemory)
        if let container = try? ModelContainer(for: schema, configurations: config) {
            return container
        }
        try? FileManager.default.removeItem(at: config.url)
        return try? ModelContainer(for: schema, configurations: config)
    }

    // MARK: - Topics

    /// Every mirrored topic, freshest first — the same order the API answers in,
    /// so a cold launch draws the map the learner left open.
    public func topics() -> [AtlasRun] {
        guard let context else { return [] }
        let descriptor = FetchDescriptor<LocalTopic>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        guard let rows = try? context.fetch(descriptor) else { return [] }
        return rows.compactMap { try? JSONDecoder().decode(AtlasRun.self, from: $0.payload) }
    }

    /// Replace the mirror with what the server just sent. A whole-library
    /// replace rather than a merge: the bootstrap answer *is* the library, and a
    /// topic missing from it is one that was deleted somewhere else.
    public func replace(topics: [AtlasRun]) {
        guard let context else { return }
        let live = Set(topics.map(\.id))
        if let existing = try? context.fetch(FetchDescriptor<LocalTopic>()) {
            for row in existing where !live.contains(row.id) {
                context.delete(row)
                deleteContent(for: row.id)
            }
        }
        for topic in topics { save(topic) }
        try? context.save()
    }

    /// Mirror one topic. Called on every load and on every successful write, so
    /// the local copy is what the server last acknowledged.
    public func save(_ topic: AtlasRun) {
        guard let context, let payload = try? JSONEncoder().encode(topic) else { return }
        let id = topic.id
        let descriptor = FetchDescriptor<LocalTopic>(predicate: #Predicate { $0.id == id })
        if let existing = try? context.fetch(descriptor).first {
            existing.subject = topic.subject
            existing.updatedAt = topic.updatedAt
            existing.payload = payload
        } else {
            context.insert(LocalTopic(
                id: topic.id, subject: topic.subject,
                updatedAt: topic.updatedAt, payload: payload
            ))
        }
        try? context.save()
    }

    /// Drop a topic and everything mirrored under it — the local half of the
    /// cascade the foreign keys make on the server.
    public func delete(topicId: String) {
        guard let context else { return }
        let descriptor = FetchDescriptor<LocalTopic>(predicate: #Predicate { $0.id == topicId })
        for row in (try? context.fetch(descriptor)) ?? [] { context.delete(row) }
        deleteContent(for: topicId)
        try? context.save()
    }

    // MARK: - Generated content

    public func content(topicId: String) -> [RunStore.ContentItem] {
        guard let context else { return [] }
        let descriptor = FetchDescriptor<LocalContent>(
            predicate: #Predicate { $0.topicId == topicId }
        )
        guard let rows = try? context.fetch(descriptor) else { return [] }
        return rows.compactMap { row in
            guard let payload = try? JSONDecoder().decode(JSONValue.self, from: row.payload)
            else { return nil }
            return RunStore.ContentItem(
                nodeId: row.nodeId, kind: row.kind, variant: row.variant, payload: payload
            )
        }
    }

    public func save(_ items: [RunStore.ContentItem], topicId: String) {
        guard let context, !items.isEmpty else { return }
        for item in items {
            guard let payload = try? JSONEncoder().encode(item.payload) else { continue }
            let key = "\(topicId)|\(item.nodeId)|\(item.kind)|\(item.variant)"
            let descriptor = FetchDescriptor<LocalContent>(predicate: #Predicate { $0.key == key })
            if let existing = try? context.fetch(descriptor).first {
                existing.payload = payload
            } else {
                context.insert(LocalContent(
                    topicId: topicId, nodeId: item.nodeId, kind: item.kind,
                    variant: item.variant, payload: payload
                ))
            }
        }
        try? context.save()
    }

    /// Everything the learner had. Sign-out clears it: the next person to hold
    /// the phone must not open somebody else's map.
    public func clear() {
        guard let context else { return }
        try? context.delete(model: LocalTopic.self)
        try? context.delete(model: LocalContent.self)
        try? context.save()
    }

    private func deleteContent(for topicId: String) {
        guard let context else { return }
        let descriptor = FetchDescriptor<LocalContent>(
            predicate: #Predicate { $0.topicId == topicId }
        )
        for row in (try? context.fetch(descriptor)) ?? [] { context.delete(row) }
    }
}
