import AppKit
import Combine
import Foundation
import Network
import ServiceManagement

struct StationLage: Identifiable, Equatable {
    let id: Int
    var name = ""
    var online = false
    var bedientVor: Int?            // Sekunden, nil: noch nie
    var ms = 0
    var fps = 0
    var kbJeSekunde = 0
    var rechnetAufMini = false
    var eingang = 1
    var aufBildschirm = false
    var bild: NSImage?

    static func == (a: StationLage, b: StationLage) -> Bool {
        a.id == b.id && a.name == b.name && a.online == b.online && a.bedientVor == b.bedientVor && a.ms == b.ms && a.fps == b.fps
            && a.kbJeSekunde == b.kbJeSekunde && a.rechnetAufMini == b.rechnetAufMini && a.eingang == b.eingang
            && a.aufBildschirm == b.aufBildschirm && a.bild === b.bild
    }
}

/// Die Mitte der App: hält die Einstellungen und verbindet Server, Stationen, Bildschirm, Licht und Druck.
@MainActor
final class Regie: ObservableObject {
    static let shared = Regie()

    static let PORT: UInt16 = 8431
    private static let ONLINE_S: TimeInterval = 8
    private static let AKTIV_S: TimeInterval = 30
    private static let STATION_MAX = 32

    @Published var konfig: Konfiguration {
        didSet { if konfig != oldValue { konfigGeaendert(alt: oldValue) } }
    }
    @Published private(set) var stationen: [StationLage] = []
    @Published private(set) var atem = AtemClient.Zustand()
    @Published private(set) var licht = LichtMotor.Lage()
    @Published private(set) var adressen: [NetzAdresse] = []
    @Published private(set) var serverMeldung = "startet ..."
    @Published private(set) var serverLaeuft = false
    @Published private(set) var offlineKopien = 0
    @Published private(set) var firewallAn: Bool?
    @Published private(set) var naechsterWechsel = 0
    @Published var autostart = false
    @Published var autostartMeldung = ""
    @Published var hinweis = ""

    let druck = Druckserver()
    let farm = RenderFarm()
    private let atemClient = AtemClient()
    private let lichtMotor = LichtMotor()
    private var server: HTTPServer?
    private var kopien: [String: HTTPServer] = [:]
    private var kopienBereit: Set<String> = []
    private var serverFehlerGemeldet = false
    private var uhr: Timer?
    private var wach: NSObjectProtocol?
    private var speicherAufgabe: DispatchWorkItem?
    private var druckBeobachter: AnyCancellable?

    // Stationen, interner Stand
    private struct Intern {
        var zuletzt: Date?
        var bedient: Date?
        var ms = 0
        var fps = 0
        var fern = false
        var befehle: [String] = []
        var bild: NSImage?
        var bildDaten: Data?
    }
    private var intern: [Int: Intern] = [:]
    private var aktuell: Int?          // Station, die zuletzt auf den Bildschirm gewählt wurde
    private var wechselUm = Date.distantPast
    private var takte = 0

    private init() {
        konfig = Konfiguration.laden(von: Pfade.konfiguration)
    }

    // MARK: - Start

    func starten() {
        if Start.an("--druck-probe") { konfig.druck.probelauf = true }
        adressen = NetzAdresse.alle()
        wendeAn()
        lichtMotor.setze(konfig.licht)
        lichtMotor.starte()
        atemClient.beiAenderung = { [weak self] z in
            MainActor.assumeIsolated { self?.atemGeaendert(z) }
        }
        if konfig.bildschirm.atemAktiv, !konfig.bildschirm.atemIP.isEmpty {
            atemClient.verbinde(ip: konfig.bildschirm.atemIP)
        }
        druck.einstellungen = konfig.druck
        druck.beiDruck = { [weak self] in
            self?.lichtMotor.blitz()
        }
        druck.rechner = { [weak self] station, format, fertig in
            guard let self else { fertig(.failure(RegieFehler("Regie beendet"))); return }
            self.farm.druck(station: station, format: format, fertig: fertig)
        }
        druck.starte()
        druckBeobachter = druck.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        farm.seitenAdresse = URL(string: "http://127.0.0.1:\(Self.PORT)/render.html")!
        farm.istRuhig = { [weak self] id in
            guard let b = self?.intern[id]?.bedient else { return true }
            return Date().timeIntervalSince(b) > 60
        }
        farm.starte()
        starteServer()
        wachHalten(konfig.ausstellung.wachHalten)
        leseAutostart()
        pruefeFirewall()
        let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        uhr = t
        tick()
        Protokoll.melde("Tool Pool Regie gestartet")
    }

