import Foundation

/// The handful of preferences that outlive a launch. Not a settings framework —
/// five keys and the reads that seed the store.
enum Defaults {
    static var goal: GoalKind {
        get { GoalKind(rawValue: UserDefaults.standard.string(forKey: "goal") ?? "") ?? .exam }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: "goal") }
    }
    static var dailyTarget: Int {
        get { dailyTargets.contains(UserDefaults.standard.integer(forKey: "dailyTarget")) ? UserDefaults.standard.integer(forKey: "dailyTarget") : 15 }
        set { UserDefaults.standard.set(newValue, forKey: "dailyTarget") }
    }
    static var language: String {
        get { UserDefaults.standard.string(forKey: "language") ?? AtlasAPI.deviceLanguage }
        set { UserDefaults.standard.set(newValue, forKey: "language") }
    }
    static var dictationOn: Bool {
        get { UserDefaults.standard.object(forKey: "dictation") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "dictation") }
    }
    static var readAloudOn: Bool {
        get { UserDefaults.standard.object(forKey: "readAloud") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "readAloud") }
    }
    static var streak: Int {
        get { UserDefaults.standard.integer(forKey: "streak") }
        set { UserDefaults.standard.set(newValue, forKey: "streak") }
    }
    static var lastActiveDay: String {
        get { UserDefaults.standard.string(forKey: "lastActiveDay") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "lastActiveDay") }
    }
}
