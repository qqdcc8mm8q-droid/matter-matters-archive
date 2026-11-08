import Foundation
import Network

struct Anfrage {
    let methode: String
    let rohPfad: String      // wie gesendet, mit Query
    let pfad: String         // dekodiert, ohne Query
    let query: [String: String]
    let kopf: [String: String]   // Namen klein geschrieben
    let body: Data
    let lokal: Bool          // kommt von diesem Rechner

    /// Fremde Webseiten im selben Browser dürfen nichts auslösen.
    var fremdeHerkunft: Bool {
        guard let origin = kopf["origin"], let c = URLComponents(string: origin) else { return false }
        var netloc = c.host ?? ""
        if let p = c.port { netloc += ":\(p)" }
        return netloc != (kopf["host"] ?? "")
    }
}

enum Antwort {
    case daten(status: Int, typ: String, daten: Data, kopf: [String: String] = [:])
    case datei(URL)
    case leer(status: Int, kopf: [String: String] = [:])
    case strom((Strom) -> Void)

    static func json(_ status: Int = 200, _ objekt: Any) -> Antwort {
        let d = (try? JSONSerialization.data(withJSONObject: objekt)) ?? Data("{}".utf8)
        return .daten(status: status, typ: "application/json; charset=utf-8", daten: d)
    }
    static func fehler(_ status: Int, _ text: String) -> Antwort { .json(status, ["fehler": text]) }
}

/// Dauerhafte Antwort: schickt Stück für Stück Daten (die Bilder zu den Laptops).
final class Strom: @unchecked Sendable {
    private let verbindung: NWConnection
    private let lock = NSLock()
    private var offen = true
    private var schluss: (() -> Void)?

    fileprivate init(verbindung: NWConnection) { self.verbindung = verbindung }

    var istOffen: Bool { lock.lock(); defer { lock.unlock() }; return offen }

    func beiSchluss(_ f: @escaping () -> Void) {
        lock.lock()
        let schonZu = !offen
        if !schonZu { schluss = f }
        lock.unlock()
        if schonZu { f() }
    }

    /// `fertig` meldet, ob der Empfänger noch da ist. Erst danach das nächste Stück senden.
    func sende(_ daten: Data, fertig: @escaping (Bool) -> Void) {
        guard istOffen else { fertig(false); return }
        var block = Data(String(daten.count, radix: 16).utf8)
        block.append(contentsOf: [13, 10])
        block.append(daten)
        block.append(contentsOf: [13, 10])
        verbindung.send(content: block, completion: .contentProcessed { e in fertig(e == nil) })
    }

    func schliesse() {
        guard istOffen else { return }
        verbindung.send(content: Data("0\r\n\r\n".utf8), completion: .contentProcessed { [verbindung] _ in verbindung.cancel() })
    }

    fileprivate func wurdeGetrennt() {
        lock.lock()
        let f = offen ? schluss : nil
        offen = false
        schluss = nil
        lock.unlock()
        f?()
    }
}

/// Kleiner HTTP/1.1-Server auf Network.framework. Kommt ohne Python und ohne Zusatzpakete aus.
final class HTTPServer {
    typealias Behandlung = (Anfrage, @escaping (Antwort) -> Void) -> Void

    let port: UInt16
    private let behandlung: Behandlung
    private let maxBody: (String) -> Int
    private var listener: NWListener?
    private let queue: DispatchQueue
    var beiZustand: ((NWListener.State) -> Void)?

    init(port: UInt16, maxBody: @escaping (String) -> Int = { _ in 1 << 20 }, behandlung: @escaping Behandlung) {
        self.port = port
        self.maxBody = maxBody
        self.behandlung = behandlung
        self.queue = DispatchQueue(label: "http.\(port)")
    }

    func starte() throws {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        tcp.enableKeepalive = true
        tcp.keepaliveIdle = 30
        let parameter = NWParameters(tls: nil, tcp: tcp)
        parameter.allowLocalEndpointReuse = true
        guard let p = NWEndpoint.Port(rawValue: port) else { throw RegieFehler("Ungültiger Port") }
        let l = try NWListener(using: parameter, on: p)
        l.newConnectionHandler = { [weak self] c in
            guard let self else { c.cancel(); return }
            Verbindung(verbindung: c, maxBody: self.maxBody, behandlung: self.behandlung).starte()
        }
        l.stateUpdateHandler = { [weak self] z in self?.beiZustand?(z) }
        l.start(queue: queue)
        listener = l
    }

