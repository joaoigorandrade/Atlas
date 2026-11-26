import CoreGraphics
import Foundation

// The generated atlas the trail is drawn on, like a war map — the web's
// `atlasTerrain.ts` and `atlasFields.ts`, ported. Every concept is a territory
// with its city at the heart, grouped into countries (`TrailMap.country`). The
// land is raised under every concept and roughened by seeded noise, so the
// coast never moves as the learner works, and progress shows as colour: a
// territory is washed in its country's colour as deep as the learner's hold on
// it, and hatched as terra incognita until it is reached. Pure — the bitmaps go
// to the map's `Canvas`, which only moves them.
//
// Lengths here are in points, tuned to the trail (cities ~100–130pt apart,
// tighter than the web's map units); the bitmaps are drawn at `resolution`
// pixels per point.

/// Everything a bake reads, in the trail's content space.
struct AtlasInput: Equatable, Sendable {
    struct Site: Equatable, Sendable {
        let at: CGPoint
        let state: NodeState
        let country: Int
    }

    struct Road: Equatable, Sendable {
        let a: CGPoint
        let b: CGPoint
    }

    let sites: [Site]
    /// Solid roads only: they become ridges joining their land, and a gap's
    /// dashed road stays a strait.
    let roads: [Road]
    let names: [Int: String]
    let size: CGSize
    let seed: UInt32
    let dark: Bool

    init(_ map: TrailMap, display: [String: NodeState], dark: Bool) {
        sites = map.placed.map {
            Site(at: $0.at, state: display[$0.id] ?? .unknown, country: map.country[$0.id] ?? 0)
        }
        roads = map.links.filter { !$0.dashed }.map { Road(a: $0.from, b: $0.to) }
        names = map.names
        size = map.size
        seed = AtlasNoise.seed(map.placed.map(\.id))
        self.dark = dark
    }
}

/// A bake: the land, the fog over what hasn't been reached, and each named
/// country's label, set where the land had room for it.
struct AtlasBake: Sendable {
    struct Spot: Sendable {
        let name: String
        let at: CGPoint
        let size: CGFloat
        let spacing: CGFloat
    }

    let land: CGImage
    let fog: CGImage
    let spots: [Spot]
}

enum AtlasTerrain {
    /// A concept's land: the spread of the bump raised under it.
    private static let sigma = 48.0
    private static let sea: Float = 0.5
    /// How far colour is washed in from a border.
    private static let wash = 24.0
    /// The clearing the fog opens round every reached concept.
    private static let clearing = 150.0
    /// Water lines sit at these distances off the coast, opening out seaward.
    private static let lines = (0..<9).map { 3.5 + 3.6 * pow(Double($0), 1.3) }

    /// How strongly each state washes its territory in its country's colour.
    private static func hold(_ state: NodeState) -> Double {
        switch state {
        case .unknown: 0.12
        case .frontier, .gap: 0.4
        case .learning: 0.7
        case .shaky: 0.6
        case .mastered: 1
        }
    }

    /// Bitmap pixels per point, under a pixel budget: a bake holds ~40 bytes a
    /// pixel while it works, so a long map trades sharpness for memory.
    /// ponytail: the budget is the knob — raise it if the coast reads soft on
    /// a device; past ~2M pixels a big map's bake starts to cost real memory.
    static func resolution(for size: CGSize) -> Double {
        min(2, (1_200_000 / max(1, size.width * size.height)).squareRoot())
    }

