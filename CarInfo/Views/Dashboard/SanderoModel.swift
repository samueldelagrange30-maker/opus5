import SceneKit
import UIKit

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

/// Modèle 3D procédural d'une Dacia Sandero III (citadine 5 portes).
/// Cotes réelles : L 4,09 m · l 1,75 m · H 1,50 m · empattement 2,60 m. L'avant est orienté vers +X, le côté conducteur vers −Z.
final class SanderoModel {
    let root = SCNNode()
    private(set) var doors: [Door: SCNNode] = [:]
    private(set) var doorPanels: [Door: SCNNode] = [:]
    private(set) var overlays: [Door: SCNNode] = [:]
    let paint = SCNMaterial()

    private let halfWidth: CGFloat = 0.87
    private let frontWheelX: Float = 1.21
    private let rearWheelX: Float = -1.39

    init(paint p: SanderoPaint) {
        configurePaint(p)
        build()
    }

    // MARK: Matériaux

    func configurePaint(_ p: SanderoPaint) {
        paint.lightingModel = .physicallyBased
        paint.diffuse.contents = p.uiColor
        paint.metalness.contents = p.metalness
        paint.roughness.contents = 0.28
        paint.clearCoat.contents = 1.0
        paint.clearCoatRoughness.contents = 0.05
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
        let m = pbr(UIColor(red: 0.03, green: 0.05, blue: 0.07, alpha: 1), metal: 0.9, rough: 0.04)
        m.clearCoat.contents = 1.0
        return m
    }()
    private lazy var blackGloss = pbr(UIColor(white: 0.03, alpha: 1), metal: 0.3, rough: 0.18)
    private lazy var blackMatte = pbr(UIColor(white: 0.06, alpha: 1), metal: 0.0, rough: 0.75)
    private lazy var chrome = pbr(UIColor(white: 0.85, alpha: 1), metal: 1.0, rough: 0.12)
    private lazy var rubber = pbr(UIColor(white: 0.035, alpha: 1), metal: 0.0, rough: 0.9)
    private lazy var alloy = pbr(UIColor(white: 0.42, alpha: 1), metal: 1.0, rough: 0.30)
    private lazy var alloyDark = pbr(UIColor(white: 0.16, alpha: 1), metal: 0.9, rough: 0.35)
    private lazy var ledWhite = pbr(.white, metal: 0, rough: 0.2, emission: UIColor(red: 0.85, green: 0.92, blue: 1.0, alpha: 1))
    private lazy var ledRed = pbr(UIColor(red: 0.5, green: 0, blue: 0, alpha: 1), metal: 0, rough: 0.2, emission: UIColor(red: 1.0, green: 0.05, blue: 0.08, alpha: 1))
    private lazy var lensRed = pbr(UIColor(red: 0.30, green: 0.01, blue: 0.02, alpha: 1), metal: 0.4, rough: 0.08)
    private lazy var plateWhite = pbr(UIColor(white: 0.92, alpha: 1), metal: 0, rough: 0.5)
    private lazy var plateBlue = pbr(UIColor(red: 0.0, green: 0.2, blue: 0.6, alpha: 1), metal: 0, rough: 0.5)

    // MARK: Géométrie

