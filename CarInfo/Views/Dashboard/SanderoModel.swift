import SceneKit
import UIKit
import simd

/// Teintes catalogue proposées pour la Dacia Sandero III.
enum SanderoPaint: String, CaseIterable, Identifiable {
    case grisComete, blancGlacier, noirNacre, grisSchiste, rougeFusion, bleuIron, terracotta
    var id: String { rawValue }

    var name: String {
        switch self {
        case .grisComete: return "Gris Comète"
        case .blancGlacier: return "Blanc Glacier"
        case .noirNacre: return "Noir Nacré"
        case .grisSchiste: return "Gris Schiste"
        case .rougeFusion: return "Rouge Fusion"
        case .bleuIron: return "Bleu Iron"
        case .terracotta: return "Brun Terracotta"
        }
    }

    var uiColor: UIColor {
        switch self {
        case .grisComete: return UIColor(red: 0.56, green: 0.58, blue: 0.60, alpha: 1)
        case .blancGlacier: return UIColor(red: 0.92, green: 0.93, blue: 0.93, alpha: 1)
        case .noirNacre: return UIColor(red: 0.05, green: 0.055, blue: 0.065, alpha: 1)
        case .grisSchiste: return UIColor(red: 0.30, green: 0.32, blue: 0.35, alpha: 1)
        case .rougeFusion: return UIColor(red: 0.62, green: 0.06, blue: 0.08, alpha: 1)
        case .bleuIron: return UIColor(red: 0.13, green: 0.25, blue: 0.45, alpha: 1)
        case .terracotta: return UIColor(red: 0.50, green: 0.27, blue: 0.18, alpha: 1)
        }
    }

    /// Les teintes métallisées réfléchissent davantage.
    var metalness: CGFloat { self == .blancGlacier ? 0.15 : 0.65 }
}

/// Silhouette mathématique de la caisse d'une Dacia Sandero III.
/// Cotes : L 4,088 m · l 1,74 m (hors rétros) · H 1,50 m · empattement 2,604 m · porte-à-faux AV 0,83 m / AR 0,65 m.
/// Repère : avant vers +X, haut vers +Y, côté conducteur (gauche) vers −Z. Unités en mètres.
struct SanderoShape {
    static let tip = 2.044
    static let frontAxle = 1.21
    static let rearAxle = -1.39
    static let archRadius = 0.44
    static let sill = 0.27
    static let maxHalfWidth = 0.87

    private let topPts: [(Double, Double)]
    private let bottomPts: [(Double, Double)]

    init() {
        func quad(_ p0: (Double, Double), _ c: (Double, Double), _ p1: (Double, Double), _ out: inout [(Double, Double)]) {
            for k in 1...30 {
                let t = Double(k) / 30, u = 1 - t
                out.append((u * u * p0.0 + 2 * u * t * c.0 + t * t * p1.0, u * u * p0.1 + 2 * u * t * c.1 + t * t * p1.1))
            }
        }
        var t: [(Double, Double)] = [(Self.tip, 0.50)]
        quad(t.last!, (2.044, 0.76), (1.96, 0.82), &t)    // face avant
        quad(t.last!, (1.45, 0.96), (0.95, 1.00), &t)     // capot
        quad(t.last!, (0.50, 1.30), (0.02, 1.43), &t)     // pare-brise
        quad(t.last!, (-0.72, 1.53), (-1.52, 1.465), &t)  // pavillon
        quad(t.last!, (-1.82, 1.36), (-1.95, 1.07), &t)   // lunette
        quad(t.last!, (-2.01, 1.03), (-2.02, 0.98), &t)   // becquet de hayon
        quad(t.last!, (-2.044, 0.80), (-Self.tip, 0.62), &t) // face arrière
        topPts = t.reversed()

        var b: [(Double, Double)] = [(Self.tip, 0.50)]
        quad(b.last!, (2.044, 0.27), (1.95, 0.25), &b)
        b.append((1.65, Self.sill)); b.append((-1.83, Self.sill)); b.append((-1.93, 0.26))
        quad(b.last!, (-2.044, 0.30), (-Self.tip, 0.62), &b)
        bottomPts = b.reversed()
    }