    /// Paints the atlas in the manner of a hand-coloured 19th-century war map:
    /// parchment land, each territory washed in its country's colour along its
    /// borders, a heavy border between countries and a fine one between
    /// territories, engraved water lines off the coast, and a paper veil over
    /// whatever hasn't been reached.
    @concurrent
    static func paint(_ input: AtlasInput) async -> AtlasBake? {
        let res = resolution(for: input.size)
        let w = Int((input.size.width * res).rounded()), h = Int((input.size.height * res).rounded())
        let sites = input.sites
        guard w > 1, h > 1, !sites.isEmpty else { return nil }
        let pal = input.dark ? MapInk.dark : MapInk.light
        let seed = input.seed
        let px = sites.map { Double($0.at.x) * res }, py = sites.map { Double($0.at.y) * res }

        // The heightfield. Separable: exp(-(dx²+dy²)) = exp(-dx²)·exp(-dy²), so
        // one row and one column of exponentials per bump, not one per pixel.
        var hf = [Float](repeating: 0, count: w * h)
        func bump(_ cx: Double, _ cy: Double, _ lift: Double, _ spread: Double) {
            let s2 = 2 * spread * spread, r = (spread * 3).rounded(.up)
            let i0 = max(0, Int(cx - r)), i1 = min(w, Int(cx + r) + 1)
            let j0 = max(0, Int(cy - r)), j1 = min(h, Int(cy + r) + 1)
            guard i1 > i0, j1 > j0 else { return }
            let row = (i0..<i1).map { Float(lift * exp(-pow(Double($0) - cx, 2) / s2)) }
            hf.withUnsafeMutableBufferPointer { field in
                for j in j0..<j1 {
                    let col = Float(exp(-pow(Double(j) - cy, 2) / s2)), o = j * w + i0
                    for i in row.indices { field[o + i] += row[i] * col }
                }
            }
        }
        for n in sites.indices { bump(px[n], py[n], 1, sigma * res) }
        for road in input.roads {
            let steps = Int((hypot(road.b.x - road.a.x, road.b.y - road.a.y) / (sigma * 0.8)).rounded(.up))
            for k in stride(from: 1, to: steps, by: 1) {
                let t = Double(k) / Double(steps)
                bump((road.a.x + (road.b.x - road.a.x) * t) * res,
                     (road.a.y + (road.b.y - road.a.y) * t) * res, 0.45, sigma * 0.7 * res)
            }
        }
        // Broad noise shapes the land, fine noise frays the coast into coves —
        // sampled once per 2×2 block, and open sea stays flat.
        for j in stride(from: 0, to: h, by: 2) {
            for i in stride(from: 0, to: w, by: 2) {
                guard max(hf[j * w + i], hf[min(h - 1, j + 1) * w + min(w - 1, i + 1)]) >= 0.08 else { continue }
                let x = Double(i) / res, y = Double(j) / res
                let n = Float(AtlasNoise.fbm(x / 245, y / 245, seed) * 0.8
                    + AtlasNoise.fbm(x / 50, y / 50, seed &+ 9) * 0.3)
                for jj in j..<min(h, j + 2) {
                    for ii in i..<min(w, i + 2) { hf[jj * w + ii] += n * min(1, hf[jj * w + ii] * 2) }
                }
            }
        }

        // Each land pixel's territory (nearest concept) and so its country, on
        // a 2px lattice. The point is warped first, so borders wander like
        // surveyed ones instead of running as Voronoi straights.
        // ponytail: O(pixels/4 × concepts); a bucket grid if maps pass ~300.
        var prov = [Int16](repeating: -1, count: w * h)
        var near = [Float](repeating: 0, count: w * h) // px to the nearest concept
        var extent: [Int: (lo: Double, hi: Double)] = [:]
        for bj in stride(from: 0, to: h, by: 2) {
            for bi in stride(from: 0, to: w, by: 2) {
                if hf[bj * w + bi] < sea, hf[min(h - 1, bj + 1) * w + min(w - 1, bi + 1)] < sea { continue }
                let wx = Double(bi) / res, wy = Double(bj) / res
                let qi = Double(bi) + AtlasNoise.fbm(wx / 115, wy / 115, seed &+ 3) * 50 * res
                let qj = Double(bj) + AtlasNoise.fbm(wx / 115, wy / 115, seed &+ 5) * 50 * res
                var best = Double.infinity, p = 0
                for n in sites.indices {
                    let d = (px[n] - qi) * (px[n] - qi) + (py[n] - qj) * (py[n] - qj)
                    if d < best { best = d; p = n }
                }
                for j in bj..<min(h, bj + 2) {
                    for i in bi..<min(w, bi + 2) where hf[j * w + i] >= sea {
                        prov[j * w + i] = Int16(p)
                        near[j * w + i] = Float(best.squareRoot())
                    }
                }
                guard hf[bj * w + bi] >= sea else { continue }
                let e = extent[sites[p].country] ?? (wx, wx)
                extent[sites[p].country] = (min(e.lo, wx), max(e.hi, wx))
            }
        }
        func country(_ p: Int16) -> Int { p < 0 ? -1 : sites[Int(p)].country }

        // Edges — coast, country borders, territory borders — about a point
        // wide. The washes and the water lines are measured from them.
        let step = max(1, Int(res.rounded()))
        var edge = [UInt8](repeating: 0, count: w * h) // 1 coast, 2 country, 3 territory
        for j in 0..<h {
            for i in 0..<w {
                let k = j * w + i, a = prov[k]
                let r = i + step < w ? prov[k + step] : a
                let b = j + step < h ? prov[k + step * w] : a
                if (a < 0) != (r < 0) || (a < 0) != (b < 0) { edge[k] = 1 }
                else if a < 0 { continue }
                else if country(a) != country(r) || country(a) != country(b) { edge[k] = 2 }
                else if a != r || a != b { edge[k] = 3 }
            }
        }
        let dist = AtlasNoise.distance(to: edge.map { $0 == 1 || $0 == 2 }, w, h)
        let own = AtlasNoise.distance(to: edge.map { $0 != 0 }, w, h) // each territory washes from its own borders
        let coast = AtlasNoise.distance(to: edge.map { $0 == 1 }, w, h)

        // A country's name goes where there is most room both from its cities
        // and from its edges, clear of every city, the name hung under it, and
        // every name already set. Widest countries choose first.
        var taken: [(x: Double, y: Double, hw: Double, hh: Double)] = sites.map {
            (Double($0.at.x), Double($0.at.y) + 21, 56, 44) // a city and its name (`NodeMark`)
        }
        var room: [Int: [(k: Int, score: Float)]] = [:]
        for k in stride(from: 0, to: prov.count, by: 5) where prov[k] >= 0 {
            room[country(prov[k]), default: []].append((k, min(near[k], dist[k] * 2.2)))
        }
        var spots: [AtlasBake.Spot] = []
        for key in extent.keys.sorted(by: { extent[$0]!.hi - extent[$0]!.lo > extent[$1]!.hi - extent[$1]!.lo }) {
            guard let name = input.names[key], let span = extent[key] else { continue }
            let tried = (room[key] ?? []).sorted { $0.score > $1.score }
            // Largest type first; a name that fits nowhere whole steps down.
            placing: for scale in [1, 0.72, 0.5] {
                let label = layout(name, width: (span.hi - span.lo) * scale)
                for (k, _) in tried {
                    let x = Double(k % w) / res, y = Double(k / w) / res
                    let clash = taken.contains {
                        abs($0.x - x) < $0.hw + label.hw + 12 && abs($0.y - y) < $0.hh + label.hh + 8
                    }
                    if clash || Double(near[k]) / res < label.hh + 30 { continue }
                    // The whole baseline must lie in this country; a name
                    // spilling over a border reads as the neighbour's.
                    let fits = [-1.0, -0.5, 0.5, 1].allSatisfy { f in
                        let i = Int(((x + f * label.hw) * res).rounded())
                        return i >= 0 && i < w && country(prov[k - k % w + i]) == key
                    }
                    guard fits else { continue }
                    spots.append(.init(name: name, at: CGPoint(x: x, y: y), size: label.size, spacing: label.spacing))
                    taken.append((x, y, label.hw, label.hh))
                    break placing
                }
            }
        }

        var land = [UInt8](repeating: 0, count: w * h * 4)
        /// Ink laid over what is already there, `a` of the way.
        func ink(_ o: Int, _ a: Double) {
            guard a > 0 else { return }
            let under = Double(land[o + 3]) / 255, out = under * (1 - a) + a
            for c in 0..<3 { land[o + c] = byte((Double(land[o + c]) * under * (1 - a) + pal.ink[c] * a) / out) }
            land[o + 3] = byte(255 * out)
        }
        func put(_ o: Int, _ rgb: [Double], _ alpha: UInt8) {
            for c in 0..<3 { land[o + c] = byte(rgb[c]) }
            land[o + 3] = alpha
        }
        let water = lines.map { $0 * res }
        let half = max(0.8, 0.6 * res), coastline = max(1.4, 1.2 * res)
        let hatch = max(5, Int((7 * res).rounded()))
        for j in 0..<h {
            for i in 0..<w {
                let k = j * w + i, o = k * 4
                guard prov[k] >= 0 else {
                    // Engraved water lining: close-set lines off the coast,
                    // spreading and fading seaward, as on an engraved plate.
                    let c = Double(coast[k])
                    guard c <= water[water.count - 1] + half else { continue } // open sea: bare paper
                    let n = water.indices.min { abs(water[$0] - c) < abs(water[$1] - c) } ?? 0
                    ink(o, max(0, 1 - abs(c - water[n]) / half) * (0.42 - Double(n) * 0.04))
                    ink(o, max(0, 1 - c / coastline) * 0.9) // the coast, anti-aliased seaward
                    continue
                }
                let site = sites[Int(prov[k])]
                let tint = pal.regions[site.country % pal.regions.count]
                // Paper inside, the colour strongest along the territory's
                // edges and as deep as the learner's hold on it.
                let t = (pow(max(0, 1 - Double(own[k]) / (wash * res)), 1.4) * 0.6 + 0.32
                    + (Double(dist[k]) < 4 * res ? 0.15 : 0)) * hold(site.state)
                for c in 0..<3 { land[o + c] = byte(pal.paper[c] + (tint[c] - pal.paper[c]) * t) }
                land[o + 3] = 235
                // Terra incognita: ground nobody has reached is hatched, as a
                // surveyor shades what he has only heard of.
                if site.state == .unknown, (i + j) % hatch == 0 { ink(o, 0.1) }
                ink(o, max(0, 1 - Double(coast[k]) / coastline) * 0.9)
                if edge[k] == 2 {
                    put(o, (i + j) % 7 < 5 ? pal.ink : tint.map { $0 * 0.5 }, 235)
                } else if edge[k] == 3 {
                    put(o, pal.ink, (i + j) % 3 != 0 ? 90 : 150)
                }
            }
        }

        // The fog: a paper veil with a soft clearing round every reached
        // concept. Soft, so a quarter pixel per point is plenty.
        let fogRes = 0.25
        let fw = max(2, Int((input.size.width * fogRes).rounded()))
        let fh = max(2, Int((input.size.height * fogRes).rounded()))
        let lit = sites.filter { $0.state != .unknown }.map(\.at)
        var veil = [UInt8](repeating: 0, count: fw * fh * 4)
        for j in 0..<fh {
            for i in 0..<fw {
                let x = (Double(i) + 0.5) / fogRes, y = (Double(j) + 0.5) / fogRes
                var shown = 1.0
                for p in lit {
                    let d = hypot(x - p.x, y - p.y)
                    shown *= 1 - min(1, max(0, (clearing - d) / (clearing * 0.55)))
                }
                let o = (j * fw + i) * 4
                for c in 0..<3 { veil[o + c] = byte(pal.fog[c]) }
                veil[o + 3] = byte(255 * pal.fog[3] * shown)
            }
        }

        guard let landImage = image(land, w, h), let fogImage = image(veil, fw, fh) else { return nil }
        return AtlasBake(land: landImage, fog: fogImage, spots: spots)
    }

