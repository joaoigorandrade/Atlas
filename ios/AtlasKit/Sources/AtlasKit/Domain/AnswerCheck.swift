import Foundation

// Grading an answer the learner produced, without asking a model. The port of
// `lib/curriculum/answerCheck.ts`.
//
// The placement sits on the onboarding path, where a round trip to a model per
// answer would BE the experience — so a `compute`, `speak` or `order` probe is
// ruled on here, on the device, in microseconds.
//
// Deliberately not an expression evaluator. It reads the shapes a learner
// actually types — an integer, a decimal, a fraction, a percentage, scientific
// notation — and anything else simply does not match. No regex, because every
// pattern here is cheaper to read as the string walk it already is.

/// Relative tolerance. 0.5% accepts 0.333 for 1/3 and rejects 0.33, which is
/// roughly where a human grader draws the line on a placement question.
public let numericTolerance = 5e-3

/// The currencies a learner may put in front of a value the question already
/// fixed. `r$` is lowercase because the whole string is lowercased first.
private let currencies = ["r$", "$", "€", "£"]

private func isASCIIDigit(_ c: Character) -> Bool { c.isASCII && c.isNumber }

/// `-?\d*\.?\d+` — digits, an optional point, and at least one digit after it.
/// "5." is not a number a learner means; ".5" is.
private func isDecimal(_ raw: String) -> Bool {
    var s = raw
    if s.hasPrefix("-") { s.removeFirst() }
    guard let last = s.last, isASCIIDigit(last) else { return false }
    return s.allSatisfy { isASCIIDigit($0) || $0 == "." }
        && s.filter { $0 == "." }.count <= 1
}

private func isInteger(_ raw: String) -> Bool {
    var s = raw
    if s.hasPrefix("-") { s.removeFirst() }
    return !s.isEmpty && s.allSatisfy(isASCIIDigit)
}

/// A bare decimal, with or without an exponent.
private func decimal(_ s: String) -> Double? {
    var body = s
    var exponent = ""
    if let e = body.firstIndex(of: "e") {
        exponent = String(body[body.index(after: e)...])
        body = String(body[..<e])
        guard isInteger(exponent) else { return nil }
    }
    guard isDecimal(body) else { return nil }
    guard let v = Double(exponent.isEmpty ? body : "\(body)e\(exponent)"), v.isFinite else {
        return nil
    }
    return v
}

/// The number a learner's answer denotes, or nil when it denotes none.
public func parseNumber(_ raw: String) -> Double? {
    var s = raw.lowercased().filter { !$0.isWhitespace }
    guard !s.isEmpty else { return nil }

    for symbol in currencies where s.hasPrefix(symbol) {
        s.removeFirst(symbol.count)
        break
    }

    // A trailing unit the question already fixed — "12cm", "30°" — comes off,
    // so a right answer is not marked wrong for being labelled. A bare percent
    // stays: it scales the value rather than naming it.
    var tail = ""
    while let last = s.last, last.isLetter || last == "°" || last == "%" {
        tail.insert(last, at: tail.startIndex)
        s.removeLast()
    }
    let percent = tail == "%"
    guard !s.isEmpty else { return nil }

    // Comma decimals are not a typo — they are how half the app's users write a
    // number, and pt-BR is one of the two shipped languages.
    if s.filter({ $0 == "," }).count == 1, let comma = s.firstIndex(of: ",") {
        let before = String(s[s.startIndex..<comma])
        let after = String(s[s.index(after: comma)...])
        if isInteger(before), !after.isEmpty, after.allSatisfy(isASCIIDigit) {
            s = "\(before).\(after)"
        }
    }

    // A fraction is an answer, not a division the learner failed to finish.
    if s.filter({ $0 == "/" }).count == 1, let slash = s.firstIndex(of: "/") {
        guard let top = decimal(String(s[s.startIndex..<slash])),
              let bottom = decimal(String(s[s.index(after: slash)...])),
              bottom != 0
        else { return nil }
        return percent ? top / bottom / 100 : top / bottom
    }

    // 3x10^2 and 3e2 are the same answer written two ways.
    for marker in ["x10^", "*10^", "x10", "*10"] where s.contains(marker) {
        let parts = s.components(separatedBy: marker)
        guard parts.count == 2, let base = decimal(parts[0]), isInteger(parts[1]),
              let power = Int(parts[1])
        else { return nil }
        let v = base * pow(10, Double(power))
        return percent ? v / 100 : v
    }

    guard let v = decimal(s) else { return nil }
    return percent ? v / 100 : v
}

/// Does the learner's answer denote the expected value?
public func checkNumeric(
    _ given: String, _ expected: String, tolerance: Double = numericTolerance
) -> Bool {
    guard let a = parseNumber(given), let b = parseNumber(expected) else { return false }
    // Relative everywhere except around zero, where relative error is undefined
    // and the tolerance has to be absolute.
    return abs(a - b) <= (b == 0 ? tolerance : abs(b) * tolerance)
}

/// What two utterances have to share to count as the same answer.
///
/// Accents go because a learner speaking into dictation has no control over
/// whether the engine writes "está" or "esta", and punctuation goes for the same
/// reason. What survives is the words and their order — which is exactly what a
/// spoken production item is testing.
public func normalizeText(_ raw: String) -> String {
    let folded = raw.folding(options: .diacriticInsensitive, locale: nil).lowercased()
    var words: [String] = []
    var word = ""
    for character in folded {
        if character.isLetter || character.isNumber {
            word.append(character)
        } else if !word.isEmpty {
            words.append(word)
            word = ""
        }
    }
    if !word.isEmpty { words.append(word) }
    return words.joined(separator: " ")
}

/// Did the learner produce one of the accepted answers?
public func checkText(_ given: String, _ accept: [String]) -> Bool {
    let g = normalizeText(given)
    return !g.isEmpty && accept.contains { normalizeText($0) == g }
}

/// Did the learner put the items in the expected order?
public func checkOrder(_ given: [String], _ expected: [String]) -> Bool {
    given.count == expected.count && given.elementsEqual(expected)
}