    private func interp(_ pts: [(Double, Double)], _ x: Double) -> Double {
        if x <= pts[0].0 { return pts[0].1 }
        for i in 1..<pts.count where pts[i].0 >= x {
            let a = pts[i - 1], b = pts[i]
            let d = b.0 - a.0
            return d < 1e-9 ? b.1 : a.1 + (b.1 - a.1) * (x - a.0) / d
        }
        return pts.last!.1
    }

    func top(_ x: Double) -> Double { interp(topPts, x) }

    func bottom(_ x: Double) -> Double {
        var y = interp(bottomPts, x)
        for cx in [Self.frontAxle, Self.rearAxle] {
            let dx = x - cx
            if abs(dx) < Self.archRadius { y = max(y, Self.sill + (Self.archRadius * Self.archRadius - dx * dx).squareRoot()) }
        }
        return y
    }

    /// Ligne de ceinture (bas des vitres latérales).
    func belt(_ x: Double) -> Double { x > 0.95 ? 1.0 - (x - 0.95) * 0.12 : 1.0 + (0.95 - x) * 0.0246 }

    /// Demi-largeur en vue de dessus : coins avant et arrière arrondis.
    func planHalfWidth(_ x: Double) -> Double {
        let u = min(1, abs(x) / Self.tip)
        let p = x >= 0 ? 6.0 : 10.0
        return Self.maxHalfWidth * pow(max(0, 1 - pow(u, p)), 1 / p)
    }

    /// Hauteur de la ligne d'épaule (point le plus large de la section).
    func shoulder(_ x: Double) -> Double {
        let t = top(x), b = bottom(x)
        guard t - b > 1e-4 else { return b }
        return min(max(min(belt(x), t - 0.05), b), t)
    }

    static let nTop = 4.0
    static let nBottom = 6.0

    /// Demi-largeur de la caisse à l'abscisse x et à la hauteur y (nil si hors carrosserie).
    func halfWidth(_ x: Double, _ y: Double) -> Double? {
        let t = top(x), b = bottom(x)
        guard y >= b, y <= t else { return nil }
        let m = shoulder(x), w = planHalfWidth(x)
        var z: Double
        if y >= m {
            let rel = t - m > 1e-6 ? (y - m) / (t - m) : 1
            z = w * pow(max(0, 1 - pow(rel, Self.nTop)), 1 / Self.nTop)
        } else {
            let rel = m - b > 1e-6 ? (m - y) / (m - b) : 1
            z = w * pow(max(0, 1 - pow(rel, Self.nBottom)), 1 / Self.nBottom)
        }
        return z * shapeFactor(x, y)
    }

    /// Rentrée des vitres (tumblehome) + nervure d'épaule.
    func shapeFactor(_ x: Double, _ y: Double) -> Double {
        let bl = belt(x)
        var f = 1.0
        if y > bl { f *= 1 - 0.20 * min(1, (y - bl) / 0.45) }
        f *= 1 + 0.012 * exp(-pow((y - 0.84) / 0.045, 2))
        return f
    }

    /// Abscisse de la surface avant (ou arrière) au point (y, z).
    func endX(front: Bool, y: Double, z: Double) -> Double {
        var x = front ? Self.tip : -Self.tip
        let step = front ? -0.002 : 0.002
        for _ in 0..<600 {
            if let w = halfWidth(x, y), w >= abs(z) { return x }
            x += step
        }
        return x
    }
}

/// Modèle 3D procédural d'une Dacia Sandero III : caisse lissée générée section par section.
final class SanderoModel {
    let root = SCNNode()
    let shape = SanderoShape()
    private(set) var doors: [Door: SCNNode] = [:]
    private(set) var doorPanels: [Door: SCNNode] = [:]
    private(set) var overlays: [Door: SCNNode] = [:]
    let paint = SCNMaterial()