    private func starteServer() {
        let wurzel = Pfade.web
        starteHauptserver(seite: StatischeSeite(wurzel: wurzel, routerRueckfall: false))
        starteOfflineKopien(wurzel: wurzel)
    }

    private func starteHauptserver(seite: StatischeSeite) {
        let s = HTTPServer(port: Self.PORT, maxBody: { $0 == "/api/drucken" ? 80 << 20 : 2 << 20 }) { [weak self] a, fertig in
            if a.pfad.hasPrefix("/api/") {
                Task { @MainActor in
                    guard let self else { fertig(.leer(status: 503)); return }
                    self.api(a, fertig)
                }
            } else {
                fertig(seite.antwort(auf: a))
            }
        }
        s.beiZustand = { [weak self] z in
            Task { @MainActor in self?.serverZustand(z, seite: seite) }
        }
        do {
            try s.starte()
            server = s
        } catch {
            serverAusgefallen("Server startet nicht: \(error.localizedDescription)", seite: seite)
        }
    }

    private func serverZustand(_ z: NWListener.State, seite: StatischeSeite) {
        switch z {
        case .ready:
            serverLaeuft = true
            serverFehlerGemeldet = false
            serverMeldung = "läuft auf Port \(Self.PORT)"
        case .waiting(let e):
            serverLaeuft = false
            serverMeldung = "Server wartet auf das Netzwerk: \(e.localizedDescription)"
        case .failed(let e):
            if case .posix(.EADDRINUSE) = e {
                serverAusgefallen("Port \(Self.PORT) ist belegt. Läuft Tool Pool schon in einem anderen Fenster? Neuer Versuch alle 3 Sekunden.", seite: seite)
            } else {
                serverAusgefallen("Server gestoppt: \(e.localizedDescription). Neuer Versuch alle 3 Sekunden.", seite: seite)
            }
        default:
            break
        }
    }