    func stoppe() {
        listener?.cancel()
        listener = nil
    }
}

private final class Verbindung {
    private let c: NWConnection
    private let q: DispatchQueue
    private let maxBody: (String) -> Int
    private let behandlung: HTTPServer.Behandlung
    private let lokal: Bool
    private var puffer = Data()
    private var beschaeftigt = false
    private var strom: Strom?
    private var selbst: Verbindung?   // hält das Objekt am Leben, bis die Verbindung endet
    private var hundertGesendet = false

    private static let KOPF_MAX = 64 * 1024

    init(verbindung: NWConnection, maxBody: @escaping (String) -> Int, behandlung: @escaping HTTPServer.Behandlung) {
        c = verbindung
        self.maxBody = maxBody
        self.behandlung = behandlung
        q = DispatchQueue(label: "http.verbindung")
        lokal = Self.istLokal(verbindung.endpoint)
    }

    private static func istLokal(_ e: NWEndpoint) -> Bool {
        guard case let .hostPort(host, _) = e else { return false }
        switch host {
        case .ipv4(let a): return a.isLoopback
        case .ipv6(let a):
            let s = "\(a)"
            return a.isLoopback || s.hasPrefix("::ffff:127.") || s == "::1"
        case .name(let n, _): return n == "localhost"
        @unknown default: return false
        }
    }

    func starte() {
        selbst = self
        c.stateUpdateHandler = { [weak self] z in
            switch z {
            case .failed, .cancelled: self?.ende()
            default: break
            }
        }
        c.start(queue: q)
        lies()
    }

    private func ende() {
        strom?.wurdeGetrennt()
        strom = nil
        selbst = nil
    }

    private func lies() {
        c.receive(minimumIncompleteLength: 1, maximumLength: 1 << 18) { [weak self] daten, _, fertig, fehler in
            guard let self else { return }
            if let daten { self.puffer.append(daten) }
            if fehler != nil || fertig {
                self.c.cancel()
                return
            }
            if self.strom != nil {
                self.puffer.removeAll()   // bei einem Strom interessiert nur noch, ob die Gegenseite weg ist
            } else if !self.beschaeftigt {
                self.verarbeite()
            }
            self.lies()
        }
    }

    private func verarbeite() {
        guard !beschaeftigt else { return }
        let trenner = Data([13, 10, 13, 10])
        guard let r = puffer.range(of: trenner) else {
            if puffer.count > Self.KOPF_MAX { sendeEinfach(431) }
            return
        }
        let kopfText = String(decoding: puffer[puffer.startIndex..<r.lowerBound], as: UTF8.self)
        var zeilen = kopfText.components(separatedBy: "\r\n")
        let erste = zeilen.removeFirst().split(separator: " ", omittingEmptySubsequences: true)
        guard erste.count >= 2 else { sendeEinfach(400); return }
        var kopf: [String: String] = [:]
        for z in zeilen {
            guard let i = z.firstIndex(of: ":") else { continue }
            kopf[z[..<i].trimmingCharacters(in: .whitespaces).lowercased()] = z[z.index(after: i)...].trimmingCharacters(in: .whitespaces)
        }
        let methode = String(erste[0]), roh = String(erste[1])
        let teile = roh.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let pfad = String(teile.first ?? "").removingPercentEncoding ?? String(teile.first ?? "")
        var query: [String: String] = [:]
        if teile.count > 1, let items = URLComponents(string: "x:/?" + teile[1])?.queryItems {
            for i in items { query[i.name] = i.value ?? "" }
        }
        var laenge = 0
        if let t = kopf["content-length"] {
            guard let n = Int(t), n >= 0 else { sendeEinfach(400); return }
            laenge = n
        }
        if laenge > maxBody(pfad) { sendeEinfach(413); return }
        let bodyStart = r.upperBound
        if puffer.distance(from: bodyStart, to: puffer.endIndex) < laenge {
            if kopf["expect"]?.lowercased() == "100-continue", !hundertGesendet {
                hundertGesendet = true
                c.send(content: Data("HTTP/1.1 100 Continue\r\n\r\n".utf8), completion: .contentProcessed { _ in })
            }
            return   // Rest des Inhalts kommt noch
        }
        hundertGesendet = false
        let bodyEnde = puffer.index(bodyStart, offsetBy: laenge)
        let body = Data(puffer[bodyStart..<bodyEnde])
        puffer = Data(puffer[bodyEnde...])

        let a = Anfrage(methode: methode, rohPfad: roh, pfad: pfad, query: query, kopf: kopf, body: body, lokal: lokal)
        beschaeftigt = true
        behandlung(a) { [weak self] antwort in
            guard let self else { return }
            self.q.async { self.sende(antwort, auf: a) }
        }
    }