    /// Spaced capitals sized to the country: spread to about 60% of its width,
    /// never so loose a short name falls apart. Half-extents in points.
    private static func layout(_ name: String, width: Double) -> (size: Double, spacing: Double, hw: Double, hh: Double) {
        let size = max(13, min(40, width / 14))
        let n = Double(max(1, name.count))
        let spacing = max(size * 0.3, min(size * 1.1, (width * 0.6 - n * size * 0.72) / n))
        return (size, spacing, n * (size * 0.72 + spacing) / 2, size * 0.7)
    }

    private static func byte(_ v: Double) -> UInt8 { UInt8(max(0, min(255, v.rounded()))) }

    /// Straight (unpremultiplied) RGBA, as the painter writes it.
    private static func image(_ rgba: [UInt8], _ w: Int, _ h: Int) -> CGImage? {
        guard let provider = CGDataProvider(data: Data(rgba) as CFData),
              let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                       space: space, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}

/// The numeric fields under the atlas — `atlasFields.ts`: seeded value noise
/// for the coast and the borders, a distance transform for the washes and the
/// water lines.
enum AtlasNoise {
    /// FNV-1a over the ids: the same map always draws the same coast.
    static func seed(_ ids: [String]) -> UInt32 {
        var h: UInt32 = 2_166_136_261
        for c in ids.joined(separator: "|").utf16 { h = (h ^ UInt32(c)) &* 16_777_619 }
        return h
    }

