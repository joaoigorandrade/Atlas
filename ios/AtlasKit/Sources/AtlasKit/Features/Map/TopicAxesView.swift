import SwiftUI

/// The topic's own axes, under the map's title: the language a language map
/// teaches, with a one-tap change of variant (W1.1), and — on a confessional
/// or contested subject — the lens it is read through (W2.6). The learner's to
/// choose; the server stamps every generation from the row it writes.
struct TopicAxesView: View {
    @Environment(AtlasStore.self) private var store

    /// The variants offered per language — the ones a learner plausibly means.
    private static let variants: [String: [String]] = [
        "es": ["es-ES", "es-MX", "es-AR", "es-CO"],
        "en": ["en-US", "en-GB", "en-AU"],
        "pt": ["pt-BR", "pt-PT"],
        "fr": ["fr-FR", "fr-CA"],
        "de": ["de-DE", "de-AT", "de-CH"],
        "it": ["it-IT"],
    ]

    private func name(_ tag: String) -> String {
        Locale.current.localizedString(forIdentifier: tag) ?? tag
    }

    var body: some View {
        if let axes = store.axes, axes.targetLanguage != nil || axes.lenses.count == 2 {
            HStack(spacing: 8) {
                if let tag = axes.targetLanguage {
                    Menu {
                        let options = Self.variants[String(tag.prefix(2))] ?? [tag]
                        ForEach(Array(Set(options + [tag])).sorted(), id: \.self) { variant in
                            Button { store.setAxis(targetLanguage: variant) } label: {
                                if variant == tag {
                                    Label(name(variant), systemImage: "checkmark")
                                } else {
                                    Text(verbatim: name(variant))
                                }
                            }
                        }
                    } label: {
                        Chip("Falado como \(name(tag))", dot: Palette.accent)
                    }
                    .accessibilityLabel(Text("Trocar a variante do idioma"))
                }
                if axes.lenses.count == 2 {
                    Menu {
                        ForEach(axes.lenses, id: \.self) { lens in
                            Button { store.setAxis(lens: lens) } label: {
                                if lens == axes.lens {
                                    Label(lens, systemImage: "checkmark")
                                } else {
                                    Text(verbatim: lens)
                                }
                            }
                        }
                    } label: {
                        if let lens = axes.lens {
                            Chip("Lido pela \(lens)", dot: Palette.accent)
                        } else {
                            Chip("Escolha a leitura deste mapa", dot: Palette.accent)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Metrics.gutter)
            .padding(.bottom, 6)
        }
    }
}
