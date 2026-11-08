import Foundation
import Network

/// Fehler, deren Text direkt in der Oberfläche steht.
struct RegieFehler: LocalizedError {
    let text: String
    init(_ text: String) { self.text = text }
    var errorDescription: String? { text }
}

/// Startoptionen für Entwicklung und Tests. Im normalen Betrieb gibt es keine.
enum Start {
    static func wert(_ name: String) -> String? {
        let a = CommandLine.arguments
        guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
        return a[i + 1]
    }
    static func an(_ name: String) -> Bool { CommandLine.arguments.contains(name) }
}

enum Pfade {
    /// Hier liegen Einstellungen, Druckarchiv und Protokoll.
    static let daten: URL = {
        let url: URL
        if let d = Start.wert("--daten") {
            url = URL(fileURLWithPath: d, isDirectory: true)
        } else {
            url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("Tool Pool Regie", isDirectory: true)
        }
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()
    /// Die Webseite: in der App eingebettet, zum Entwickeln von außen wählbar.
    static let web: URL = {
        if let w = Start.wert("--web") { return URL(fileURLWithPath: w, isDirectory: true) }
        return Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    }()
    static var konfiguration: URL { daten.appendingPathComponent("konfiguration.json") }
    static var archiv: URL { unterordner("Druckarchiv") }
    static var warteschlange: URL { unterordner("Warteschlange") }
    static var protokoll: URL { daten.appendingPathComponent("protokoll.log") }

    private static func unterordner(_ name: String) -> URL {
        let url = daten.appendingPathComponent(name, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}

/// Führt ein Systemprogramm aus (lp, lpstat, ...). Immer im Hintergrund aufrufen.
enum Systemprogramm {
    struct Ergebnis {
        let status: Int32
        let ausgabe: String
        let fehler: String
        var ok: Bool { status == 0 }
    }

    static func starte(_ pfad: String, _ argumente: [String], zeitlimit: TimeInterval = 20) -> Ergebnis {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: pfad)
        p.arguments = argumente
        var env = ProcessInfo.processInfo.environment
        // Feste Sprache, damit die Ausgabe auswertbar bleibt. Die Drucker-Programme von macOS
        // richten sich sonst nach der Systemsprache: LANG gilt für sie nur zusammen mit SOFTWARE.
        env["LC_ALL"] = "C"
        env["LANG"] = "C"
        env["SOFTWARE"] = "ToolPoolRegie"
        p.environment = env
        let aus = Pipe(), err = Pipe()
        p.standardOutput = aus
        p.standardError = err
        p.standardInput = FileHandle.nullDevice
        do {
            try p.run()
        } catch {
            return Ergebnis(status: -1, ausgabe: "", fehler: error.localizedDescription)
        }
        let abbruch = DispatchWorkItem { if p.isRunning { p.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + zeitlimit, execute: abbruch)
        // Beide Pipes parallel leeren, sonst kann das Programm hängen bleiben
        var fehlerDaten = Data()
        let gruppe = DispatchGroup()
        gruppe.enter()
        DispatchQueue.global().async {
            fehlerDaten = err.fileHandleForReading.readDataToEndOfFile()
            gruppe.leave()
        }
        let ausDaten = aus.fileHandleForReading.readDataToEndOfFile()
        gruppe.wait()
        p.waitUntilExit()
        abbruch.cancel()
        return Ergebnis(status: p.terminationStatus,
                        ausgabe: String(decoding: ausDaten, as: UTF8.self),
                        fehler: String(decoding: fehlerDaten, as: UTF8.self))
    }
}

/// IPv4-Adressen dieses Rechners. So erreichen ihn die Laptops.
struct NetzAdresse: Identifiable, Hashable {
    let schnittstelle: String
    let ip: String
    var id: String { schnittstelle + ip }
    var istKabelOderWLAN: Bool { schnittstelle.hasPrefix("en") }

    static func alle() -> [NetzAdresse] {
        var kopf: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&kopf) == 0, let erste = kopf else { return [] }
        defer { freeifaddrs(kopf) }
        var ergebnis: [NetzAdresse] = []
        var p: UnsafeMutablePointer<ifaddrs>? = erste
        while let e = p {
            defer { p = e.pointee.ifa_next }
            let flags = Int32(e.pointee.ifa_flags)
            guard let adr = e.pointee.ifa_addr, adr.pointee.sa_family == UInt8(AF_INET),
                  flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0 else { continue }
            var puffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(adr, socklen_t(adr.pointee.sa_len), &puffer, socklen_t(puffer.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let name = String(cString: e.pointee.ifa_name)
            if name.hasPrefix("utun") || name.hasPrefix("awdl") || name.hasPrefix("llw") || name.hasPrefix("bridge") { continue }
            ergebnis.append(NetzAdresse(schnittstelle: name, ip: String(cString: puffer)))
        }
        return ergebnis.sorted { ($0.istKabelOderWLAN ? 0 : 1, $0.schnittstelle) < ($1.istKabelOderWLAN ? 0 : 1, $1.schnittstelle) }
    }
}

enum Pruefe {
    /// Liefert die Adresse in sauberer Form oder einen verständlichen Fehler. Leer bleibt leer.
    static func ipAdresse(_ text: String) throws -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return "" }
        guard let a = IPv4Address(t) else { throw RegieFehler("„\(t)“ ist keine gültige IP-Adresse") }
        return "\(a)"
    }
}