    /// Die Ausstellung darf nicht stehen bleiben: Der Server versucht es von selbst weiter.
    private func serverAusgefallen(_ text: String, seite: StatischeSeite) {
        serverLaeuft = false
        serverMeldung = text
        if !serverFehlerGemeldet {
            serverFehlerGemeldet = true
            Protokoll.melde(text, art: .fehler)
        }
        server?.stoppe()
        server = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            MainActor.assumeIsolated { self?.starteHauptserver(seite: seite) }
        }
    }

    /// Jede Offline-Kopie läuft auf ihrem eigenen Port wie im Original an der Wurzel ihrer Domain.
    private func starteOfflineKopien(wurzel: URL) {
        let off = wurzel.appendingPathComponent("offline", isDirectory: true)
        guard let d = try? Data(contentsOf: off.appendingPathComponent("ports.json")),
              let ports = try? JSONSerialization.jsonObject(with: d) as? [String: Int] else { return }
        for (host, port) in ports {
            let ordner = off.appendingPathComponent(host, isDirectory: true)
            guard FileManager.default.fileExists(atPath: ordner.path), let p = UInt16(exactly: port) else { continue }
            starteKopie(host: host, port: p, seite: StatischeSeite(wurzel: ordner, routerRueckfall: true))
        }
    }

    private func starteKopie(host: String, port: UInt16, seite: StatischeSeite) {
        let s = HTTPServer(port: port) { a, fertig in fertig(seite.antwort(auf: a)) }
        s.beiZustand = { [weak self] z in
            Task { @MainActor in
                guard let self else { return }
                switch z {
                case .ready:
                    self.kopienBereit.insert(host)
                    self.offlineKopien = self.kopienBereit.count
                case .failed:
                    self.kopienBereit.remove(host)
                    self.offlineKopien = self.kopienBereit.count
                    self.kopien[host]?.stoppe()
                    self.kopien[host] = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                        MainActor.assumeIsolated { self?.starteKopie(host: host, port: port, seite: seite) }
                    }
                default:
                    break
                }
            }
        }
        do {
            try s.starte()
            kopien[host] = s
        } catch {
            Protokoll.melde("Offline-Kopie \(host) startet nicht: \(error.localizedDescription)", art: .warnung)
        }
    }

    // MARK: - Takt

    private func tick() {
        takte += 1
        aktualisiereStationen()
        pruefeBildschirm()
        let l = lichtMotor.aktuelleLage()
        if l != licht { licht = l }
        lichtMotor.setzeFrische(frischeBedienung())
        if takte % 10 == 0 { adressen = NetzAdresse.alle() }
        if takte % 30 == 0 { pruefeFirewall(); leseAutostart() }
    }

    private func frischeBedienung() -> Double {
        let jetzt = Date()
        var f = 0.0
        for (id, s) in intern where istOnline(id, jetzt) {
            if let b = s.bedient { f = max(f, exp(-jetzt.timeIntervalSince(b) / 20)) }
        }
        return f
    }

    private func istOnline(_ id: Int, _ jetzt: Date = Date()) -> Bool {
        guard let z = intern[id]?.zuletzt else { return false }
        return jetzt.timeIntervalSince(z) < Self.ONLINE_S
    }

    private func aktualisiereStationen() {
        let jetzt = Date()
        let ids = Set(intern.keys).union(1...konfig.ausstellung.stationen).sorted()
        let neu = ids.map { id -> StationLage in
            let s = intern[id] ?? Intern()
            let w = farm.werte(station: id)
            var l = StationLage(id: id)
            l.name = konfig.name(fuer: id)
            l.online = istOnline(id, jetzt)
            l.bedientVor = s.bedient.map { Int(jetzt.timeIntervalSince($0)) }
            l.rechnetAufMini = s.fern
            l.ms = s.fern ? w.ms : s.ms
            l.fps = s.fern ? w.fps : s.fps
            l.kbJeSekunde = s.fern ? w.kbJeSekunde : 0
            l.eingang = konfig.eingang(fuer: id)
            l.aufBildschirm = atem.verbunden && atem.programm == l.eingang
            // Bild neu nur, wenn es wirklich neue Daten gibt
            let daten = s.fern ? farm.letztesBild(station: id) : s.bildDaten
            if let daten, daten != s.bildDaten || s.bild == nil {
                intern[id, default: Intern()].bildDaten = daten
                intern[id, default: Intern()].bild = NSImage(data: daten)
            }
            l.bild = intern[id]?.bild
            return l
        }
        if neu != stationen { stationen = neu }
    }

    // MARK: - Einstellungen

    private func konfigGeaendert(alt: Konfiguration) {
        // Werte aus der Oberfläche in ihre Grenzen bringen. Das löst diese Funktion einmal neu aus.
        if let g = try? konfig.geprueft(), g != konfig {
            konfig = g
            return
        }
        speicherAufgabe?.cancel()
        let k = konfig
        let aufgabe = DispatchWorkItem {
            try? k.speichern(nach: Pfade.konfiguration)
        }
        speicherAufgabe = aufgabe
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.4, execute: aufgabe)
        wendeAn()
        if konfig.druck != alt.druck { druck.pumpe() }
        if konfig.licht != alt.licht { lichtMotor.setze(konfig.licht) }
        if konfig.bildschirm.modus != alt.bildschirm.modus {
            wechselUm = .distantPast
            Protokoll.melde("Bildschirm: \(Self.modusName(konfig.bildschirm.modus))")
        }
        if konfig.ausstellung.wachHalten != alt.ausstellung.wachHalten { wachHalten(konfig.ausstellung.wachHalten) }
    }

    private func wendeAn() {
        druck.einstellungen = konfig.druck
        farm.bilderJeSekunde = konfig.bilderJeSekunde
        farm.qualitaet = konfig.ausstellung.qualitaet
    }

    private func wachHalten(_ an: Bool) {
        if let w = wach {
            ProcessInfo.processInfo.endActivity(w)
            wach = nil
        }
        // Auch ohne „wach halten“ darf die App nicht schlafen gelegt werden, sonst stockt das Rechnen
        var optionen: ProcessInfo.ActivityOptions = [.userInitiatedAllowingIdleSystemSleep, .latencyCritical]
        if an { optionen.formUnion([.idleSystemSleepDisabled, .idleDisplaySleepDisabled]) }
        wach = ProcessInfo.processInfo.beginActivity(options: optionen, reason: "Tool Pool Regie läuft die Ausstellung")
    }

    func sichereSofort() {
        speicherAufgabe?.cancel()
        try? konfig.speichern(nach: Pfade.konfiguration)
    }

    static func modusName(_ m: String) -> String {
        switch m {
        case "manuell": return "von Hand"
        case "reihe": return "der Reihe nach"
        case "zufall": return "zufällig"
        case "aktivitaet": return "nach Aktivität"
        default: return "aus"
        }
    }

    func konfigurationLaden(von url: URL) throws {
        let d = try Data(contentsOf: url)
        guard let j = try JSONSerialization.jsonObject(with: d) as? [String: Any] else {
            throw RegieFehler("Das ist keine Einstellungsdatei")
        }
        konfig = try Konfiguration.aus(json: j)
        sichereSofort()
        Protokoll.melde("Einstellungen geladen aus \(url.lastPathComponent)")
    }

    func konfigurationSichern(nach url: URL) throws {
        try konfig.speichern(nach: url)
    }

    // MARK: - Autostart, Firewall

    func leseAutostart() {
        let s = SMAppService.mainApp.status
        autostart = s == .enabled
        autostartMeldung = s == .requiresApproval ? "Noch in den Systemeinstellungen unter Anmeldeobjekte erlauben." : ""
    }

    func setzeAutostart(_ an: Bool) {
        do {
            if an { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            Protokoll.melde(an ? "Autostart an" : "Autostart aus")
        } catch {
            autostartMeldung = "Hat nicht geklappt: \(error.localizedDescription). Liegt die App im Ordner Programme?"
        }
        leseAutostart()
    }

    private func pruefeFirewall() {
        DispatchQueue.global().async { [weak self] in
            let r = Systemprogramm.starte("/usr/libexec/ApplicationFirewall/socketfilterfw", ["--getglobalstate"], zeitlimit: 5)
            let an: Bool? = r.ausgabe.contains("enabled") ? true : r.ausgabe.contains("disabled") ? false : nil
            Task { @MainActor in if self?.firewallAn != an { self?.firewallAn = an } }
        }
    }

    // MARK: - Bildschirm und ATEM

    private func atemGeaendert(_ z: AtemClient.Zustand) {
        if z.verbunden != atem.verbunden {
            Protokoll.melde(z.verbunden ? "ATEM verbunden: \(z.modell)" : "ATEM nicht mehr verbunden", art: z.verbunden ? .info : .warnung)
        }
        atem = z
    }

    func verbindeATEM(ip text: String) throws {
        let ip = try Pruefe.ipAdresse(text)
        guard !ip.isEmpty else { throw RegieFehler("Bitte die IP-Adresse des ATEM eintragen") }
        konfig.bildschirm.atemIP = ip
        konfig.bildschirm.atemAktiv = true
        atemClient.verbinde(ip: ip)
    }

    func trenneATEM() {
        konfig.bildschirm.atemAktiv = false
        atemClient.trenne()
    }

    private var uebergang: AtemClient.Uebergang {
        konfig.bildschirm.uebergang == "mix" ? .blende(bilder: konfig.bildschirm.mixBilder) : .schnitt
    }

    /// Von Hand: Station auf den Bildschirm. Die Automatik pausiert dabei.
    func aufBildschirm(station: Int) throws {
        guard atem.verbunden else { throw RegieFehler("Der ATEM ist nicht verbunden") }
        konfig.bildschirm.modus = "manuell"
        aktuell = station
        atemClient.schalte(eingang: konfig.eingang(fuer: station), uebergang: uebergang)
    }

    func schalteEingang(_ eingang: Int) {
        atemClient.schalte(eingang: eingang, uebergang: uebergang)
    }

    private func pruefeBildschirm() {
        let m = konfig.bildschirm.modus
        guard m == "reihe" || m == "zufall" || m == "aktivitaet" else {
            naechsterWechsel = 0
            return
        }
        let jetzt = Date()
        naechsterWechsel = max(0, Int(wechselUm.timeIntervalSince(jetzt).rounded(.up)))
        guard atem.verbunden, jetzt >= wechselUm else { return }
        let online = (intern.keys.filter { istOnline($0, jetzt) }).sorted()
        guard !online.isEmpty else { return }
        wechselUm = jetzt.addingTimeInterval(TimeInterval(konfig.bildschirm.sekunden))
        let bediente = online.filter { i in intern[i]?.bedient.map { jetzt.timeIntervalSince($0) < Self.AKTIV_S } ?? false }
        let wahl = Self.waehle(modus: m, online: online, bediente: bediente, aktuell: aktuell)
        if wahl != aktuell || atem.programm != konfig.eingang(fuer: wahl) {
            atemClient.schalte(eingang: konfig.eingang(fuer: wahl), uebergang: uebergang)
        }
        aktuell = wahl
    }

    /// Welche Station kommt als Nächstes dran?
    nonisolated static func waehle(modus: String, online: [Int], bediente: [Int], aktuell: Int?,
                                   zufall: ([Int]) -> Int? = { $0.randomElement() }) -> Int {
        switch modus {
        case "reihe":
            return online.first { aktuell == nil || $0 > aktuell! } ?? online[0]
        case "aktivitaet" where !bediente.isEmpty:
            // Wer gerade bedient, kommt dran. Sind es mehrere, wird gewechselt.
            let andere = bediente.filter { $0 != aktuell }
            return zufall(andere) ?? aktuell ?? bediente[0]
        default:
            let andere = online.filter { $0 != aktuell }
            return zufall(andere.isEmpty ? online : andere) ?? online[0]
        }
    }

    // MARK: - Befehle an die Stationen

    func befehl(_ cmd: String, an station: Int) {
        intern[station, default: Intern()].befehle.append(cmd)
    }

    func befehlAnAlle(_ cmd: String) {
        for id in intern.keys { intern[id]?.befehle.append(cmd) }
        Protokoll.melde(cmd == "reset" ? "Alle Stationen zurückgesetzt" : "Alle Stationen neu geladen")
    }

    func stationsAdresse(_ id: Int) -> String {
        let ip = adressen.first?.ip ?? "127.0.0.1"
        return "http://\(ip):\(Self.PORT)/?station=\(id)"
    }

    // MARK: - Netzwerk-Schnittstelle

    private func api(_ a: Anfrage, _ fertig: @escaping (Antwort) -> Void) {
        if a.methode == "POST", a.fremdeHerkunft {
            fertig(.fehler(403, "Fremde Herkunft"))
            return
        }
        switch (a.methode, a.pfad) {
        case ("GET", "/api/drucker"):
            let z = druck.zielDrucker ?? ""
            fertig(.json(200, ["drucker": druck.drucker.map(\.name), "standard": z, "erlaubt": true, "probe": konfig.druck.probelauf]))
        case ("POST", "/api/station/puls"):
            fertig(puls(a))
        case ("POST", "/api/render/zustand"):
            fertig(renderZustand(a))
        case ("GET", "/api/render/strom"):
            guard let id = Int(a.query["station"] ?? ""), (1...Self.STATION_MAX).contains(id) else {
                fertig(.fehler(400, "Ungültige Station"))
                return
            }
            guard konfig.ausstellung.rechnen == "mini" else {
                fertig(.fehler(409, "Die Laptops rechnen selbst"))
                return
            }
            let farm = farm
            fertig(.strom { strom in
                Task { @MainActor in farm.oeffneStrom(station: id, strom: strom) }
            })
        case ("POST", "/api/drucken"):
            fertig(druckPDF(a))
        case ("POST", "/api/druck/auftrag"):
            druckAuftrag(a, fertig)
        case (_, let p) where p.hasPrefix("/api/regie/"):
            guard a.lokal else {
                fertig(.fehler(403, "Die Regie geht nur auf dem Mac mini selbst"))
                return
            }
            fertig(regieAnfrage(a))
        default:
            fertig(.leer(status: 404))
        }
    }

    private func jsonKoerper(_ a: Anfrage) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: a.body)) as? [String: Any]
    }

    private func gueltigeStation(_ wert: Any?) -> Int? {
        guard let z = wert as? NSNumber, CFGetTypeID(z) != CFBooleanGetTypeID(), let n = wert as? Int,
              (1...Self.STATION_MAX).contains(n) else { return nil }
        return n
    }

    private func puls(_ a: Anfrage) -> Antwort {
        guard let d = jsonKoerper(a), let id = gueltigeStation(d["id"]) else { return .fehler(400, "Ungültige Station") }
        var s = intern[id] ?? Intern()
        let jetzt = Date()
        if s.zuletzt == nil || jetzt.timeIntervalSince(s.zuletzt!) >= Self.ONLINE_S {
            Protokoll.melde("Station \(id) verbunden")
        }
        s.zuletzt = jetzt
        if let r = d["ruhe"] as? Int, (0...86400).contains(r) { s.bedient = jetzt.addingTimeInterval(-TimeInterval(r)) }
        s.ms = min(100000, max(0, d["ms"] as? Int ?? 0))
        s.fps = min(240, max(0, d["fps"] as? Int ?? 0))
        s.fern = d["fern"] as? Bool ?? false
        if !s.fern, let bild = d["bild"] as? String, bild.hasPrefix("data:image/jpeg;base64,"), bild.count < 300_000,
           let daten = Data(base64Encoded: String(bild.dropFirst(23))) {
            s.bildDaten = daten
            s.bild = NSImage(data: daten)
        }
        let befehle = s.befehle
        s.befehle = []
        intern[id] = s
        let k = konfig
        return .json(200, [
            "ausstellung": ["museum": k.ausstellung.museum, "live": k.druck.live, "drucker": k.druck.drucker, "format": k.druck.format,
                            "leistung": k.ausstellung.leistung, "rechnen": k.ausstellung.rechnen] as [String: Any],
            "befehle": befehle, "name": k.name(fuer: id),
        ])
    }

    private func renderZustand(_ a: Anfrage) -> Antwort {
        guard let d = jsonKoerper(a), let id = gueltigeStation(d["station"]) else { return .fehler(400, "Ungültige Station") }
        // Neu als JSON geschrieben: So landet nichts anderes als Daten in der Rechnerseite
        var z: String?
        var m: String?
        if var zustand = d["zustand"] as? [String: Any] {
            guard zustand["pieces"] is [Any], let p = zustand["poster"] as? [String: Any],
                  let w = p["w"] as? Int, let h = p["h"] as? Int, (1...2000).contains(w), (1...2000).contains(h) else {
                return .fehler(400, "Ungültiger Zustand")
            }
            // Was die Rechenlast bestimmt, bleibt in festen Grenzen. Eine einzelne Station darf den Mac mini nicht lahmlegen.
            zustand["skala"] = min(1, max(0.25, zustand["skala"] as? Double ?? 1))
            zustand["vorschau"] = [0, 96, 192].contains(zustand["vorschau"] as? Int ?? 0) ? zustand["vorschau"] : 0
            guard let daten = try? JSONSerialization.data(withJSONObject: zustand) else {
                return .fehler(400, "Ungültiger Zustand")
            }
            z = String(decoding: daten, as: UTF8.self)
        }
        if let maus = d["maus"] as? [String: Any], let x = maus["x"] as? Double, let y = maus["y"] as? Double {
            m = "{\"x\":\(x),\"y\":\(y)}"
        }
        farm.setzeZustand(station: id, zustandJSON: z, mausJSON: m)
        return .json(200, ["ok": true])
    }

    private func antwort(_ a: Druckserver.Annahme) -> Antwort {
        switch a {
        case let .ok(platz, probe): return .json(200, ["ok": true, "platz": platz, "probe": probe, "pause": konfig.druck.pauseSekunden])
        case let .warte(s): return .json(429, ["fehler": "Kurz warten", "warte": s])
        case let .abgelehnt(status, text): return .fehler(status, text)
        }
    }

    private func druckPDF(_ a: Anfrage) -> Antwort {
        guard (a.kopf["content-type"] ?? "").split(separator: ";").first?.trimmingCharacters(in: .whitespaces) == "application/pdf" else {
            return .fehler(415, "Nur PDF")
        }
        guard a.body.starts(with: Data("%PDF-".utf8)) else { return .fehler(400, "Keine PDF-Datei") }
        let station = Int(a.query["station"] ?? "").flatMap { (1...Self.STATION_MAX).contains($0) ? $0 : nil }
        // Vom Mac mini selbst ohne Stationsnummer: wie von Hand in der Regie
        if station == nil, !a.lokal { return .fehler(400, "Ungültige Station") }
        return antwort(druck.annehmen(pdf: a.body, station: station, format: a.query["format"] ?? konfig.druck.format))
    }

    private func druckAuftrag(_ a: Anfrage, _ fertig: @escaping (Antwort) -> Void) {
        guard let d = jsonKoerper(a), let id = gueltigeStation(d["station"]) else {
            fertig(.fehler(400, "Ungültige Station"))
            return
        }
        guard farm.kannDrucken(station: id) else {
            fertig(.fehler(409, "Für diese Station läuft kein Rechner"))
            return
        }
        druck.annehmen(renderVon: id, format: d["format"] as? String ?? konfig.druck.format) { [weak self] e in
            fertig(self?.antwort(e) ?? .leer(status: 503))
        }
    }

    /// Dieselben Schalter wie in der Oberfläche, für Tests und eigene Skripte auf dem Mac mini.
    private func regieAnfrage(_ a: Anfrage) -> Antwort {
        if a.methode == "GET", a.pfad == "/api/regie/status" { return .json(200, status()) }
        guard a.methode == "POST", let d = jsonKoerper(a) else { return .fehler(400, "Ungültige Anfrage") }
        do {
            switch a.pfad {
            case "/api/regie/setzen":
                konfig = try Konfiguration.aus(json: d, basis: konfig)
            case "/api/regie/befehl":
                guard let cmd = d["cmd"] as? String, ["reset", "neuladen", "zeigen"].contains(cmd) else { throw RegieFehler("Unbekannter Befehl") }
                if d["ziel"] as? String == "alle" {
                    befehlAnAlle(cmd)
                } else {
                    guard let id = gueltigeStation(d["ziel"]) else { throw RegieFehler("Ungültige Station") }
                    befehl(cmd, an: id)
                }
            case "/api/regie/schnitt":
                guard let id = gueltigeStation(d["station"]) else { throw RegieFehler("Ungültige Station") }
                try aufBildschirm(station: id)
            case "/api/regie/atem":
                if d["trennen"] as? Bool == true { trenneATEM() } else { try verbindeATEM(ip: d["ip"] as? String ?? "") }
            case "/api/regie/testseite":
                try druck.testseite()
            default:
                return .leer(status: 404)
            }
        } catch {
            return .fehler(400, error.localizedDescription)
        }
        return .json(200, status())
    }

    private static func oderNull<T>(_ w: T?) -> Any { w.map { $0 as Any } ?? NSNull() }

    func status() -> [String: Any] {
        let k = (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(konfig))) ?? [:]
        return [
            "cfg": k,
            "stationen": stationen.map { s in
                ["id": s.id, "online": s.online, "ruhe": Self.oderNull(s.bedientVor), "ms": s.ms, "fps": s.fps, "kb": s.kbJeSekunde,
                 "fern": s.rechnetAufMini, "eingang": s.eingang, "auf_monitor": s.aufBildschirm, "hat_bild": s.bild != nil] as [String: Any]
            },
            "atem": ["verbunden": atem.verbunden, "antwortet": atem.antwortet, "modell": atem.modell, "programm": Self.oderNull(atem.programm),
                     "vorschau": Self.oderNull(atem.vorschau), "ip": atem.ip, "meldung": atem.meldung,
                     "eingaenge": Dictionary(uniqueKeysWithValues: atem.eingaenge.map { (String($0.key), $0.value) })] as [String: Any],
            "licht": ["fehler": licht.fehler, "pakete": licht.pakete, "rgb": [licht.rot, licht.gruen, licht.blau]] as [String: Any],
            "druck": ["drucker": druck.drucker.map { ["name": $0.name, "anschluss": $0.anschluss, "zustand": $0.zustand, "bereit": $0.bereit, "geteilt": $0.geteilt] as [String: Any] },
                      "ziel": Self.oderNull(druck.zielDrucker), "heute": druck.heuteGedruckt, "freigabe": druck.freigabeSystem,
                      "auftraege": druck.auftraege.map { ["id": $0.id, "station": Self.oderNull($0.station), "status": $0.status.rawValue, "titel": $0.titel, "format": $0.format, "datei": Self.oderNull($0.datei?.path), "meldung": $0.meldung] as [String: Any] }] as [String: Any],
            "server": ["laeuft": serverLaeuft, "kopien": offlineKopien, "web": Pfade.web.path],
            "adressen": adressen.map(\.ip),
            "naechster": naechsterWechsel,
        ]
    }

    // MARK: - Beim Beenden

    func beenden() {
        sichereSofort()
        farm.alleSchliessen()
        server?.stoppe()
        kopien.values.forEach { $0.stoppe() }
    }
}
