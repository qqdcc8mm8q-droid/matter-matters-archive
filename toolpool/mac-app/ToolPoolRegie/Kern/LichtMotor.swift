import Foundation

/// Sendet Art-Net an die Astera PowerBox oder DataLink. Von dort geht es per DMX zur Titan Tube.
final class LichtMotor {
    struct Lage: Equatable {
        var fehler = ""
        var pakete = 0
        var rot = 0
        var gruen = 0
        var blau = 0
    }

    static let port: UInt16 = 6454
    private static let takt = 0.04

    private let lock = NSLock()
    private var cfg = Konfiguration.Licht()
    private var frische = 0.0
    private var blitzBis = Date.distantPast
    private var lage = Lage()

    private let q = DispatchQueue(label: "licht")
    private var uhr: DispatchSourceTimer?
    private var fd: Int32 = -1
    private var seq: UInt8 = 0
    private let start = Date()

    func starte() {
        fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        if fd >= 0 {
            var an: Int32 = 1
            setsockopt(fd, SOL_SOCKET, SO_BROADCAST, &an, socklen_t(MemoryLayout<Int32>.size))
        }
        let u = DispatchSource.makeTimerSource(queue: q)
        u.schedule(deadline: .now(), repeating: Self.takt)
        u.setEventHandler { [weak self] in self?.schritt() }
        u.resume()
        uhr = u
    }

    func setze(_ c: Konfiguration.Licht) { lock.lock(); cfg = c; lock.unlock() }
    /// 0 bis 1: wie frisch die letzte Bedienung an einer Station ist.
    func setzeFrische(_ f: Double) { lock.lock(); frische = f; lock.unlock() }
    func blitz() { lock.lock(); blitzBis = Date().addingTimeInterval(1.2); lock.unlock() }
    func aktuelleLage() -> Lage { lock.lock(); defer { lock.unlock() }; return lage }

    private func schritt() {
        lock.lock()
        let c = cfg, f = frische, rest = blitzBis.timeIntervalSinceNow
        lock.unlock()
        let rgb = Self.farbe(zeit: Date().timeIntervalSince(start), licht: c, frische: f, blitzRest: rest)
        var fehler = ""
        var gesendet = 0
        if !c.ziel.isEmpty {
            seq = seq == 255 ? 1 : seq + 1
            let paket = Self.artDmx(universum: c.universum, sequenz: seq, daten: Self.dmx(rgb: rgb, licht: c))
            var adr = sockaddr_in()
            adr.sin_family = sa_family_t(AF_INET)
            adr.sin_port = Self.port.bigEndian
            if inet_pton(AF_INET, c.ziel, &adr.sin_addr) == 1 {
                let n = paket.withUnsafeBytes { roh in
                    withUnsafePointer(to: &adr) {
                        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                            sendto(fd, roh.baseAddress, roh.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                        }
                    }
                }
                if n < 0 {
                    fehler = errno == EHOSTUNREACH || errno == ENETUNREACH
                        ? "Ziel nicht erreichbar. Netzwerk und Freigabe „Lokales Netzwerk“ prüfen."
                        : "Senden geht nicht: \(String(cString: strerror(errno)))"
                } else {
                    gesendet = 1
                }
            }
        }
        lock.lock()
        lage.fehler = fehler
        lage.pakete += gesendet
        lage.rot = Int((rgb.0 * 255).rounded())
        lage.gruen = Int((rgb.1 * 255).rounded())
        lage.blau = Int((rgb.2 * 255).rounded())
        lock.unlock()
    }

    // MARK: - Rechnung (auch für die Tests)

    static func hexFarbe(_ h: String) -> (Double, Double, Double) {
        guard h.count == 7, let n = Int(h.dropFirst(), radix: 16) else { return (1, 1, 1) }
        return (Double((n >> 16) & 255) / 255, Double((n >> 8) & 255) / 255, Double(n & 255) / 255)
    }

    private static func hsv(_ h: Double) -> (Double, Double, Double) {
        let i = Int(h * 6) % 6, f = h * 6 - Double(Int(h * 6))
        switch i {
        case 0: return (1, f, 0)
        case 1: return (1 - f, 1, 0)
        case 2: return (0, 1, f)
        case 3: return (0, 1 - f, 1)
        case 4: return (f, 0, 1)
        default: return (1, 0, 1 - f)
        }
    }

    static func farbe(zeit t: Double, licht l: Konfiguration.Licht, frische: Double, blitzRest: Double) -> (Double, Double, Double) {
        let basis = hexFarbe(l.farbe)
        var k: Double
        var c = basis
        switch l.szene {
        case "aus": k = 0
        case "atmen": k = 0.25 + 0.75 * (0.5 + 0.5 * sin(2 * .pi * t / 6))
        case "wechsel":
            k = 1
            c = hsv((t / 60).truncatingRemainder(dividingBy: 1))
        case "aktivitaet": k = 0.2 + 0.8 * frische
        default: k = 1
        }
        k *= Double(l.hell) / 100
        var rgb = (c.0 * k, c.1 * k, c.2 * k)
        if blitzRest > 0, l.druckBlitz {
            let m = min(1, blitzRest / 0.6)
            rgb = (rgb.0 + (1 - rgb.0) * m, rgb.1 + (1 - rgb.1) * m, rgb.2 + (1 - rgb.2) * m)
        }
        return rgb
    }

    /// Kanalwerte einer Tube. Der Weißanteil wandert auf den eigenen Kanal, wenn es einen gibt.
    static func kanaele(rgb: (Double, Double, Double), layout: String) -> [UInt8] {
        var (r, g, b) = rgb
        var w = 0.0
        if layout.hasSuffix("W") {
            w = min(r, g, b)
            r -= w
            g -= w
            b -= w
        }
        func wert(_ x: Double) -> UInt8 { UInt8(max(0, min(255, (x * 255).rounded()))) }
        return layout.map { z -> UInt8 in
            switch z {
            case "D": return 255
            case "R": return wert(r)
            case "G": return wert(g)
            case "B": return wert(b)
            default: return wert(w)
            }
        }
    }

    static func dmx(rgb: (Double, Double, Double), licht l: Konfiguration.Licht) -> [UInt8] {
        let k = kanaele(rgb: rgb, layout: l.layout)
        var d = [UInt8](repeating: 0, count: 512)
        for i in 0..<l.anzahl {
            let start = l.adresse - 1 + i * k.count
            if start + k.count > 512 { break }
            d.replaceSubrange(start..<(start + k.count), with: k)
        }
        return d
    }

    static func artDmx(universum: Int, sequenz: UInt8, daten: [UInt8]) -> [UInt8] {
        var p = Array("Art-Net".utf8) + [0]
        p += [0x00, 0x50]      // OpCode ArtDMX, niederwertiges Byte zuerst
        p += [0x00, 0x0E]      // Protokollversion 14
        p += [sequenz, 0]
        p += [UInt8(universum & 0xFF), UInt8((universum >> 8) & 0x7F)]
        p += [UInt8(daten.count >> 8), UInt8(daten.count & 0xFF)]
        return p + daten
    }
}
