import Foundation

/// The demo run behind `ATLAS_FIXTURES=1`, the same flag the web app reads
/// (`lib/fixtureMode.ts`). It exists so the map and the node sheet can be built
/// and looked at before onboarding can produce a real graph — nothing else in
/// the app branches on it.
public enum Fixtures {
    public static var enabled: Bool {
        ProcessInfo.processInfo.environment["ATLAS_FIXTURES"] == "1"
    }

    public static let subject = "Cálculo I"

    /// The map from the design's artboard, positions and all.
    public static let graph = ConceptGraph(
        nodes: [
            ConceptNode(id: "lim", label: "Limites", summary: "O valor de que uma função se aproxima.", g: 0, x: 162, y: 62),
            ConceptNode(id: "der", label: "Derivada", summary: "A taxa de variação instantânea de uma função.", g: 0, x: 78, y: 96),
            ConceptNode(id: "cont", label: "Continuidade", summary: "Quando o limite coincide com o valor da função.", g: 1, x: 262, y: 92),
            ConceptNode(id: "comp", label: "Composição", summary: "Encaixar uma função dentro de outra.", g: 1, x: 138, y: 158),
            ConceptNode(id: "lat", label: "Limites laterais", summary: "O que acontece à esquerda e à direita de um ponto.", g: 2, x: 228, y: 178),
            ConceptNode(id: "cadeia", label: "Regra da cadeia", summary: "Como derivar uma composição de funções — a regra que transforma f(g(x)) em um produto de duas taxas de variação.", g: 3, x: 196, y: 268),
            ConceptNode(id: "produto", label: "Regra do produto", summary: "A derivada de um produto de duas funções.", g: 3, x: 316, y: 236),
            ConceptNode(id: "assintota", label: "Assíntotas", summary: "Retas de que o gráfico se aproxima sem tocar.", g: 4, x: 246, y: 344),
            ConceptNode(id: "epsilon", label: "Definição ε-δ", summary: "A definição formal de limite.", g: 4, x: 118, y: 300, gap: true),
            ConceptNode(id: "seq", label: "Sequências", summary: "Limites de listas infinitas de números.", g: 5, x: 60, y: 358),
            ConceptNode(id: "otim", label: "Otimização", summary: "Achar máximos e mínimos com derivadas.", g: 5, x: 318, y: 392),
        ],
        edges: [
            ConceptEdge("der", "lim"), ConceptEdge("der", "comp"), ConceptEdge("lim", "cont"),
            ConceptEdge("comp", "lat"), ConceptEdge("cont", "lat"), ConceptEdge("lat", "cadeia"),
            ConceptEdge("lat", "produto"), ConceptEdge("cadeia", "assintota"),
            ConceptEdge("produto", "assintota"),
            // Only a gap node hangs off a dashed edge — dashed never locks anything,
            // so everything else here is solid or the map would light up wrongly.
            ConceptEdge("cadeia", "epsilon", dashed: true),
            ConceptEdge("assintota", "otim"), ConceptEdge("epsilon", "seq"),
        ]
    )

    /// Stored progress only — `frontier` is never in here, `displayStates`
    /// derives it (Regra da cadeia lights up because Limites laterais is shaky).
    public static let states: StateMap = [
        "der": .mastered, "lim": .mastered, "cont": .mastered,
        "comp": .learning, "lat": .shaky, "epsilon": .gap,
    ]

    /// A deck due right now, so screens 19 and 20 are reachable without a
    /// generation — fixture mode makes no request.
    static let cards: [ScheduledCard] = [
        ReviewCard(
            id: "f-lat", type: .recall, source: "de Connect", node: "lat",
            cloze: ["Um limite existe quando os limites laterais ", " no mesmo ponto."],
            answer: "coincidem", front: nil, back: "…coincidem — o da esquerda e o da direita dão o mesmo valor.",
            reExplain: "Se os dois lados discordam, não há um valor único de que a função se aproxime."
        ),
        ReviewCard(
            id: "f-cont", type: .why, source: "do seu teach-back", node: "cont",
            cloze: nil, answer: nil, front: "Por que continuidade é mais forte do que ter limite?",
            back: "Porque exige também que o limite seja igual ao valor da função no ponto.",
            reExplain: "Ter limite fala do entorno; continuidade fala do entorno e do ponto."
        ),
    ].map { ScheduledCard($0) }

    /// Two readings — one honest, one bravado — so the curve has a shape.
    static let calib: [CalibSample] = [
        CalibSample(id: "lat", felt: 85, real: 40),
        CalibSample(id: "der", felt: 55, real: 80),
        CalibSample(id: "lim", felt: 78, real: 74),
    ]

    /// A session that never leaves the device: fixture mode draws local content
    /// and makes no request, so there is no token to be honest about.
    static let session = AuthSession(
        accessToken: "", refreshToken: "",
        expiresAt: .distantFuture, email: "fixtures@atlas.local"
    )
}