    private func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }

    private static let roundProfile: UIBezierPath = {
        let b = UIBezierPath()
        b.move(to: CGPoint(x: 0, y: 1))
        b.addQuadCurve(to: CGPoint(x: 1, y: 0), controlPoint: CGPoint(x: 1, y: 1))
        return b
    }()

    private func extrude(_ path: UIBezierPath, depth: CGFloat, chamfer: CGFloat, _ m: SCNMaterial) -> SCNNode {
        path.flatness = 0.004
        let s = SCNShape(path: path, extrusionDepth: depth)
        s.chamferRadius = chamfer
        s.chamferMode = .both
        s.chamferProfile = Self.roundProfile
        s.materials = [m]
        return SCNNode(geometry: s)
    }

    private func box(_ w: CGFloat, _ h: CGFloat, _ l: CGFloat, r: CGFloat = 0.005, _ m: SCNMaterial,
                     at pos: SCNVector3, rot: SCNVector3 = SCNVector3Zero) -> SCNNode {
        let g = SCNBox(width: w, height: h, length: l, chamferRadius: r)
        g.materials = [m]
        let n = SCNNode(geometry: g)
        n.position = pos
        n.eulerAngles = rot
        return n
    }

    private func build() {
        let car = SCNNode()
        car.name = "car"
        root.addChildNode(car)

        // Caisse (profil latéral extrudé sur la largeur)
        let body = UIBezierPath()
        body.move(to: p(1.65, 0.27))
        body.addLine(to: p(1.95, 0.25))
        body.addQuadCurve(to: p(2.044, 0.48), controlPoint: p(2.04, 0.26))
        body.addQuadCurve(to: p(1.96, 0.82), controlPoint: p(2.06, 0.76))
        body.addQuadCurve(to: p(0.95, 1.00), controlPoint: p(1.45, 0.96))
        body.addQuadCurve(to: p(-1.90, 1.07), controlPoint: p(-0.50, 1.02))
        body.addQuadCurve(to: p(-2.02, 0.98), controlPoint: p(-2.00, 1.07))
        body.addQuadCurve(to: p(-2.044, 0.45), controlPoint: p(-2.08, 0.70))
        body.addQuadCurve(to: p(-1.93, 0.26), controlPoint: p(-2.04, 0.27))
        body.addLine(to: p(-1.83, 0.27))
        body.addArc(withCenter: p(-1.39, 0.27), radius: 0.44, startAngle: .pi, endAngle: 0, clockwise: false)
        body.addLine(to: p(0.77, 0.27))
        body.addArc(withCenter: p(1.21, 0.27), radius: 0.44, startAngle: .pi, endAngle: 0, clockwise: false)
        body.close()
        car.addChildNode(extrude(body, depth: halfWidth * 2, chamfer: 0.15, paint))

        // Élargisseurs d'ailes autour des passages de roue
        for cx in [CGFloat(1.21), CGFloat(-1.39)] {
            let arch = UIBezierPath()
            arch.addArc(withCenter: p(cx, 0.27), radius: 0.485, startAngle: .pi, endAngle: 0, clockwise: false)
            arch.addLine(to: p(cx + 0.44, 0.27))
            arch.addArc(withCenter: p(cx, 0.27), radius: 0.44, startAngle: 0, endAngle: .pi, clockwise: true)
            arch.close()
            car.addChildNode(extrude(arch, depth: halfWidth * 2 + 0.05, chamfer: 0.02, paint))
        }

        // Habitacle vitré (pare-brise incliné, lunette arrière fuyante)
        let cabin = UIBezierPath()
        cabin.move(to: p(0.97, 0.96))
        cabin.addQuadCurve(to: p(0.02, 1.43), controlPoint: p(0.50, 1.30))
        cabin.addQuadCurve(to: p(-1.52, 1.45), controlPoint: p(-0.72, 1.51))
        cabin.addQuadCurve(to: p(-1.95, 1.05), controlPoint: p(-1.82, 1.36))
        cabin.close()
        car.addChildNode(extrude(cabin, depth: 1.54, chamfer: 0.17, glass))

        // Pavillon couleur carrosserie
        let roof = UIBezierPath()
        roof.move(to: p(0.10, 1.415))
        roof.addQuadCurve(to: p(-1.54, 1.462), controlPoint: p(-0.72, 1.525))
        roof.addLine(to: p(-1.52, 1.43))
        roof.addQuadCurve(to: p(0.10, 1.385), controlPoint: p(-0.72, 1.49))
        roof.close()
        car.addChildNode(extrude(roof, depth: 1.48, chamfer: 0.12, paint))

        // Becquet noir + antenne requin
        car.addChildNode(box(0.24, 0.035, 1.20, r: 0.015, blackGloss, at: SCNVector3(-1.60, 1.44, 0), rot: SCNVector3(0, 0, -0.30)))
        car.addChildNode(box(0.16, 0.06, 0.05, r: 0.02, blackGloss, at: SCNVector3(-1.30, 1.49, 0)))

        for side: Float in [-1, 1] {
            let z = Float(halfWidth) * side

            // Montants A (couleur), B (noir) et C (couleur)
            car.addChildNode(box(1.06, 0.05, 0.05, r: 0.02, paint,
                                 at: SCNVector3(0.495, 1.195, 0.745 * side), rot: SCNVector3(0, 0, -0.451)))
            car.addChildNode(box(0.10, 0.43, 0.03, r: 0.01, blackGloss,
                                 at: SCNVector3(-0.32, 1.22, 0.768 * side), rot: SCNVector3(0, 0, -0.06)))
            let cp = UIBezierPath()
            cp.move(to: p(-1.12, 1.04)); cp.addLine(to: p(-1.40, 1.45))
            cp.addLine(to: p(-1.58, 1.43))
            cp.addQuadCurve(to: p(-1.94, 1.06), controlPoint: p(-1.80, 1.33))
            cp.close()
            let c = extrude(cp, depth: 0.03, chamfer: 0.01, paint)
            c.position = SCNVector3(0, 0, 0.765 * side)
            car.addChildNode(c)

            // Bas de caisse noir
            car.addChildNode(box(1.68, 0.07, 0.025, r: 0.01, blackMatte, at: SCNVector3(-0.09, 0.30, z + 0.005 * side)))

            // Rétroviseur
            car.addChildNode(box(0.10, 0.04, 0.10, r: 0.01, blackGloss, at: SCNVector3(0.86, 1.02, (0.86 + 0.04) * side)))
            car.addChildNode(box(0.20, 0.13, 0.15, r: 0.04, blackGloss, at: SCNVector3(0.82, 1.08, (0.86 + 0.12) * side)))

            // Portières (pivot à l'avant pour l'animation d'ouverture)
            addDoor(side == -1 ? .frontLeft : .frontRight, to: car, side: side, hingeX: 0.82, outline: { b in
                b.move(to: self.p(0, 0.31)); b.addLine(to: self.p(0, 0.92))
                b.addLine(to: self.p(-1.14, 0.945)); b.addLine(to: self.p(-1.14, 0.31)); b.close()
            }, handleX: -0.90)
            addDoor(side == -1 ? .rearLeft : .rearRight, to: car, side: side, hingeX: -0.32, outline: { b in
                b.move(to: self.p(0, 0.31)); b.addLine(to: self.p(0, 0.945))
                b.addLine(to: self.p(-0.84, 0.975)); b.addLine(to: self.p(-0.84, 0.70))
                b.addQuadCurve(to: self.p(-0.60, 0.31), controlPoint: self.p(-0.62, 0.62))
                b.close()
            }, handleX: -0.66)

            // Roues
            for x in [frontWheelX, rearWheelX] {
                let w = wheel(outward: side)
                w.position = SCNVector3(x, 0.325, 0.755 * side)
                car.addChildNode(w)
            }

            // Optiques avant : boîtier noir + signature lumineuse en Y
            let hz = 0.56 * side
            car.addChildNode(box(0.10, 0.11, 0.42, r: 0.03, blackGloss, at: SCNVector3(1.985, 0.735, hz)))
            car.addChildNode(box(0.03, 0.018, 0.32, r: 0.008, ledWhite, at: SCNVector3(2.03, 0.765, hz)))
            car.addChildNode(box(0.03, 0.018, 0.12, r: 0.008, ledWhite, at: SCNVector3(2.03, 0.73, hz + 0.14 * side), rot: SCNVector3(0.55 * side, 0, 0)))
            car.addChildNode(box(0.02, 0.05, 0.14, r: 0.02, pbr(UIColor(white: 0.8, alpha: 1), metal: 1, rough: 0.05), at: SCNVector3(2.03, 0.715, hz - 0.06 * side)))

            // Feux arrière en Y
            let tz = 0.64 * side
            car.addChildNode(box(0.06, 0.24, 0.20, r: 0.03, lensRed, at: SCNVector3(-2.02, 0.88, tz)))
            car.addChildNode(box(0.02, 0.19, 0.025, r: 0.008, ledRed, at: SCNVector3(-2.055, 0.88, tz + 0.03 * side)))
            car.addChildNode(box(0.02, 0.025, 0.12, r: 0.008, ledRed, at: SCNVector3(-2.055, 0.945, tz - 0.04 * side), rot: SCNVector3(-0.6 * side, 0, 0)))
            car.addChildNode(box(0.02, 0.025, 0.12, r: 0.008, ledRed, at: SCNVector3(-2.055, 0.815, tz - 0.04 * side), rot: SCNVector3(0.6 * side, 0, 0)))
        }

        // Face avant : calandre, logo Dacia, prise d'air, plaque
        car.addChildNode(box(0.06, 0.13, 0.78, r: 0.03, blackGloss, at: SCNVector3(2.02, 0.64, 0)))
        car.addChildNode(box(0.02, 0.05, 0.20, r: 0.01, chrome, at: SCNVector3(2.05, 0.65, 0)))
        car.addChildNode(box(0.07, 0.12, 1.20, r: 0.04, blackMatte, at: SCNVector3(2.015, 0.36, 0)))
        car.addChildNode(box(0.01, 0.11, 0.52, r: 0.005, plateWhite, at: SCNVector3(2.058, 0.45, 0)))
        car.addChildNode(box(0.012, 0.11, 0.05, r: 0.005, plateBlue, at: SCNVector3(2.06, 0.45, -0.235)))

        // Face arrière : bouclier, plaque, logo, essuie-glace
        car.addChildNode(box(0.07, 0.12, 1.50, r: 0.04, blackMatte, at: SCNVector3(-2.035, 0.34, 0)))
        car.addChildNode(box(0.01, 0.11, 0.52, r: 0.005, plateWhite, at: SCNVector3(-2.075, 0.62, 0)))
        car.addChildNode(box(0.012, 0.11, 0.05, r: 0.005, plateBlue, at: SCNVector3(-2.077, 0.62, -0.235)))
        car.addChildNode(box(0.02, 0.045, 0.18, r: 0.01, chrome, at: SCNVector3(-2.06, 0.84, 0)))

        // Surbrillances coffre / capot (visibles uniquement quand l'ouvrant est ouvert)
        let glow = pbr(UIColor(red: 1, green: 0.2, blue: 0.2, alpha: 1), metal: 0, rough: 0.5, emission: UIColor(red: 1, green: 0.15, blue: 0.15, alpha: 1))
        glow.transparency = 0.55
        glow.isDoubleSided = true
        let trunk = SCNNode()
        trunk.addChildNode(box(0.50, 0.02, 1.40, r: 0.01, glow, at: SCNVector3(-1.79, 1.25, 0), rot: SCNVector3(0, 0, 0.83)))
        trunk.addChildNode(box(0.02, 0.40, 1.40, r: 0.01, glow, at: SCNVector3(-2.07, 0.80, 0)))
        let hood = box(1.00, 0.02, 1.40, r: 0.01, glow, at: SCNVector3(1.45, 0.945, 0), rot: SCNVector3(0, 0, -0.176))
        trunk.isHidden = true; hood.isHidden = true
        overlays[.trunk] = trunk; overlays[.hood] = hood
        car.addChildNode(trunk); car.addChildNode(hood)
    }

    private func addDoor(_ door: Door, to car: SCNNode, side: Float, hingeX: Float,
                         outline: (UIBezierPath) -> Void, handleX: Float) {
        let hinge = SCNNode()
        hinge.position = SCNVector3(hingeX, 0, (Float(halfWidth) + 0.004) * side)
        let path = UIBezierPath()
        outline(path)
        let panelMat = SCNMaterial()
        panelMat.lightingModel = .physicallyBased
        let panel = extrude(path, depth: 0.03, chamfer: 0.012, panelMat)
        panel.position = SCNVector3(0, 0, 0.004 * side)
        hinge.addChildNode(panel)
        // Joints de portière
        hinge.addChildNode(box(0.006, 0.62, 0.035, r: 0.002, blackMatte, at: SCNVector3(0.003, 0.62, 0.006 * side)))
        // Poignée
        hinge.addChildNode(box(0.13, 0.028, 0.03, r: 0.012, paint, at: SCNVector3(handleX, 0.86, 0.025 * side)))
        car.addChildNode(hinge)
        doors[door] = hinge
        doorPanels[door] = panel
        syncPanel(door, open: false)
    }

    private func syncPanel(_ door: Door, open: Bool) {
        guard let m = doorPanels[door]?.geometry?.firstMaterial else { return }
        m.diffuse.contents = paint.diffuse.contents
        m.metalness.contents = paint.metalness.contents
        m.roughness.contents = paint.roughness.contents
        m.clearCoat.contents = paint.clearCoat.contents
        m.clearCoatRoughness.contents = paint.clearCoatRoughness.contents
        m.emission.contents = open ? UIColor(red: 0.9, green: 0.1, blue: 0.1, alpha: 1) : UIColor.black
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
        for d in doorPanels.keys { syncPanel(d, open: false) }
    }

    func apply(doorStates: [Door: Bool], animated: Bool) {
        for (door, hinge) in doors {
            let open = doorStates[door] == true
            let side: Float = (door == .frontLeft || door == .rearLeft) ? -1 : 1
            let target = open ? side * 0.95 : 0
            if abs(hinge.eulerAngles.y - target) > 0.01 {
                SCNTransaction.begin()
                SCNTransaction.animationDuration = animated ? 0.7 : 0
                SCNTransaction.animationTimingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                hinge.eulerAngles.y = target
                SCNTransaction.commit()
            }
            syncPanel(door, open: open)
        }
        for (door, node) in overlays { node.isHidden = doorStates[door] != true }
    }
}
