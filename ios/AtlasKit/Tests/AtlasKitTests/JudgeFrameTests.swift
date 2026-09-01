import Foundation
import Testing
@testable import AtlasKit

/// `judgeStream` (`lib/server/generate/judge.ts`) sends the verdict on its own
/// before the critique, and that prefix rides out as a *complete* frame — only
/// the drafted `response` text is marked partial. So the first frame of every
/// judged answer is a judgement that cannot decode, and `AtlasAPI.judge` has to
/// skip it rather than throw: decoding it with `try` failed every Socratic,
/// Feynman and Crucible answer with "we couldn't grade your answer".
///
/// These pin the two halves of that: the prefix does not decode, the full
/// object does. Whichever changes first, the skip in `judge` is what has to
/// follow it.

private func frame(_ json: String) -> JSONValue {
    try! JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
}

@Test func socraticVerdictPrefixDoesNotDecode() {
    #expect((try? frame(#"{"quality":"correct"}"#).decode(SocraticJudgement.self)) == nil)
    let full = try? frame(#"{"quality":"correct","response":"Isso mesmo."}"#)
        .decode(SocraticJudgement.self)
    #expect(full?.quality == "correct")
    #expect(full?.closesStep == true)
}

@Test func feynmanVerdictPrefixDoesNotDecode() {
    let prefix = #"{"verdicts":[{"i":0,"verdict":"good"}]}"#
    #expect((try? frame(prefix).decode(FeynmanJudgement.self)) == nil)
    let full = try? frame(#"{"verdicts":[{"i":0,"verdict":"good"}],"response":"Boa."}"#)
        .decode(FeynmanJudgement.self)
    #expect(full?.verdicts.count == 1)
}

@Test func crucibleVerdictPrefixDoesNotDecode() {
    #expect((try? frame(#"{"outcome":"pass"}"#).decode(CrucibleJudgement.self)) == nil)
    let full = try? frame(#"{"outcome":"pass","transfer":[]}"#).decode(CrucibleJudgement.self)
    #expect(full?.passed == true)
}
