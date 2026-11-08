import AppKit
import CoreGraphics
import Foundation
import UniformTypeIdentifiers

/// Der Drucker hängt am Mac mini. Alle Stationen schicken hierher, von hier geht es Auftrag für Auftrag zum Drucker.
@MainActor
final class Druckserver: ObservableObject {
    enum Status: String {
        case rechnet = "wird gerechnet"
        case wartet = "wartet"
        case druckt = "wird gedruckt"
        case fertig = "fertig"
        case fehler = "Fehler"
        case abgebrochen = "abgebrochen"

        var offen: Bool { self == .rechnet || self == .wartet || self == .druckt }
    }

    struct Auftrag: Identifiable, Equatable {
        let id: Int
        let station: Int?       // nil: von Hand in der Regie
        let titel: String
        let zeit: Date
        var status: Status
        var format: String
        var drucker = ""
        var datei: URL?
        var cupsID = ""
        var meldung = ""
    }

    struct DruckerInfo: Identifiable, Equatable {
        let name: String
        var anschluss: String       // USB, Netzwerk, ...
        var zustand: String
        var nimmtAn: Bool
        var bereit: Bool
        var angehalten: Bool
        var geteilt: Bool
        var id: String { name }
    }

    @Published private(set) var auftraege: [Auftrag] = []
    @Published private(set) var drucker: [DruckerInfo] = []
    @Published private(set) var standard = ""
    @Published private(set) var freigabeSystem = false
    @Published private(set) var heuteGedruckt = 0
    @Published private(set) var freigabeMeldung = ""

    /// Wird für jeden Auftrag aufgerufen, der zum Drucker geht (Lichtblitz).
    var beiDruck: (() -> Void)?
    /// Einstellungen kommen von der Regie.
    var einstellungen = Konfiguration.Druck()
    /// Rechnet ein Plakat auf dem Mac mini fertig (siehe RenderFarm).
    var rechner: ((Int, String, @escaping (Result<Data, Error>) -> Void) -> Void)?

    static let WARTESCHLANGE_MAX = 30
    /// Nur für Tests: lp, lpstat und cancel aus einem anderen Ordner, damit kein Papier verbraucht wird.
    nonisolated private static func auftragsprogramm(_ name: String) -> String {
        if let o = Start.wert("--druck-werkzeuge") { return o + "/" + name }
        return "/usr/bin/" + name
    }
    private static let PROBE_DAUER: TimeInterval = 2

    private var naechsteID = 1
    private var letzterDruck: [Int: Date] = [:]
    private var uhr: Timer?
    private var liestDrucker = false
    private var prueftAuftrag = false
    private var zaehlerTag = ""