    private static func hash(_ x: Int, _ y: Int, _ s: UInt32) -> Double {
        var h = UInt32(truncatingIfNeeded: x) &* 374_761_393
            &+ UInt32(truncatingIfNeeded: y) &* 668_265_263 &+ s &* 2_246_822_519
        h = (h ^ (h >> 13)) &* 1_274_126_177
        return Double(h ^ (h >> 16)) / 4_294_967_296
    }

    private static func value(_ x: Double, _ y: Double, _ s: UInt32) -> Double {
        let xf = x.rounded(.down), yf = y.rounded(.down)
        let u = smooth(x - xf), v = smooth(y - yf), i = Int(xf), j = Int(yf)
        let a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s)
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
    }

    private static func smooth(_ t: Double) -> Double { t * t * (3 - 2 * t) }

    /// Four octaves of value noise, roughly in [-0.5, 0.5].
    static func fbm(_ x: Double, _ y: Double, _ s: UInt32) -> Double {
        var sum = 0.0, amp = 0.5, x = x, y = y
        for octave in 0..<4 {
            sum += amp * (value(x, y, s &+ UInt32(octave)) - 0.5)
            amp /= 2; x *= 2.03; y *= 2.03
        }
        return sum * 1.9
    }

    /// Chamfer distance in pixels from every pixel to the nearest `seed` one —
    /// two raster passes, so the washes and the water lines cost O(pixels).
    static func distance(to seed: [Bool], _ w: Int, _ h: Int) -> [Float] {
        var out = seed.map { $0 ? Float(0) : 1e9 }
        out.withUnsafeMutableBufferPointer { d in
            func relax(_ k: Int, _ n: Int, _ c: Float) { if d[n] + c < d[k] { d[k] = d[n] + c } }
            for j in 0..<h {
                for i in 0..<w {
                    let k = j * w + i
                    if i > 0 { relax(k, k - 1, 1) }
                    if j > 0 {
                        relax(k, k - w, 1)
                        if i > 0 { relax(k, k - w - 1, 1.414) }
                        if i + 1 < w { relax(k, k - w + 1, 1.414) }
                    }
                }
            }
            for j in stride(from: h - 1, through: 0, by: -1) {
                for i in stride(from: w - 1, through: 0, by: -1) {
                    let k = j * w + i
                    if i + 1 < w { relax(k, k + 1, 1) }
                    if j + 1 < h {
                        relax(k, k + w, 1)
                        if i + 1 < w { relax(k, k + w + 1, 1.414) }
                        if i > 0 { relax(k, k + w - 1, 1.414) }
                    }
                }
            }
        }
        return out
    }
}
