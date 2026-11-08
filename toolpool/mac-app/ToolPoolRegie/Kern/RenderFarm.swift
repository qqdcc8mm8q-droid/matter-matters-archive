import AppKit
import Foundation
import WebKit

/// Rechnet die Plakate der Stationen auf dem Mac mini.
/// Je Station läuft eine unsichtbare Seite (render.html) mit derselben Engine wie auf den Laptops.
/// Der Takt kommt von hier, so wird die Seite auch dann nicht gebremst, wenn sie nie sichtbar ist.
@MainActor
final class RenderFarm {
    struct Werte: Equatable {
        var aktiv = false
        var ms = 0
        var fps = 0
        var kbJeSekunde = 0
    }

    private var arbeiter: [Int: Arbeiter] = [:]
    private var uhr: Timer?
    var seitenAdresse = URL(string: "http://127.0.0.1:8431/render.html")!
    var bilderJeSekunde = 30.0
    var qualitaet = 0.75
    /// Ohne Abnehmer bleibt eine Seite noch so lange im Speicher, dann wird sie geschlossen.
    private static let LEERLAUF_SCHLUSS: TimeInterval = 120
    /// Sagt, ob an der Station gerade niemand arbeitet. Dann fällt ein Neuladen der Rechnerseite nicht auf.
    var istRuhig: (Int) -> Bool = { _ in true }

    func starte() {
        let t = Timer(timeInterval: 1.0 / 120, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        uhr = t
    }

    private func tick() {
        let jetzt = Date()
        for (id, a) in arbeiter {
            a.schritt(jetzt: jetzt, bilderJeSekunde: bilderJeSekunde, qualitaet: qualitaet)
            if a.solltePflegen(jetzt: jetzt, ruhig: istRuhig(id)) { a.pflegen(jetzt: jetzt) }
            if a.leerlaufSeit.map({ jetzt.timeIntervalSince($0) > Self.LEERLAUF_SCHLUSS }) == true {
                a.schliessen()
                arbeiter[id] = nil
                Protokoll.melde("Station \(id): Rechner geschlossen, seit 2 Minuten kein Abruf")
            }
        }
    }

    private func arbeiter(fuer id: Int) -> Arbeiter {
        if let a = arbeiter[id] { return a }
        let a = Arbeiter(station: id, adresse: seitenAdresse)
        arbeiter[id] = a
        Protokoll.melde("Station \(id): Rechner auf dem Mac mini gestartet")
        return a
    }

    /// Ein Laptop holt Bilder ab.
    func oeffneStrom(station: Int, strom: Strom) {
        arbeiter(fuer: station).verbinde(strom: strom)
    }

    /// Vom Laptop: was gerade gebaut ist. Liegt bereits als geprüftes JSON vor.
    func setzeZustand(station: Int, zustandJSON: String?, mausJSON: String?) {
        let a = arbeiter(fuer: station)
        if let zustandJSON { a.neuerZustand(zustandJSON) }
        if let mausJSON { a.neueMaus(mausJSON) }
    }

    func werte(station: Int) -> Werte { arbeiter[station]?.werte() ?? Werte() }
    func letztesBild(station: Int) -> Data? { arbeiter[station]?.letztesBild }
    func kannDrucken(station: Int) -> Bool { arbeiter[station]?.hatZustand == true }

    func druck(station: Int, format: String, fertig: @escaping (Result<Data, Error>) -> Void) {
        guard let a = arbeiter[station], a.hatZustand else {
            fertig(.failure(RegieFehler("Für diese Station läuft kein Rechner")))
            return
        }
        a.druck(format: format, fertig: fertig)
    }

    func alleSchliessen() {
        arbeiter.values.forEach { $0.schliessen() }
        arbeiter = [:]
    }
}

@MainActor
private final class Arbeiter: NSObject, WKNavigationDelegate {
    let station: Int
    private let adresse: URL
    private var web: WKWebView!
    private var bereit = false

    private var strom: Strom?
    private(set) var hatZustand = false
    private var zustandZuletzt: String?     // bleibt erhalten für den Neustart der Seite
    private var zustandOffen: String?
    private var mausOffen: String?
    private var spielt = true
    private var vorschauAn = false

    private var rechnet = false
    private var rechnetSeit = Date()
    private var sendet = false
    private var naechstes = Date.distantPast
    private var letztesBildZeit = Date()
    private var letzterHerzschlag = Date.distantPast
    private var bildNummer = 0
    private(set) var leerlaufSeit: Date? = Date()
    private(set) var letztesBild: Data?

    // Messwerte
    private var msSchnitt = 0.0
    private var bilderZaehler = 0
    private var bytesZaehler = 0
    private var messStart = Date()
    private var gemessen = RenderFarm.Werte()