    private func sendeEinfach(_ status: Int) {
        beschaeftigt = true
        let k = "HTTP/1.1 \(status) \(Self.statusText(status))\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        c.send(content: Data(k.utf8), completion: .contentProcessed { [c] _ in c.cancel() })
    }

    private func kopfzeilen(status: Int, felder: [(String, String)], schliessen: Bool) -> Data {
        var t = "HTTP/1.1 \(status) \(Self.statusText(status))\r\n"
        for (k, v) in felder { t += "\(k): \(v)\r\n" }
        t += "Connection: \(schliessen ? "close" : "keep-alive")\r\n\r\n"
        return Data(t.utf8)
    }

    private func sende(_ antwort: Antwort, auf a: Anfrage) {
        let schliessen = a.kopf["connection"]?.lowercased() == "close"
        let basis: [(String, String)] = [("Cache-Control", "no-cache")]
        switch antwort {
        case let .daten(status, typ, daten, extra):
            var f = basis + [("Content-Type", typ), ("Content-Length", String(daten.count))]
            f += extra.map { ($0.key, $0.value) }
            var alles = kopfzeilen(status: status, felder: f, schliessen: schliessen)
            if a.methode != "HEAD" { alles.append(daten) }
            schreibe(alles, schliessen: schliessen)
        case let .leer(status, extra):
            let f = basis + [("Content-Length", "0")] + extra.map { ($0.key, $0.value) }
            schreibe(kopfzeilen(status: status, felder: f, schliessen: schliessen), schliessen: schliessen)
        case let .datei(url):
            sendeDatei(url, a: a, basis: basis, schliessen: schliessen)
        case let .strom(start):
            let k = "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nCache-Control: no-store\r\nTransfer-Encoding: chunked\r\nConnection: keep-alive\r\n\r\n"
            let s = Strom(verbindung: c)
            strom = s
            c.send(content: Data(k.utf8), completion: .contentProcessed { _ in })
            start(s)
        }
    }

    private func sendeDatei(_ url: URL, a: Anfrage, basis: [(String, String)], schliessen: Bool) {
        guard let werte = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
              let groesse = werte.fileSize,
              let daten = try? Data(contentsOf: url, options: .alwaysMapped) else {
            sende(.leer(status: 404), auf: a)
            return
        }
        let geaendert = Self.httpDatum(werte.contentModificationDate ?? Date(timeIntervalSince1970: 0))
        if a.kopf["if-modified-since"] == geaendert {
            schreibe(kopfzeilen(status: 304, felder: basis + [("Last-Modified", geaendert)], schliessen: schliessen), schliessen: schliessen)
            return
        }
        var felder = basis + [("Content-Type", Self.typ(url)), ("Last-Modified", geaendert), ("Accept-Ranges", "bytes")]
        var status = 200
        var ausschnitt: Range<Int> = 0..<groesse
        if let r = a.kopf["range"], let b = Self.bereich(r, groesse: groesse) {
            ausschnitt = b
            status = 206
            felder.append(("Content-Range", "bytes \(b.lowerBound)-\(b.upperBound - 1)/\(groesse)"))
        }
        felder.append(("Content-Length", String(ausschnitt.count)))
        let k = kopfzeilen(status: status, felder: felder, schliessen: schliessen)
        if a.methode == "HEAD" {
            schreibe(k, schliessen: schliessen)
            return
        }
        c.send(content: k, completion: .contentProcessed { _ in })
        schreibe(daten.subdata(in: ausschnitt), schliessen: schliessen)
    }

