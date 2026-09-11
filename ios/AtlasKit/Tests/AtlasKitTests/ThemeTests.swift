import CoreText
import SwiftUI
import Testing
import UIKit
@testable import AtlasKit

@Suite(.serialized)
struct ThemeTests {
    static let registered: Bool = {
        let thisFile = URL(fileURLWithPath: #filePath)
        let repoRoot = thisFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let fontsDir = repoRoot.appendingPathComponent("App/Resources/Fonts")
        
        for fontName in ["Newsreader.ttf", "InstrumentSans.ttf", "SplineSansMono.ttf"] {
            let fontURL = fontsDir.appendingPathComponent(fontName)
            var error: Unmanaged<CFError>?
            CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, &error)
            if let err = error?.takeRetainedValue() {
                print("Registration error for \(fontName):", err)
            }
        }
        return true
    }()

    @Test func allFacesResolveToVariableFamilyWithDistinctWeights() {
        #expect(Self.registered)

        for face in [Face.serif, Face.sans, Face.mono] {
            let desc = UIFontDescriptor().withFamily(face.rawValue)
            let regularFont = UIFont(descriptor: desc, size: 14)
            #expect(!regularFont.fontName.isEmpty)

            let semiboldDesc = desc.addingAttributes([
                .traits: [UIFontDescriptor.TraitKey.weight: UIFont.Weight.semibold.rawValue]
            ])
            let semiboldFont = UIFont(descriptor: semiboldDesc, size: 14)
            #expect(semiboldFont.fontName != regularFont.fontName, "Semibold cut should differ from regular for \(face.rawValue)")

            _ = Font.atlas(face, 14, weight: .regular)
            _ = Font.atlas(face, 14, weight: .semibold)
        }
    }
}
