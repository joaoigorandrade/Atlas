import Foundation
import UserNotifications

/// The daily review reminder. Spaced repetition only works if the learner comes
/// back when the cards are due, and nothing brought them back.
///
/// ponytail: one repeating local notification at the time the learner picks,
/// with generic copy. Scheduling at each card's real due date, or a count in
/// the body, needs a background refresh to stay true; add it if a fixed daily
/// nudge proves too blunt.
enum Reminders {
    private static let id = "atlas.review"

    /// Schedule or cancel to match `Defaults`. False when the learner has
    /// refused notifications for the app — the toggle cannot work until they
    /// allow them in the system settings.
    @discardableResult
    static func apply() async -> Bool {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        guard Defaults.reminderOn else { return true }
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        guard granted else { return false }

        let content = UNMutableNotificationContent()
        content.title = String(localized: "Hora da revisão")
        content.body = String(localized: "Alguns cartões estão prestes a esfriar — poucos minutos agora seguram o que você aprendeu.")
        content.sound = .default
        var when = DateComponents()
        when.hour = Defaults.reminderMinutes / 60
        when.minute = Defaults.reminderMinutes % 60
        let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: true)
        try? await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
        return true
    }
}