    private var geladenUm = Date()
    /// Die Seite wächst im Dauerbetrieb langsam im Speicher. Deshalb wird sie regelmäßig neu geladen:
    /// bevorzugt, wenn niemand an der Station arbeitet, spätestens nach der Höchstdauer.
    private static let PFLEGE_RUHIG: TimeInterval = Start.wert("--pflege").flatMap(Double.init) ?? 3600
    private static let PFLEGE_SPAETESTENS: TimeInterval = (Start.wert("--pflege").flatMap(Double.init) ?? 3600) * 4
    private static let HERZSCHLAG: TimeInterval = 1
    private static let AUFHAENGER: TimeInterval = 15
    private static let VORSCHAU_ALLE = 6

    init(station: Int, adresse: URL) {
        self.station = station
        self.adresse = adresse
        super.init()
        ladeSeite()
    }

    private func ladeSeite() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 64, height: 64), configuration: cfg)
        web.navigationDelegate = self
        bereit = false
        rechnet = false
        web.load(URLRequest(url: adresse, cachePolicy: .reloadIgnoringLocalCacheData))
    }

    func solltePflegen(jetzt: Date, ruhig: Bool) -> Bool {
        let alter = jetzt.timeIntervalSince(geladenUm)
        return alter > Self.PFLEGE_SPAETESTENS || (ruhig && alter > Self.PFLEGE_RUHIG)
    }

    func pflegen(jetzt: Date) {
        Protokoll.melde("Station \(station): Rechnerseite planmäßig neu geladen")
        geladenUm = jetzt
        ladeSeite()
    }

    func schliessen() {
        strom?.schliesse()
        strom = nil
        web.navigationDelegate = nil
        web.stopLoading()
        web = nil
    }

    func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
        bereit = true
        // Nach einem Neustart der Seite das letzte Board wieder einsetzen
        if zustandOffen == nil { zustandOffen = zustandZuletzt }
    }

    func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { spaeterNeuLaden(e) }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { spaeterNeuLaden(e) }

    private func spaeterNeuLaden(_ e: Error) {
        Protokoll.melde("Station \(station): Rechnerseite lädt nicht: \(e.localizedDescription)", art: .warnung)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            MainActor.assumeIsolated {
                guard let self, self.web != nil else { return }
                self.ladeSeite()
            }
        }
    }

    func webViewWebContentProcessDidTerminate(_ w: WKWebView) {
        Protokoll.melde("Station \(station): Rechnerseite abgestürzt, starte neu", art: .warnung)
        ladeSeite()
    }

    func verbinde(strom neu: Strom) {
        strom?.schliesse()
        strom = neu
        sendet = false
        leerlaufSeit = nil
        // Der Laptop schickt gleich danach sein Board
        neu.beiSchluss { [weak self, weak neu] in
            Task { @MainActor in
                guard let self, self.strom === neu else { return }
                self.strom = nil
                self.sendet = false
                self.leerlaufSeit = Date()
            }
        }
    }

    func neuerZustand(_ json: String) {
        zustandZuletzt = json
        zustandOffen = json
        hatZustand = true
        // Ob das Plakat läuft und ob Vorschauen gewünscht sind, steht im Zustand
        if let d = json.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            spielt = j["playing"] as? Bool ?? true
            vorschauAn = (j["vorschau"] as? Int ?? 0) > 0
        }
    }

    func neueMaus(_ json: String) { mausOffen = json }

    func schritt(jetzt: Date, bilderJeSekunde: Double, qualitaet: Double) {
        if rechnet, jetzt.timeIntervalSince(rechnetSeit) > Self.AUFHAENGER {
            Protokoll.melde("Station \(station): Rechnerseite hängt, starte neu", art: .warnung)
            ladeSeite()
            return
        }
        messeFertig(jetzt)
        guard bereit, strom != nil, !rechnet, !sendet else { return }
        let etwasNeu = zustandOffen != nil || mausOffen != nil
        guard hatZustand, spielt || etwasNeu else {
            // Plakat steht: Der Laptop erfährt so, dass der Mac mini noch da ist
            if jetzt.timeIntervalSince(letzterHerzschlag) >= Self.HERZSCHLAG {
                letzterHerzschlag = jetzt
                sendeHerzschlag()
            }
            return
        }
        guard jetzt >= naechstes else { return }
        // Fester Takt: Verspätungen aus dem Raster werden beim nächsten Bild aufgeholt
        let abstand = 1 / bilderJeSekunde
        naechstes = jetzt.timeIntervalSince(naechstes) > abstand ? jetzt.addingTimeInterval(abstand) : naechstes.addingTimeInterval(abstand)

        let dt = min(0.1, jetzt.timeIntervalSince(letztesBildZeit))
        letztesBildZeit = jetzt
        bildNummer += 1
        let vorschau = vorschauAn && bildNummer % Self.VORSCHAU_ALLE == 1
        var js = "(function(){"
        if let z = zustandOffen { js += "TPRender.zustand(\(z));" }
        if let m = mausOffen { js += "TPRender.maus(\(m));" }
        zustandOffen = nil
        mausOffen = nil
        // Wenige gerundete Werte statt immer neuer Zahlen: So bleibt der Aufruf meist derselbe Text,
        // und die Seite muss nicht für jedes Bild neuen Code übersetzen und aufbewahren.
        js += "var r=TPRender.bild(\(String(format: "%.3f", dt)),\(String(format: "%.2f", qualitaet)));"
        if vorschau { js += "if(r)r.v=TPRender.vorschau();" }
        js += "return r;})()"
        rechnet = true
        rechnetSeit = jetzt
        web.evaluateJavaScript(js) { [weak self] ergebnis, fehler in
            MainActor.assumeIsolated { self?.bildFertig(ergebnis, fehler) }
        }
    }

    private func bildFertig(_ ergebnis: Any?, _ fehler: Error?) {
        rechnet = false
        guard let d = ergebnis as? [String: Any], let b64 = d["bild"] as? String else {
            if let fehler { Protokoll.melde("Station \(station): \(fehler.localizedDescription)", art: .warnung) }
            return
        }
        let ms = d["ms"] as? Double ?? 0
        msSchnitt = msSchnitt * 0.9 + ms * 0.1
        let vorschau = d["v"] as? [String: Any]
        sendet = true
        let s = strom
        // Base64 auspacken und senden im Hintergrund, der Hauptthread bleibt frei
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let jpg = Data(base64Encoded: b64) else {
                Task { @MainActor in self?.sendet = false }
                return
            }
            var paket = Paket.bauen(typ: "P", meta: ["ms": Int(ms)], daten: jpg)
            if let v = vorschau, let vb = (v["bild"] as? String).flatMap({ Data(base64Encoded: $0) }) {
                var meta = v
                meta["bild"] = nil
                paket.append(Paket.bauen(typ: "V", meta: meta, daten: vb))
            }
            let groesse = paket.count
            guard let s else {
                Task { @MainActor in
                    self?.sendet = false
                    self?.letztesBild = jpg
                }
                return
            }
            s.sende(paket) { _ in
                Task { @MainActor in
                    guard let self else { return }
                    self.sendet = false
                    self.letztesBild = jpg
                    self.bilderZaehler += 1
                    self.bytesZaehler += groesse
                }
            }
        }
    }

    private func sendeHerzschlag() {
        guard let s = strom else { return }
        sendet = true
        s.sende(Paket.bauen(typ: "H", meta: [:], daten: Data())) { [weak self] _ in
            Task { @MainActor in self?.sendet = false }
        }
    }

    private func messeFertig(_ jetzt: Date) {
        let dauer = jetzt.timeIntervalSince(messStart)
        guard dauer >= 1 else { return }
        gemessen = RenderFarm.Werte(aktiv: strom != nil, ms: Int(msSchnitt.rounded()),
                                    fps: Int((Double(bilderZaehler) / dauer).rounded()),
                                    kbJeSekunde: Int(Double(bytesZaehler) / dauer / 1024))
        bilderZaehler = 0
        bytesZaehler = 0
        messStart = jetzt
    }

    func werte() -> RenderFarm.Werte { gemessen }

    func druck(format: String, fertig: @escaping (Result<Data, Error>) -> Void) {
        web.callAsyncJavaScript("return await TPRender.druck(format)", arguments: ["format": format], in: nil, in: .page) { [station] ergebnis in
            MainActor.assumeIsolated {
                switch ergebnis {
                case .success(let wert):
                    if let t = wert as? String, let d = Data(base64Encoded: t), d.starts(with: Data("%PDF-".utf8)) {
                        fertig(.success(d))
                    } else {
                        fertig(.failure(RegieFehler("Station \(station): kein gültiges PDF")))
                    }
                case .failure(let e):
                    fertig(.failure(e))
                }
            }
        }
    }
}

/// Aufbau eines Pakets zum Laptop: Typ (1 Byte) · Länge + JSON · Länge + Bild. Gegenstück: js/fern.js
enum Paket {
    static func bauen(typ: Character, meta: [String: Any], daten: Data) -> Data {
        let m = (try? JSONSerialization.data(withJSONObject: meta)) ?? Data("{}".utf8)
        var p = Data(capacity: 9 + m.count + daten.count)
        p.append(typ.asciiValue ?? 0x3F)
        var ml = UInt32(m.count).bigEndian
        withUnsafeBytes(of: &ml) { p.append(contentsOf: $0) }
        p.append(m)
        var dl = UInt32(daten.count).bigEndian
        withUnsafeBytes(of: &dl) { p.append(contentsOf: $0) }
        p.append(daten)
        return p
    }
}