    func starte() {
        let d = UserDefaults.standard
        zaehlerTag = d.string(forKey: "druckTag") ?? ""
        heuteGedruckt = zaehlerTag == Self.tagHeute() ? d.integer(forKey: "druckAnzahl") : 0
        aktualisiereDrucker()
        uhr = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    private var takte = 0
    private func tick() {
        takte += 1
        pruefeAktivenAuftrag()
        if takte % 2 == 0 { aktualisiereDrucker() }
        pumpe()
    }

    // MARK: - Aufträge annehmen

    enum Annahme {
        case ok(platz: Int, probe: Bool)
        case warte(sekunden: Int)
        case abgelehnt(status: Int, text: String)
    }

    /// Dürfen wir von dieser Station gerade drucken?
    private func vorpruefung(station: Int?, format: String) -> Annahme? {
        let e = einstellungen
        if station != nil, !e.live { return .abgelehnt(status: 403, text: "Live-Druck ist in der Regie aus") }
        if !Konfiguration.formate.contains(format) { return .abgelehnt(status: 400, text: "Format nicht erlaubt") }
        if !e.probelauf, zielDrucker == nil { return .abgelehnt(status: 503, text: "Am Mac mini ist kein Drucker eingerichtet") }
        if auftraege.filter({ $0.status.offen }).count >= Self.WARTESCHLANGE_MAX {
            return .abgelehnt(status: 503, text: "Warteschlange ist voll")
        }
        if station != nil {
            if e.tageslimit > 0, zaehleHeute() >= e.tageslimit {
                return .abgelehnt(status: 429, text: "Für heute ist das Drucklimit erreicht")
            }
            if let s = station, let z = letzterDruck[s] {
                let rest = Double(e.pauseSekunden) - Date().timeIntervalSince(z)
                if rest > 0 { return .warte(sekunden: Int(rest.rounded(.up))) }
            }
        }
        return nil
    }

    /// Ein fertiges PDF annehmen, etwa vom Laptop, wenn er selbst rechnet.
    func annehmen(pdf: Data, station: Int?, format: String, titel: String? = nil) -> Annahme {
        if let halt = vorpruefung(station: station, format: format) { return halt }
        let a = neuerAuftrag(station: station, format: format, titel: titel, status: .wartet)
        do {
            try ablegen(pdf, auftrag: a.id)
        } catch {
            setze(a.id) { $0.status = .fehler; $0.meldung = "Speichern ging nicht: \(error.localizedDescription)" }
            return .abgelehnt(status: 500, text: "PDF konnte nicht gespeichert werden")
        }
        if let s = station { letzterDruck[s] = Date() }
        pumpe()
        return .ok(platz: platz(von: a.id), probe: einstellungen.probelauf)
    }

    /// Der Mac mini rechnet das Plakat dieser Station selbst.
    func annehmen(renderVon station: Int, format: String, fertig: @escaping (Annahme) -> Void) {
        if let halt = vorpruefung(station: station, format: format) { fertig(halt); return }
        guard let rechner else { fertig(.abgelehnt(status: 500, text: "Kein Rechner verfügbar")); return }
        let a = neuerAuftrag(station: station, format: format, titel: nil, status: .rechnet)
        letzterDruck[station] = Date()
        rechner(station, format) { [weak self] ergebnis in
            guard let self else { return }
            switch ergebnis {
            case .success(let pdf):
                do {
                    try self.ablegen(pdf, auftrag: a.id)
                    self.setze(a.id) { $0.status = .wartet }
                    self.pumpe()
                    fertig(.ok(platz: self.platz(von: a.id), probe: self.einstellungen.probelauf))
                } catch {
                    self.setze(a.id) { $0.status = .fehler; $0.meldung = error.localizedDescription }
                    fertig(.abgelehnt(status: 500, text: "PDF konnte nicht gespeichert werden"))
                }
            case .failure(let e):
                self.letzterDruck[station] = nil
                self.setze(a.id) { $0.status = .fehler; $0.meldung = e.localizedDescription }
                fertig(.abgelehnt(status: 500, text: "Plakat konnte nicht gerechnet werden"))
            }
        }
    }

    /// PDF aus dem Finder oder per Ziehen in die App.
    func annehmen(datei url: URL) throws {
        let d = try Data(contentsOf: url)
        guard d.starts(with: Data("%PDF-".utf8)) else { throw RegieFehler("Das ist keine PDF-Datei") }
        if case let .abgelehnt(_, text) = annehmen(pdf: d, station: nil, format: einstellungen.format, titel: url.lastPathComponent) {
            throw RegieFehler(text)
        }
    }

    func testseite() throws {
        let p = try Self.testPDF(format: einstellungen.format, drucker: zielDrucker ?? "Probelauf")
        if case let .abgelehnt(_, text) = annehmen(pdf: p, station: nil, format: einstellungen.format, titel: "Testseite") {
            throw RegieFehler(text)
        }
    }

    private func neuerAuftrag(station: Int?, format: String, titel: String?, status: Status) -> Auftrag {
        let t = titel ?? (station.map { "Plakat von Station \($0)" } ?? "Plakat")
        let a = Auftrag(id: naechsteID, station: station, titel: t, zeit: Date(), status: status, format: format)
        naechsteID += 1
        auftraege.insert(a, at: 0)
        if auftraege.count > 300 { auftraege.removeLast(auftraege.count - 300) }
        Protokoll.melde("Druck \(a.id): \(t), \(format)")
        return a
    }

    private func ablegen(_ pdf: Data, auftrag id: Int) throws {
        let ordner: URL
        if einstellungen.archiv {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"
            ordner = Pfade.archiv.appendingPathComponent(f.string(from: Date()), isDirectory: true)
            try FileManager.default.createDirectory(at: ordner, withIntermediateDirectories: true)
        } else {
            ordner = Pfade.warteschlange
        }
        let f = DateFormatter()
        f.dateFormat = "HHmmss"
        let station = auftraege.first { $0.id == id }?.station.map { "station\($0)" } ?? "regie"
        let url = ordner.appendingPathComponent("\(f.string(from: Date()))-\(station)-\(id).pdf")
        try pdf.write(to: url, options: .atomic)
        setze(id) { $0.datei = url }
    }

    private func platz(von id: Int) -> Int {
        // Die Liste steht neueste zuerst: Platz 1 ist der älteste offene Auftrag
        let offen = auftraege.filter { $0.status.offen }.reversed().map(\.id)
        return (offen.firstIndex(of: id) ?? 0) + 1
    }

    private func setze(_ id: Int, _ aendern: (inout Auftrag) -> Void) {
        guard let i = auftraege.firstIndex(where: { $0.id == id }) else { return }
        aendern(&auftraege[i])
    }

    // MARK: - Warteschlange abarbeiten

    /// Der gewählte Drucker oder der Standarddrucker, wenn es ihn gibt.
    var zielDrucker: String? {
        let wahl = einstellungen.drucker.isEmpty ? standard : einstellungen.drucker
        if drucker.contains(where: { $0.name == wahl }) { return wahl }
        return einstellungen.drucker.isEmpty ? drucker.first?.name : nil
    }

    func pumpe() {
        guard !einstellungen.angehalten,
              !auftraege.contains(where: { $0.status == .druckt }),
              let a = auftraege.last(where: { $0.status == .wartet }) else { return }
        guard let datei = a.datei else {
            setze(a.id) { $0.status = .fehler; $0.meldung = "PDF fehlt" }
            return
        }
        let e = einstellungen
        if e.probelauf {
            setze(a.id) { $0.status = .druckt; $0.drucker = "Probelauf"; $0.meldung = "Probelauf: nichts geht an den Drucker" }
            beiDruck?()
            zaehleDruck()
            let id = a.id
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.PROBE_DAUER) { [weak self] in
                MainActor.assumeIsolated {
                    self?.setze(id) { if $0.status == .druckt { $0.status = .fertig } }
                    self?.nachDruck(id)
                    self?.pumpe()
                }
            }
            return
        }
        guard let ziel = zielDrucker else {
            setze(a.id) { $0.meldung = "Wartet auf einen Drucker" }
            return
        }
        setze(a.id) { $0.status = .druckt; $0.drucker = ziel; $0.meldung = "" }
        let id = a.id, format = a.format, kopien = e.kopien
        DispatchQueue.global().async { [weak self] in
            let r = Systemprogramm.starte(Self.auftragsprogramm("lp"), ["-d", ziel, "-t", "Tool Pool", "-n", String(kopien), "-o", "media=" + format, datei.path], zeitlimit: 60)
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if r.ok {
                        let cups = Self.auftragsnummer(r.ausgabe, drucker: ziel)
                        self.setze(id) { $0.cupsID = cups }
                        self.beiDruck?()
                        self.zaehleDruck()
                        Protokoll.melde("Druck \(id) an \(ziel) (\(cups))")
                        if cups.isEmpty {
                            // Ohne Nummer lässt sich der Auftrag nicht verfolgen. Die Warteschlange darf daran nicht hängen bleiben.
                            self.setze(id) { $0.status = .fertig; $0.meldung = "An den Drucker gegeben, Stand unbekannt" }
                            self.nachDruck(id)
                            self.pumpe()
                        }
                    } else {
                        let text = r.fehler.trimmingCharacters(in: .whitespacesAndNewlines)
                        self.setze(id) { $0.status = .fehler; $0.meldung = text.isEmpty ? "lp ist fehlgeschlagen" : String(text.prefix(200)) }
                        Protokoll.melde("Druck \(id) fehlgeschlagen: \(text)", art: .fehler)
                        self.pumpe()
                    }
                }
            }
        }
    }

    private func pruefeAktivenAuftrag() {
        guard !prueftAuftrag, let a = auftraege.first(where: { $0.status == .druckt && !$0.cupsID.isEmpty }) else { return }
        prueftAuftrag = true
        let id = a.id, cups = a.cupsID, ziel = a.drucker
        DispatchQueue.global().async { [weak self] in
            let r = Systemprogramm.starte(Self.auftragsprogramm("lpstat"), ["-o", ziel])
            let nochDa = r.ok && r.ausgabe.split(separator: "\n").contains { $0.split(separator: " ").first.map(String.init) == cups }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.prueftAuftrag = false
                    if r.ok, !nochDa {
                        self.setze(id) { $0.status = .fertig; $0.meldung = "" }
                        self.nachDruck(id)
                        self.pumpe()
                    }
                }
            }
        }
    }

    private func nachDruck(_ id: Int) {
        guard let a = auftraege.first(where: { $0.id == id }), let d = a.datei, !einstellungen.archiv else { return }
        try? FileManager.default.removeItem(at: d)   // nur die eigene Zwischenablage, nicht das Archiv
        setze(id) { $0.datei = nil }
    }

    func abbrechen(_ id: Int) {
        guard let a = auftraege.first(where: { $0.id == id }), a.status.offen else { return }
        let cups = a.cupsID
        setze(id) { $0.status = .abgebrochen; $0.meldung = "" }
        Protokoll.melde("Druck \(id) abgebrochen")
        if !cups.isEmpty {
            DispatchQueue.global().async { _ = Systemprogramm.starte(Self.auftragsprogramm("cancel"), [cups]) }
        }
        pumpe()
    }

    func nochmal(_ id: Int) {
        guard let a = auftraege.first(where: { $0.id == id }), let d = a.datei, let pdf = try? Data(contentsOf: d) else { return }
        _ = annehmen(pdf: pdf, station: nil, format: a.format, titel: a.titel + " (nochmal)")
    }

    func oeffnePDF(_ id: Int) {
        if let d = auftraege.first(where: { $0.id == id })?.datei { NSWorkspace.shared.open(d) }
    }

    func alleWartendenVerwerfen() {
        for a in auftraege where a.status == .wartet { abbrechen(a.id) }
    }

    func fertigeAusblenden() {
        auftraege.removeAll { !$0.status.offen }
    }

    // MARK: - Zähler

    static func tagHeute() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    private func zaehleHeute() -> Int {
        if zaehlerTag != Self.tagHeute() { heuteGedruckt = 0 }
        return heuteGedruckt
    }

    private func zaehleDruck() {
        let heute = Self.tagHeute()
        if zaehlerTag != heute {
            zaehlerTag = heute
            heuteGedruckt = 0
        }
        heuteGedruckt += 1
        UserDefaults.standard.set(zaehlerTag, forKey: "druckTag")
        UserDefaults.standard.set(heuteGedruckt, forKey: "druckAnzahl")
    }

    // MARK: - Drucker abfragen

    func aktualisiereDrucker() {
        guard !liestDrucker else { return }
        liestDrucker = true
        DispatchQueue.global().async { [weak self] in
            let (liste, std, frei) = Self.liesDrucker()
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.liestDrucker = false
                    if liste != self.drucker { self.drucker = liste }
                    if std != self.standard { self.standard = std }
                    if frei != self.freigabeSystem { self.freigabeSystem = frei }
                    self.pumpe()
                }
            }
        }
    }

    nonisolated private static func liesDrucker() -> ([DruckerInfo], String, Bool) {
        let a = Systemprogramm.starte("/usr/bin/lpstat", ["-a"]).ausgabe
        let d = Systemprogramm.starte("/usr/bin/lpstat", ["-d"]).ausgabe
        let std = standardName(d)
        var liste: [DruckerInfo] = []
        for zeile in a.split(separator: "\n") {
            let teile = zeile.split(separator: " ")
            guard let name = teile.first.map(String.init) else { continue }
            let o = optionen(Systemprogramm.starte("/usr/bin/lpoptions", ["-p", name]).ausgabe)
            let status = o["printer-state"] ?? "3"
            let gruende = o["printer-state-reasons"] ?? "none"
            let nimmtAn = o["printer-is-accepting-jobs"] != "false"
            liste.append(DruckerInfo(name: name,
                                     anschluss: anschluss(o["device-uri"] ?? ""),
                                     zustand: zustandsText(status: status, gruende: gruende, nimmtAn: nimmtAn),
                                     nimmtAn: nimmtAn,
                                     bereit: status != "5" && nimmtAn && !gruende.contains("offline"),
                                     angehalten: status == "5" || !nimmtAn,
                                     geteilt: o["printer-is-shared"] == "true"))
        }
        let frei = Systemprogramm.starte("/usr/sbin/cupsctl", []).ausgabe.contains("_share_printers=1")
        return (liste, std, frei)
    }

    /// Liest `name=wert`-Paare. Werte können in Anführungszeichen stehen.
    nonisolated static func optionen(_ text: String) -> [String: String] {
        var r: [String: String] = [:]
        var i = text.startIndex
        while i < text.endIndex {
            while i < text.endIndex, text[i].isWhitespace { i = text.index(after: i) }
            guard i < text.endIndex else { break }
            var name = ""
            while i < text.endIndex, text[i] != "=", !text[i].isWhitespace {
                name.append(text[i])
                i = text.index(after: i)
            }
            var wert = ""
            if i < text.endIndex, text[i] == "=" {
                i = text.index(after: i)
                var zeichen: Character?
                while i < text.endIndex {
                    let c = text[i]
                    if let z = zeichen {
                        if c == z { zeichen = nil } else { wert.append(c) }
                    } else if c == "'" || c == "\"" {
                        zeichen = c
                    } else if c == "\\", text.index(after: i) < text.endIndex {
                        i = text.index(after: i)
                        wert.append(text[i])
                    } else if c.isWhitespace {
                        break
                    } else {
                        wert.append(c)
                    }
                    i = text.index(after: i)
                }
            }
            if !name.isEmpty { r[name] = wert }
        }
        return r
    }

    nonisolated static func anschluss(_ uri: String) -> String {
        if uri.hasPrefix("usb:") || uri.hasPrefix("ippusb:") { return "USB, direkt am Rechner" }
        if uri.hasPrefix("dnssd:") || uri.hasPrefix("ipp:") || uri.hasPrefix("ipps:") || uri.hasPrefix("socket:") || uri.hasPrefix("lpd:") { return "Netzwerk" }
        return uri.isEmpty ? "unbekannt" : String(uri.prefix(while: { $0 != ":" }))
    }

    nonisolated static func zustandsText(status: String, gruende: String, nimmtAn: Bool) -> String {
        if !nimmtAn { return "nimmt keine Aufträge an" }
        let liste = gruende.split(separator: ",").map(String.init)
        func hat(_ t: String) -> Bool { liste.contains { $0.hasPrefix(t) } }
        if hat("media-empty") { return "Papier leer" }
        if hat("media-jam") { return "Papierstau" }
        if hat("media-needed") { return "Papier fehlt" }
        if hat("cover-open") || hat("door-open") { return "Klappe offen" }
        if hat("toner-empty") || hat("marker-supply-empty") { return "Tinte oder Toner leer" }
        if hat("offline") { return "meldet sich nicht (aus oder nicht verbunden?)" }
        if hat("toner-low") || hat("marker-supply-low") { return "bereit, Tinte oder Toner wird knapp" }
        switch status {
        case "4": return "druckt"
        case "5": return "angehalten"
        default: return "bereit"
        }
    }

    /// "system default destination: Drucker", in jeder Systemsprache steht der Name hinter dem Doppelpunkt.
    nonisolated static func standardName(_ ausgabe: String) -> String {
        guard let i = ausgabe.lastIndex(of: ":") else { return "" }
        return ausgabe[ausgabe.index(after: i)...].trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// "request id is Drucker-123 (1 file(s))". Gesucht wird der Name des Druckers mit Nummer, nicht der Satz.
    nonisolated static func auftragsnummer(_ ausgabe: String, drucker: String) -> String {
        for wort in ausgabe.split(whereSeparator: \.isWhitespace) where wort.hasPrefix(drucker + "-") {
            if wort.dropFirst(drucker.count + 1).allSatisfy(\.isNumber) { return String(wort) }
        }
        return ""
    }

    func druckerFortsetzen() {
        guard let ziel = zielDrucker else { return }
        DispatchQueue.global().async { [weak self] in
            _ = Systemprogramm.starte("/usr/sbin/cupsenable", [ziel])
            _ = Systemprogramm.starte("/usr/sbin/cupsaccept", [ziel])
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.aktualisiereDrucker() } }
        }
    }

    func oeffneDruckerEinstellungen() {
        if let u = URL(string: "x-apple.systempreferences:com.apple.Print-Scan-Settings.extension") { NSWorkspace.shared.open(u) }
    }

    /// Macht den Drucker im Netz sichtbar, damit auch Programme auf den Laptops direkt hierher drucken können.
    /// Das ändert eine Systemeinstellung, macOS fragt dafür nach dem Passwort.
    func setzeFreigabe(an: Bool) {
        guard let ziel = zielDrucker else {
            freigabeMeldung = "Kein Drucker eingerichtet"
            return
        }
        freigabeMeldung = "Warte auf die Bestätigung ..."
        let befehl = an
            ? "\"/usr/sbin/cupsctl --share-printers && /usr/sbin/lpadmin -p \" & quoted form of (item 1 of argv) & \" -o printer-is-shared=true\""
            : "\"/usr/sbin/lpadmin -p \" & quoted form of (item 1 of argv) & \" -o printer-is-shared=false\""
        let skript = ["on run argv", "do shell script \(befehl) with administrator privileges", "end run"]
        var argumente: [String] = []
        for z in skript { argumente += ["-e", z] }
        argumente += ["--", ziel]
        DispatchQueue.global().async { [weak self] in
            let r = Systemprogramm.starte("/usr/bin/osascript", argumente, zeitlimit: 120)
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if r.ok {
                        self.freigabeMeldung = an ? "\(ziel) ist im Netz freigegeben" : "Freigabe für \(ziel) ist aus"
                        Protokoll.melde(self.freigabeMeldung)
                    } else {
                        self.freigabeMeldung = r.fehler.contains("-128") ? "Abgebrochen" : "Hat nicht geklappt: \(r.fehler.prefix(160))"
                    }
                    self.aktualisiereDrucker()
                }
            }
        }
    }

    // MARK: - Testseite

    static func testPDF(format: String, drucker: String) throws -> Data {
        let mm = 72.0 / 25.4
        let (b, h) = format == "A3" ? (297.0, 420.0) : (210.0, 297.0)
        var box = CGRect(x: 0, y: 0, width: b * mm, height: h * mm)
        let daten = NSMutableData()
        guard let verbraucher = CGDataConsumer(data: daten as CFMutableData),
              let c = CGContext(consumer: verbraucher, mediaBox: &box, nil) else {
            throw RegieFehler("Testseite konnte nicht erzeugt werden")
        }
        c.beginPDFPage(nil)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: c, flipped: false)
        let datum = DateFormatter.localizedString(from: Date(), dateStyle: .medium, timeStyle: .short)
        let texte: [(String, CGFloat, NSFont)] = [
            ("Tool Pool Druckserver", 720, .boldSystemFont(ofSize: 28)),
            ("Testseite · \(format) · \(drucker)", 690, .systemFont(ofSize: 13)),
            (datum, 672, .systemFont(ofSize: 13)),
        ]
        let hoehe = h * mm
        for (t, y, f) in texte {
            (t as NSString).draw(at: CGPoint(x: 18 * mm, y: hoehe - (841.9 - Double(y))), withAttributes: [.font: f, .foregroundColor: NSColor.black])
        }
        let farben: [NSColor] = [.cyan, .magenta, .yellow, .black, .red, .green, .blue, .white]
        let breite = (b - 36) * mm / Double(farben.count)
        for (i, f) in farben.enumerated() {
            f.setFill()
            let r = CGRect(x: 18 * mm + Double(i) * breite, y: hoehe - 230, width: breite, height: 60)
            r.fill()
            NSColor.black.setStroke()
            NSBezierPath(rect: r).stroke()
        }
        for i in 0..<16 {
            NSColor(white: CGFloat(i) / 15, alpha: 1).setFill()
            CGRect(x: 18 * mm + Double(i) * (b - 36) * mm / 16, y: hoehe - 270, width: (b - 36) * mm / 16 + 0.5, height: 28).fill()
        }
        NSColor.black.setStroke()
        NSBezierPath(rect: box.insetBy(dx: 6 * mm, dy: 6 * mm)).stroke()
        NSGraphicsContext.restoreGraphicsState()
        c.endPDFPage()
        c.closePDF()
        return daten as Data
    }
}