    private func schreibe(_ d: Data, schliessen: Bool) {
        c.send(content: d, completion: .contentProcessed { [weak self] _ in
            guard let self else { return }
            if schliessen {
                self.c.cancel()
            } else {
                self.q.async {
                    self.beschaeftigt = false
                    if !self.puffer.isEmpty { self.verarbeite() }
                }
            }
        })
    }

    // MARK: - Helfer

    static func bereich(_ text: String, groesse: Int) -> Range<Int>? {
        guard text.hasPrefix("bytes="), !text.contains(","), groesse > 0 else { return nil }
        let t = text.dropFirst(6).split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        guard t.count == 2 else { return nil }
        if t[0].isEmpty {
            guard let n = Int(t[1]), n > 0 else { return nil }
            return max(0, groesse - n)..<groesse
        }
        guard let a = Int(t[0]), a < groesse else { return nil }
        let b = Int(t[1]).map { min($0 + 1, groesse) } ?? groesse
        return a < b ? a..<b : nil
    }

    private static let datumFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "GMT")
        f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
        return f
    }()
    static func httpDatum(_ d: Date) -> String { datumFormat.string(from: d) }

    static func statusText(_ s: Int) -> String {
        switch s {
        case 200: return "OK"
        case 204: return "No Content"
        case 206: return "Partial Content"
        case 301: return "Moved Permanently"
        case 304: return "Not Modified"
        case 400: return "Bad Request"
        case 403: return "Forbidden"
        case 404: return "Not Found"
        case 405: return "Method Not Allowed"
        case 409: return "Conflict"
        case 413: return "Payload Too Large"
        case 415: return "Unsupported Media Type"
        case 429: return "Too Many Requests"
        case 431: return "Request Header Fields Too Large"
        case 500: return "Internal Server Error"
        case 503: return "Service Unavailable"
        default: return "Status"
        }
    }

    static func typ(_ url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "map": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "avif": return "image/avif"
        case "ico": return "image/x-icon"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "wasm": return "application/wasm"
        case "mp4", "m4v": return "video/mp4"
        case "webm": return "video/webm"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "ogg": return "audio/ogg"
        case "pdf": return "application/pdf"
        case "txt", "obj", "glsl", "frag", "vert": return "text/plain; charset=utf-8"
        case "md": return "text/markdown; charset=utf-8"
        case "xml": return "application/xml"
        default: return "application/octet-stream"
        }
    }
}

/// Liefert Dateien aus einem Ordner aus.
struct StatischeSeite {
    let wurzel: URL
    /// Offline-Kopien: Pfade ohne Dateiendung gehören dem Router der Seite und führen zur Startseite.
    let routerRueckfall: Bool

    func antwort(auf a: Anfrage) -> Antwort {
        guard a.methode == "GET" || a.methode == "HEAD" else {
            // Analyse- und API-Aufrufe der Offline-Kopien still ablehnen
            return routerRueckfall && a.methode == "POST" ? .leer(status: 204) : .leer(status: 405)
        }
        let segmente = a.pfad.split(separator: "/", omittingEmptySubsequences: true)
        if segmente.contains("..") || a.pfad.contains("\0") { return .leer(status: 403) }
        var url = wurzel
        for s in segmente { url.appendPathComponent(String(s)) }
        let fm = FileManager.default
        var istOrdner: ObjCBool = false
        if fm.fileExists(atPath: url.path, isDirectory: &istOrdner) {
            if istOrdner.boolValue {
                if !a.pfad.hasSuffix("/") {
                    let suche = a.rohPfad.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
                    let ziel = String(suche[0]) + "/" + (suche.count > 1 ? "?" + suche[1] : "")
                    return .leer(status: 301, kopf: ["Location": ziel])
                }
                url.appendPathComponent("index.html")
                guard fm.fileExists(atPath: url.path) else { return .leer(status: 404) }
            }
        } else if routerRueckfall, URL(fileURLWithPath: a.pfad).pathExtension.isEmpty {
            url = wurzel.appendingPathComponent("index.html")
            guard fm.fileExists(atPath: url.path) else { return .leer(status: 404) }
        } else {
            return .leer(status: 404)
        }
        // Keine Datei außerhalb des Ordners ausliefern, auch nicht über Verknüpfungen
        let basis = wurzel.resolvingSymlinksInPath().path + "/"
        guard url.resolvingSymlinksInPath().path.hasPrefix(basis) else { return .leer(status: 403) }
        return .datei(url)
    }
}