    init(paint p: SanderoPaint) {
        configurePaint(p)
        build()
    }

    // MARK: Matériaux

    func configurePaint(_ p: SanderoPaint) {
        paint.lightingModel = .physicallyBased
        paint.diffuse.contents = p.uiColor
        paint.metalness.contents = p.metalness
        paint.roughness.contents = 0.30
        paint.clearCoat.contents = 1.0
        paint.clearCoatRoughness.contents = 0.04
    }

    private func pbr(_ color: UIColor, metal: CGFloat, rough: CGFloat, emission: UIColor? = nil) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = color
        m.metalness.contents = metal
        m.roughness.contents = rough
        if let emission { m.emission.contents = emission }
        return m
    }

    private lazy var glass: SCNMaterial = {
        let m = pbr(UIColor(red: 0.02, green: 0.035, blue: 0.05, alpha: 1), metal: 0.95, rough: 0.03)
        m.clearCoat.contents = 1.0
        return m
    }()
    private lazy var blackGloss = pbr(UIColor(white: 0.025, alpha: 1), metal: 0.4, rough: 0.15)
    private lazy var blackMatte = pbr(UIColor(white: 0.055, alpha: 1), metal: 0.0, rough: 0.8)
    private lazy var chrome = pbr(UIColor(white: 0.85, alpha: 1), metal: 1.0, rough: 0.10)
    private lazy var rubber = pbr(UIColor(white: 0.035, alpha: 1), metal: 0.0, rough: 0.9)
    private lazy var alloy = pbr(UIColor(white: 0.45, alpha: 1), metal: 1.0, rough: 0.28)
    private lazy var alloyDark = pbr(UIColor(white: 0.14, alpha: 1), metal: 0.9, rough: 0.35)
    private lazy var ledWhite = pbr(.white, metal: 0, rough: 0.2, emission: UIColor(red: 0.85, green: 0.92, blue: 1.0, alpha: 1))
    private lazy var ledRed = pbr(UIColor(red: 0.5, green: 0, blue: 0, alpha: 1), metal: 0, rough: 0.2, emission: UIColor(red: 1.0, green: 0.05, blue: 0.08, alpha: 1))
    private lazy var lensRed = pbr(UIColor(red: 0.28, green: 0.01, blue: 0.02, alpha: 1), metal: 0.5, rough: 0.06)
    private lazy var lensClear = pbr(UIColor(white: 0.10, alpha: 1), metal: 0.9, rough: 0.05)
    private lazy var plateWhite = pbr(UIColor(white: 0.92, alpha: 1), metal: 0, rough: 0.5)
    private lazy var plateBlue = pbr(UIColor(red: 0.0, green: 0.2, blue: 0.6, alpha: 1), metal: 0, rough: 0.5)

    // MARK: Caisse lissée

    private func makeBody() -> SCNNode {
        let s = shape
        // Stations le long de la voiture, resserrées près des passages de roue.
        var xs = stride(from: -SanderoShape.tip, through: SanderoShape.tip, by: 0.014).map { $0 }
        for cx in [SanderoShape.frontAxle, SanderoShape.rearAxle] {
            for e in [-SanderoShape.archRadius, SanderoShape.archRadius] {
                xs += [cx + e - 0.004, cx + e + 0.004]
            }
        }
        xs.append(SanderoShape.tip)
        xs = Array(Set(xs.map { ($0 * 10000).rounded() / 10000 })).sorted()

        let ring = 120
        var verts: [SIMD3<Double>] = []
        verts.reserveCapacity(xs.count * ring)
        for x in xs {
            let t = s.top(x), b = s.bottom(x), m = s.shoulder(x), w = s.planHalfWidth(x)
            for k in 0..<ring {
                let th = -Double.pi / 2 + 2 * Double.pi * Double(k) / Double(ring)
                let sn = sin(th), cs = cos(th)
                let n = sn >= 0 ? SanderoShape.nTop : SanderoShape.nBottom
                let ey = pow(abs(sn), 2 / n), ez = pow(abs(cs), 2 / n)
                let y = sn >= 0 ? m + (t - m) * ey : m - (m - b) * ey
                var z = w * ez * (cs >= 0 ? 1 : -1)
                z *= s.shapeFactor(x, y)
                verts.append(SIMD3(x, y, z))
            }
        }

        func idx(_ i: Int, _ j: Int) -> Int { i * ring + (j % ring) }

        // Orientation : la normale du flanc droit (θ = 0) doit pointer vers +Z.
        let mid = xs.count / 2
        let a0 = verts[idx(mid, ring / 4)], b0 = verts[idx(mid + 1, ring / 4)], c0 = verts[idx(mid + 1, ring / 4 + 1)]
        let flip = simd_cross(b0 - a0, c0 - a0).z < 0

        var normals = [SIMD3<Double>](repeating: .zero, count: verts.count)
        var tris: [[Int32]] = [[], [], [], []] // peinture, vitrage, noir brillant, noir mat
        for i in 0..<(xs.count - 1) {
            for j in 0..<ring {
                var q = [idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]
                if flip { q.reverse() }
                let p0 = verts[q[0]], p1 = verts[q[1]], p2 = verts[q[2]], p3 = verts[q[3]]
                let fn = simd_cross(p1 - p0, p2 - p0) + simd_cross(p2 - p0, p3 - p0)
                let area = simd_length(fn)
                guard area > 1e-10 else { continue }
                for v in q { normals[v] += fn }
                let c = (p0 + p1 + p2 + p3) / 4
                let mat = classify(center: c, normal: fn / area)
                tris[mat] += [Int32(q[0]), Int32(q[1]), Int32(q[2]), Int32(q[0]), Int32(q[2]), Int32(q[3])]
            }
        }

        let sv = verts.map { SCNVector3(Float($0.x), Float($0.y), Float($0.z)) }
        let sn = normals.map { n -> SCNVector3 in
            let l = simd_length(n)
            let u = l > 0 ? n / l : SIMD3(0, 1, 0)
            return SCNVector3(Float(u.x), Float(u.y), Float(u.z))
        }
        let elements = tris.map { SCNGeometryElement(indices: $0, primitiveType: .triangles) }
        let geo = SCNGeometry(sources: [SCNGeometrySource(vertices: sv), SCNGeometrySource(normals: sn)], elements: elements)
        geo.materials = [paint, glass, blackGloss, blackMatte]
        let node = SCNNode(geometry: geo)
        node.name = "body"
        return node
    }

    /// Attribue chaque facette : peinture, vitrage, montant noir ou plastique brut.
    private func classify(center c: SIMD3<Double>, normal n: SIMD3<Double>) -> Int {
        let s = shape
        let x = c.x, y = c.y
        let belt = s.belt(x), top = s.top(x)
        if n.y < -0.6 { return 3 }                                   // soubassement
        if x > 1.78 && y < 0.40 { return 3 }                         // bouclier avant (partie basse)
        if x < -1.85 && y < 0.47 { return 3 }                        // bouclier arrière (partie basse)
        if abs(n.y) < 0.6 && y < 0.335 && x > -1.9 && x < 1.9 { return 3 } // bas de caisse
        // Vitres latérales
        if abs(n.y) < 0.85 && y > belt + 0.03 && y < top - 0.045 {
            let aPillar = 0.95 - (y - 1.0) / 0.43 * 0.93 - 0.07     // suit l'inclinaison du pare-brise
            let cPillar = -1.30 + (y - belt) * 0.45
            if x < aPillar && x > cPillar {
                return (x > -0.38 && x < -0.27) ? 2 : 1                 // montant B noir
            }
        }
        // Pare-brise et lunette arrière
        if n.y > 0.55 && x > 0.06 && x < 0.93 && y > 1.01 { return 1 }
        if n.y > 0.30 && x < -1.585 && y > 1.10 && y < top - 0.01 && abs(c.z) < 0.62 { return 1 }
        return 0
    }

    // MARK: Aides de placement sur la surface

    private func box(_ w: CGFloat, _ h: CGFloat, _ l: CGFloat, r: CGFloat = 0.005, _ m: SCNMaterial,
                     at pos: SCNVector3, rot: SCNVector3 = SCNVector3Zero) -> SCNNode {
        let g = SCNBox(width: w, height: h, length: l, chamferRadius: min(r, min(w, h, l) / 2))
        g.materials = [m]
        let n = SCNNode(geometry: g)
        n.position = pos
        n.eulerAngles = rot
        return n
    }

    /// Bande posée sur la face avant/arrière, qui épouse l'arrondi des coins.
    private func endStrip(front: Bool, y: Double, z0: Double, z1: Double, height: CGFloat, depth: CGFloat,
                          inset: Double = 0, _ m: SCNMaterial, to parent: SCNNode, segments: Int = 10) {
        let dir = front ? 1.0 : -1.0
        for k in 0..<segments {
            let za = z0 + (z1 - z0) * Double(k) / Double(segments)
            let zb = z0 + (z1 - z0) * Double(k + 1) / Double(segments)
            let xa = shape.endX(front: front, y: y, z: za), xb = shape.endX(front: front, y: y, z: zb)
            let zm = (za + zb) / 2
            let xm = (xa + xb) / 2 + dir * (Double(depth) / 2 - 0.006 - inset)
            let len = ((xb - xa) * (xb - xa) + (zb - za) * (zb - za)).squareRoot()
            let yaw = atan2(xb - xa, zb - za)
            parent.addChildNode(box(depth, height, CGFloat(len) + 0.004, r: min(height, depth) / 2.5, m,
                                    at: SCNVector3(Float(xm), Float(y), Float(zm)), rot: SCNVector3(0, Float(yaw), 0)))
        }
    }

    /// Joint vertical qui suit le galbe du flanc.
    private func seam(x: Double, y0: Double, y1: Double, side: Double, to parent: SCNNode) {
        let n = 8
        for k in 0..<n {
            let ya = y0 + (y1 - y0) * Double(k) / Double(n), yb = y0 + (y1 - y0) * Double(k + 1) / Double(n)
            guard let za = shape.halfWidth(x, ya), let zb = shape.halfWidth(x, yb) else { continue }
            let roll = atan2(zb - za, yb - ya)
            parent.addChildNode(box(0.006, CGFloat(yb - ya) + 0.003, 0.01, r: 0.002, blackMatte,
                                    at: SCNVector3(Float(x), Float((ya + yb) / 2), Float(side * ((za + zb) / 2 + 0.001))),
                                    rot: SCNVector3(Float(side * roll), 0, 0)))
        }
    }

    private func sideZ(_ x: Double, _ y: Double) -> Double { shape.halfWidth(x, y) ?? SanderoShape.maxHalfWidth }

    // MARK: Assemblage

    private func build() {
        let car = SCNNode()
        car.name = "car"
        root.addChildNode(car)
        car.addChildNode(makeBody())

        // Coffrages de passages de roue (ferment le tunnel entre les deux roues)
        for cx in [SanderoShape.frontAxle, SanderoShape.rearAxle] {
            car.addChildNode(box(0.86, 0.40, 1.22, r: 0.05, blackMatte, at: SCNVector3(Float(cx), 0.50, 0)))
        }

        // Becquet noir de hayon + antenne requin
        let spoilerX = -1.56
        let spoilerW = sideZ(spoilerX, shape.top(spoilerX) - 0.03) * 2 * 0.92
        car.addChildNode(box(0.20, 0.03, CGFloat(spoilerW), r: 0.012, blackGloss,
                             at: SCNVector3(Float(spoilerX), Float(shape.top(spoilerX) + 0.008), 0), rot: SCNVector3(0, 0, -0.32)))
        car.addChildNode(box(0.17, 0.06, 0.05, r: 0.022, blackGloss, at: SCNVector3(-1.25, Float(shape.top(-1.25) + 0.025), 0)))

        // Optiques et face avant
        for side in [-1.0, 1.0] {
            endStrip(front: true, y: 0.735, z0: side * 0.30, z1: side * 0.74, height: 0.105, depth: 0.03, lensClear, to: car, segments: 8)
            endStrip(front: true, y: 0.765, z0: side * 0.34, z1: side * 0.70, height: 0.018, depth: 0.02, inset: -0.012, ledWhite, to: car, segments: 8)
            endStrip(front: true, y: 0.715, z0: side * 0.56, z1: side * 0.72, height: 0.016, depth: 0.02, inset: -0.012, ledWhite, to: car, segments: 4)
            // Feux arrière (signature en Y)
            endStrip(front: false, y: 0.885, z0: side * 0.46, z1: side * 0.80, height: 0.23, depth: 0.03, lensRed, to: car, segments: 8)
            endStrip(front: false, y: 0.93, z0: side * 0.50, z1: side * 0.76, height: 0.02, depth: 0.02, inset: -0.012, ledRed, to: car, segments: 6)
            endStrip(front: false, y: 0.84, z0: side * 0.50, z1: side * 0.76, height: 0.02, depth: 0.02, inset: -0.012, ledRed, to: car, segments: 6)
            endStrip(front: false, y: 0.885, z0: side * 0.58, z1: side * 0.62, height: 0.13, depth: 0.02, inset: -0.012, ledRed, to: car, segments: 1)
        }
        endStrip(front: true, y: 0.64, z0: -0.38, z1: 0.38, height: 0.12, depth: 0.03, blackGloss, to: car)   // calandre
        endStrip(front: true, y: 0.645, z0: -0.10, z1: 0.10, height: 0.05, depth: 0.02, inset: -0.012, chrome, to: car, segments: 2) // logo
        endStrip(front: true, y: 0.36, z0: -0.55, z1: 0.55, height: 0.09, depth: 0.03, blackGloss, to: car)  // prise d'air
        endStrip(front: true, y: 0.47, z0: -0.26, z1: 0.26, height: 0.11, depth: 0.012, inset: -0.01, plateWhite, to: car, segments: 4)
        endStrip(front: true, y: 0.47, z0: -0.26, z1: -0.21, height: 0.11, depth: 0.012, inset: -0.013, plateBlue, to: car, segments: 1)
        endStrip(front: false, y: 0.63, z0: -0.26, z1: 0.26, height: 0.11, depth: 0.012, inset: -0.01, plateWhite, to: car, segments: 4)
        endStrip(front: false, y: 0.63, z0: -0.26, z1: -0.21, height: 0.11, depth: 0.012, inset: -0.013, plateBlue, to: car, segments: 1)
        endStrip(front: false, y: 0.80, z0: -0.09, z1: 0.09, height: 0.045, depth: 0.02, inset: -0.01, chrome, to: car, segments: 2)

        for side in [-1.0, 1.0] {
            let fs = Float(side)
            // Rétroviseurs
            let mz = sideZ(0.86, 0.98)
            car.addChildNode(box(0.10, 0.04, 0.10, r: 0.012, blackGloss, at: SCNVector3(0.86, 1.00, Float(side * (mz + 0.03)))))
            car.addChildNode(box(0.20, 0.13, 0.15, r: 0.045, blackGloss, at: SCNVector3(0.82, 1.06, Float(side * (mz + 0.11)))))
            // Joints de portes
            seam(x: 0.84, y0: 0.36, y1: 1.0, side: side, to: car)
            seam(x: -0.32, y0: 0.35, y1: 1.02, side: side, to: car)
            seam(x: -1.17, y0: 0.66, y1: 1.04, side: side, to: car)
            // Poignées
            for hx in [0.05, -0.98] {
                let hz = sideZ(hx, 0.86)
                car.addChildNode(box(0.13, 0.028, 0.03, r: 0.012, paint, at: SCNVector3(Float(hx), 0.86, Float(side * (hz + 0.008)))))
            }
            // Roues
            for x in [SanderoShape.frontAxle, SanderoShape.rearAxle] {
                let w = wheel(outward: fs)
                w.position = SCNVector3(Float(x), 0.325, 0.755 * fs)
                car.addChildNode(w)
            }
            // Portières animées (visibles uniquement ouvertes)
            addDoor(side < 0 ? .frontLeft : .frontRight, to: car, side: side, hingeX: 0.84, length: 1.16, rearCut: false)
            addDoor(side < 0 ? .rearLeft : .rearRight, to: car, side: side, hingeX: -0.32, length: 0.85, rearCut: true)
        }

        // Surbrillances coffre / capot
        let glow = pbr(UIColor(red: 1, green: 0.2, blue: 0.2, alpha: 1), metal: 0, rough: 0.5, emission: UIColor(red: 1, green: 0.15, blue: 0.15, alpha: 1))
        glow.transparency = 0.55
        glow.isDoubleSided = true
        let trunk = SCNNode()
        trunk.addChildNode(box(0.52, 0.015, 1.30, r: 0.006, glow, at: SCNVector3(-1.79, Float(shape.top(-1.79) + 0.012), 0), rot: SCNVector3(0, 0, 1.0)))
        trunk.addChildNode(box(0.015, 0.36, 1.30, r: 0.006, glow, at: SCNVector3(Float(shape.endX(front: false, y: 0.85, z: 0) - 0.012), 0.82, 0)))
        let hood = box(1.0, 0.015, 1.40, r: 0.006, glow, at: SCNVector3(1.45, Float(shape.top(1.45) + 0.012), 0), rot: SCNVector3(0, 0, -0.17))
        trunk.isHidden = true; hood.isHidden = true
        overlays[.trunk] = trunk; overlays[.hood] = hood
        car.addChildNode(trunk); car.addChildNode(hood)
    }

    private func addDoor(_ door: Door, to car: SCNNode, side: Double, hingeX: Double, length: Double, rearCut: Bool) {
        let hinge = SCNNode()
        let z = sideZ(hingeX - length / 2, 0.70) + 0.012
        hinge.position = SCNVector3(Float(hingeX), 0, Float(side * z))
        let path = UIBezierPath()
        let L = CGFloat(length)
        path.move(to: CGPoint(x: 0, y: 0.34))
        path.addLine(to: CGPoint(x: 0, y: 0.98))
        path.addLine(to: CGPoint(x: -L, y: 1.0))
        if rearCut {
            path.addLine(to: CGPoint(x: -L, y: 0.70))
            path.addQuadCurve(to: CGPoint(x: -L + 0.26, y: 0.34), controlPoint: CGPoint(x: -L + 0.24, y: 0.64))
        } else {
            path.addLine(to: CGPoint(x: -L, y: 0.34))
        }
        path.close()
        path.flatness = 0.004
        let shapeGeo = SCNShape(path: path, extrusionDepth: 0.04)
        shapeGeo.chamferRadius = 0.015
        let panelMat = SCNMaterial()
        panelMat.lightingModel = .physicallyBased
        shapeGeo.materials = [panelMat]
        let panel = SCNNode(geometry: shapeGeo)
        hinge.addChildNode(panel)
        hinge.isHidden = true
        car.addChildNode(hinge)
        doors[door] = hinge
        doorPanels[door] = panel
        syncPanel(door)
    }

    private func syncPanel(_ door: Door) {
        guard let m = doorPanels[door]?.geometry?.firstMaterial else { return }
        m.diffuse.contents = paint.diffuse.contents
        m.metalness.contents = paint.metalness.contents
        m.roughness.contents = paint.roughness.contents
        m.clearCoat.contents = paint.clearCoat.contents
        m.emission.contents = UIColor(red: 0.85, green: 0.08, blue: 0.08, alpha: 1)
        m.emission.intensity = 0.6
    }

    private func wheel(outward side: Float) -> SCNNode {
        let n = SCNNode()
        let tire = SCNTube(innerRadius: 0.215, outerRadius: 0.325, height: 0.205)
        tire.radialSegmentCount = 64
        tire.materials = [rubber]
        n.addChildNode(SCNNode(geometry: tire))
        let wall = SCNCylinder(radius: 0.31, height: 0.19)
        wall.radialSegmentCount = 64
        wall.materials = [rubber]
        n.addChildNode(SCNNode(geometry: wall))

        let rim = SCNCylinder(radius: 0.222, height: 0.2)
        rim.radialSegmentCount = 64
        rim.materials = [alloyDark]
        n.addChildNode(SCNNode(geometry: rim))
        // Branches de jante (côté extérieur : +Y local)
        let face: Float = 0.102
        for i in 0..<5 {
            let a = Float(i) * (2 * .pi / 5)
            let spoke = box(0.19, 0.012, 0.055, r: 0.006, alloy, at: SCNVector3(cos(a) * 0.11, face, sin(a) * 0.11), rot: SCNVector3(0, -a, 0))
            n.addChildNode(spoke)
            let spoke2 = box(0.19, 0.012, 0.03, r: 0.006, alloy, at: SCNVector3(cos(a + 0.2) * 0.11, face, sin(a + 0.2) * 0.11), rot: SCNVector3(0, -(a + 0.2), 0))
            n.addChildNode(spoke2)
        }
        let lip = SCNTorus(ringRadius: 0.218, pipeRadius: 0.008)
        lip.materials = [alloy]
        let lipNode = SCNNode(geometry: lip)
        lipNode.position = SCNVector3(0, face, 0)
        n.addChildNode(lipNode)
        let hub = SCNCylinder(radius: 0.045, height: 0.02)
        hub.materials = [chrome]
        let hubNode = SCNNode(geometry: hub)
        hubNode.position = SCNVector3(0, face + 0.005, 0)
        n.addChildNode(hubNode)
        // Disque de frein visible derrière la jante
        let disc = SCNCylinder(radius: 0.15, height: 0.02)
        disc.materials = [alloyDark]
        let discNode = SCNNode(geometry: disc)
        discNode.position = SCNVector3(0, -0.02, 0)
        n.addChildNode(discNode)

        n.eulerAngles = SCNVector3(Float.pi / 2 * side, 0, 0)
        return n
    }

    // MARK: États

    func apply(paint p: SanderoPaint) {
        configurePaint(p)
        for d in doorPanels.keys { syncPanel(d) }
    }

    func apply(doorStates: [Door: Bool], animated: Bool) {
        for (door, hinge) in doors {
            let open = doorStates[door] == true
            let side: Float = (door == .frontLeft || door == .rearLeft) ? -1 : 1
            let target: Float = open ? side * 1.0 : 0
            guard abs(hinge.eulerAngles.y - target) > 0.01 || (open && hinge.isHidden) else { continue }
            if open { hinge.isHidden = false }
            SCNTransaction.begin()
            SCNTransaction.animationDuration = animated ? 0.7 : 0
            SCNTransaction.animationTimingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            SCNTransaction.completionBlock = { if !open { hinge.isHidden = true } }
            hinge.eulerAngles.y = target
            SCNTransaction.commit()
        }
        for (door, node) in overlays { node.isHidden = doorStates[door] != true }
    }
}
