import SwiftUI
import SceneKit

enum CarCameraMode: Equatable { case showcase, doors }

/// Emplacement d'un modèle 3D personnalisé (.usdz) importé par l'utilisateur.
enum CustomCarModel {
    static var url: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("vehicule.usdz")
    }
    static var exists: Bool { FileManager.default.fileExists(atPath: url.path) }
}

/// Vue SceneKit : plateau tournant, éclairage studio, Sandero 3D (ou modèle importé).
struct CarSceneView: UIViewRepresentable {
    var paint: SanderoPaint
    var doorStates: [Door: Bool]
    var mode: CarCameraMode
    var rotationSteps: Int
    var modelRevision: Int

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> SCNView {
        let v = SCNView(frame: .zero)
        v.backgroundColor = .clear
        v.antialiasingMode = .multisampling4X
        v.preferredFramesPerSecond = 60
        v.rendersContinuously = false
        v.isJitteringEnabled = true
        context.coordinator.setup(view: v, paint: paint)
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pan(_:)))
        v.addGestureRecognizer(pan)
        let pinch = UIPinchGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pinch(_:)))
        v.addGestureRecognizer(pinch)
        return v
    }

    func updateUIView(_ v: SCNView, context: Context) {
        let c = context.coordinator
        if c.modelRevision != modelRevision {
            c.modelRevision = modelRevision
            c.reloadCar(paint: paint)
        }
        if c.paint != paint { c.paint = paint; c.model?.apply(paint: paint); c.lastDoors = [:] }
        if c.lastDoors != doorStates {
            c.model?.apply(doorStates: doorStates, animated: true)
            c.lastDoors = doorStates
        }
        if c.mode != mode { c.mode = mode; c.moveCamera(animated: true) }
        if c.steps != rotationSteps {
            let delta = rotationSteps - c.steps
            c.steps = rotationSteps
            c.rotate(by: Float(delta) * .pi / 4, animated: true)
        }
    }

    final class Coordinator: NSObject {
        let scene = SCNScene()
        let turntable = SCNNode()
        let cameraNode = SCNNode()
        let target = SCNNode()
        var model: SanderoModel?
        var customNode: SCNNode?
        var paint: SanderoPaint = .grisComete
        var lastDoors: [Door: Bool] = [:]
        var mode: CarCameraMode = .showcase
        var steps = 0
        var modelRevision = 0
        var zoom: Float = 1
        private var panStart: Float = 0

        func setup(view: SCNView, paint: SanderoPaint) {
            self.paint = paint
            view.scene = scene
            scene.background.contents = UIColor.clear
            scene.lightingEnvironment.contents = Self.studioEnvironment()
            scene.lightingEnvironment.intensity = 1.6

            // Caméra
            let cam = SCNCamera()
            // Champ horizontal : la voiture tient dans la largeur quelle que soit l'orientation.
            cam.projectionDirection = .horizontal
            cam.fieldOfView = 40
            cam.zNear = 0.1
            cam.zFar = 100
            cam.wantsHDR = true
            cam.bloomIntensity = 0.35
            cam.bloomThreshold = 0.85
            cam.bloomBlurRadius = 6
            cam.wantsExposureAdaptation = false
            cam.exposureOffset = 0.15
            cam.screenSpaceAmbientOcclusionIntensity = 0.8
            cam.screenSpaceAmbientOcclusionRadius = 0.25
            cam.vignettingIntensity = 0.3
            cameraNode.camera = cam
            target.position = SCNVector3(0, 0.62, 0)
            scene.rootNode.addChildNode(target)
            let look = SCNLookAtConstraint(target: target)
            look.isGimbalLockEnabled = true
            cameraNode.constraints = [look]
            scene.rootNode.addChildNode(cameraNode)
            view.pointOfView = cameraNode

            // Lumières : principale avec ombres + contre-jour bleuté
            let key = SCNNode()
            key.light = SCNLight()
            key.light!.type = .directional
            key.light!.intensity = 900
            key.light!.castsShadow = true
            key.light!.shadowMode = .deferred
            key.light!.shadowRadius = 8
            key.light!.shadowSampleCount = 16
            key.light!.shadowColor = UIColor(white: 0, alpha: 0.55)
            key.light!.orthographicScale = 4
            key.eulerAngles = SCNVector3(-1.15, 0.6, 0)
            scene.rootNode.addChildNode(key)

            let rim = SCNNode()
            rim.light = SCNLight()
            rim.light!.type = .directional
            rim.light!.intensity = 450
            rim.light!.color = UIColor(red: 0.55, green: 0.70, blue: 1.0, alpha: 1)
            rim.eulerAngles = SCNVector3(-0.5, .pi + 0.6, 0)
            scene.rootNode.addChildNode(rim)

            // Plateau
            scene.rootNode.addChildNode(turntable)
            let disc = SCNCylinder(radius: 2.9, height: 0.02)
            disc.radialSegmentCount = 96
            let dm = SCNMaterial()
            dm.lightingModel = .physicallyBased
            dm.diffuse.contents = UIColor(red: 0.10, green: 0.11, blue: 0.13, alpha: 1)
            dm.metalness.contents = 0.25
            dm.roughness.contents = 0.55
            disc.materials = [dm]
            let discNode = SCNNode(geometry: disc)
            discNode.position = SCNVector3(0, -0.012, 0)
            turntable.addChildNode(discNode)

            let ring = SCNTorus(ringRadius: 2.9, pipeRadius: 0.012)
            ring.ringSegmentCount = 128
            let rm = SCNMaterial()
            rm.lightingModel = .constant
            rm.diffuse.contents = UIColor(red: 0.45, green: 0.62, blue: 1.0, alpha: 0.35)
            ring.materials = [rm]
            turntable.addChildNode(SCNNode(geometry: ring))

            // Ombre de contact douce sous la voiture
            let shadow = SCNPlane(width: 5.0, height: 2.6)
            let sm = SCNMaterial()
            sm.lightingModel = .constant
            sm.diffuse.contents = Self.radialShadow()
            sm.writesToDepthBuffer = false
            shadow.materials = [sm]
            let shadowNode = SCNNode(geometry: shadow)
            shadowNode.eulerAngles.x = -.pi / 2
            shadowNode.position = SCNVector3(0, 0.002, 0)
            turntable.addChildNode(shadowNode)

            reloadCar(paint: paint)
            turntable.eulerAngles.y = 0.0
            moveCamera(animated: false)
        }

        func reloadCar(paint: SanderoPaint) {
            model?.root.removeFromParentNode()
            customNode?.removeFromParentNode()
            model = nil
            customNode = nil
            if CustomCarModel.exists, let node = Self.loadCustom() {
                customNode = node
                turntable.addChildNode(node)
            } else {
                let m = SanderoModel(paint: paint)
                model = m
                turntable.addChildNode(m.root)
                m.apply(doorStates: lastDoors, animated: false)
            }
        }

        static func loadCustom() -> SCNNode? {
            guard let s = try? SCNScene(url: CustomCarModel.url, options: [.checkConsistency: true]) else { return nil }
            let container = SCNNode()
            for c in s.rootNode.childNodes { container.addChildNode(c) }
            let (mn, mx) = container.boundingBox
            let lx = mx.x - mn.x, lz = mx.z - mn.z
            let longest = max(lx, lz)
            guard longest > 0 else { return nil }
            let scale = 4.09 / longest
            let wrapper = SCNNode()
            container.position = SCNVector3(-(mn.x + mx.x) / 2, -mn.y, -(mn.z + mx.z) / 2)
            wrapper.addChildNode(container)
            wrapper.scale = SCNVector3(scale, scale, scale)
            if lz > lx { wrapper.eulerAngles.y = .pi / 2 } // aligne la longueur sur l'axe X
            return wrapper
        }

        func moveCamera(animated: Bool) {
            let pos: SCNVector3
            switch mode {
            case .showcase: pos = SCNVector3(5.5 * zoom, 1.75 * zoom, 5.7 * zoom)
            case .doors: pos = SCNVector3(2.4 * zoom, 7.8 * zoom, 3.8 * zoom)
            }
            SCNTransaction.begin()
            SCNTransaction.animationDuration = animated ? 0.8 : 0
            SCNTransaction.animationTimingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            cameraNode.position = pos
            target.position = SCNVector3(0, mode == .doors ? 0.3 : 0.62, 0)
            SCNTransaction.commit()
        }

        func rotate(by angle: Float, animated: Bool) {
            SCNTransaction.begin()
            SCNTransaction.animationDuration = animated ? 0.6 : 0
            SCNTransaction.animationTimingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            turntable.eulerAngles.y += angle
            SCNTransaction.commit()
        }

        @objc func pan(_ g: UIPanGestureRecognizer) {
            switch g.state {
            case .began: panStart = turntable.eulerAngles.y
            case .changed:
                let dx = Float(g.translation(in: g.view).x)
                turntable.eulerAngles.y = panStart + dx * 0.008
            default: break
            }
        }

        @objc func pinch(_ g: UIPinchGestureRecognizer) {
            if g.state == .changed {
                zoom = min(1.5, max(0.6, zoom / Float(g.scale)))
                g.scale = 1
                moveCamera(animated: false)
            }
        }

        /// Environnement de réflexion « studio photo » : fond sombre et trois softbox.
        static func studioEnvironment() -> UIImage {
            let size = CGSize(width: 1024, height: 512)
            return UIGraphicsImageRenderer(size: size).image { ctx in
                let cg = ctx.cgContext
                let colors = [UIColor(white: 0.30, alpha: 1).cgColor, UIColor(white: 0.10, alpha: 1).cgColor, UIColor(white: 0.04, alpha: 1).cgColor] as CFArray
                let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.5, 1])!
                cg.drawLinearGradient(grad, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
                UIColor(white: 1.0, alpha: 1).setFill()
                UIBezierPath(roundedRect: CGRect(x: 380, y: 20, width: 260, height: 70), cornerRadius: 20).fill()
                UIColor(white: 0.85, alpha: 1).setFill()
                UIBezierPath(roundedRect: CGRect(x: 60, y: 120, width: 140, height: 150), cornerRadius: 16).fill()
                UIBezierPath(roundedRect: CGRect(x: 820, y: 120, width: 140, height: 150), cornerRadius: 16).fill()
                UIColor(red: 0.55, green: 0.70, blue: 1.0, alpha: 1).setFill()
                UIBezierPath(rect: CGRect(x: 0, y: 250, width: 1024, height: 6)).fill()
            }
        }

        static func radialShadow() -> UIImage {
            let size = CGSize(width: 512, height: 266)
            return UIGraphicsImageRenderer(size: size).image { ctx in
                let colors = [UIColor(white: 0, alpha: 0.85).cgColor, UIColor(white: 0, alpha: 0.35).cgColor, UIColor(white: 0, alpha: 0).cgColor] as CFArray
                let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.55, 1])!
                ctx.cgContext.saveGState()
                ctx.cgContext.scaleBy(x: 1, y: size.height / size.width)
                let c = CGPoint(x: size.width / 2, y: size.width / 2)
                ctx.cgContext.drawRadialGradient(grad, startCenter: c, startRadius: 0, endCenter: c, endRadius: size.width / 2, options: [])
                ctx.cgContext.restoreGState()
            }
        }
    }
}
