import Foundation

/// The model writes markdown emphasis into its prose, and the reading pass is
/// where that shows: `Text(verbatim:)` put the `*asterisks*` on screen, one per
/// emphasised term, in the longest surface in the app.
///
/// The port of `lib/rich.ts`, and for the same reason it is one function rather
/// than two — what is drawn and what is spoken have to be the same string, or a
/// voice reads "asterisk linearmente independente asterisk" over prose that
/// shows neither. `Text(_ key:)` would parse the markdown but also look the
/// whole paragraph up as a localization key; `AttributedString` does exactly
/// the first and nothing else.
public enum Markdown {
    /// The prose with its emphasis rendered rather than printed.
    public static func rich(_ text: String) -> AttributedString {
        // `inlineOnlyPreservingWhitespace`: a section body is paragraphs, not a
        // document — full parsing would eat the leading spaces of a worked step
        // and read a lone `1.` as a list.
        (try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(text)
    }

    /// The same string with the markers gone and no styling — what the voice is
    /// handed, so it speaks what the reader sees.
    public static func plain(_ text: String) -> String { String(rich(text).characters) }
}
