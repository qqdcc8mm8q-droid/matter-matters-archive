import XCTest
@testable import ToolPoolRegie

final class AtemPaketTests: XCTestCase {
    private func hex(_ b: [UInt8]) -> String { b.map { String(format: "%02x", $0) }.joined() }

    /// Die erwarteten Bytes stammen aus einem Mitschnitt der Bibliothek PyATEMMax,
    /// die im Projekt atem-steuerung am echten ATEM läuft.
    func testAnmeldung() {
        XCTAssertEqual(hex(AtemClient.helloPaket()), "1014000000000000003a00000100000000000000")
        XCTAssertEqual(hex(AtemClient.helloAck(sitzung: 0)), "800c00000000000000030000")
    }

    func testBestaetigung() {
        let b = AtemClient.kopf(flags: AtemClient.Flags.ack, laenge: 12, sitzung: 0x9b94, gegenID: 0x0102)
        XCTAssertEqual(hex(b), "800c9b940102000000000000")
    }

    func testSchnitt() {
        let p = AtemClient.befehlsPaket(name: "CPgI", daten: AtemClient.quellenDaten(3), sitzung: 0x9b94, eigeneID: 1)
        XCTAssertEqual(hex(p), "08189b940000000000000001000c00004350674900000003")
    }

    func testBlende() {
        XCTAssertEqual(hex(AtemClient.befehlsPaket(name: "CPvI", daten: AtemClient.quellenDaten(4), sitzung: 0x9b94, eigeneID: 2)),
                       "08189b940000000000000002000c00004350764900000004")
        XCTAssertEqual(hex(AtemClient.befehlsPaket(name: "CTTp", daten: [1, 0, 0, 0], sitzung: 0x9b94, eigeneID: 3)),
                       "08189b940000000000000003000c00004354547001000000")
        XCTAssertEqual(hex(AtemClient.befehlsPaket(name: "CTMx", daten: [0, 5, 0, 0], sitzung: 0x9b94, eigeneID: 4)),
                       "08189b940000000000000004000c000043544d7800050000")
        XCTAssertEqual(hex(AtemClient.befehlsPaket(name: "DAut", daten: [0, 0, 0, 0], sitzung: 0x9b94, eigeneID: 5)),
                       "08189b940000000000000005000c00004441757400000000")
    }
}

final class LichtTests: XCTestCase {
    func testArtNetKopf() {
        let p = LichtMotor.artDmx(universum: 2, sequenz: 7, daten: [UInt8](repeating: 0, count: 512))
        XCTAssertEqual(Array(p[0..<8]), Array("Art-Net\0".utf8))
        XCTAssertEqual(Array(p[8..<18]), [0x00, 0x50, 0x00, 0x0E, 7, 0, 2, 0, 0x02, 0x00])
        XCTAssertEqual(p.count, 18 + 512)
    }

    func testUniversumMitNetz() {
        let p = LichtMotor.artDmx(universum: 0x0123, sequenz: 1, daten: [0, 0])
        XCTAssertEqual(p[14], 0x23)
        XCTAssertEqual(p[15], 0x01)
    }

    func testBelegungen() {
        let farbe = (0.5, 0.25, 0.0)
        XCTAssertEqual(LichtMotor.kanaele(rgb: farbe, layout: "RGB"), [128, 64, 0])
        XCTAssertEqual(LichtMotor.kanaele(rgb: farbe, layout: "DRGBW"), [255, 128, 64, 0, 0])
        // Reines Weiß wandert auf den Weißkanal
        XCTAssertEqual(LichtMotor.kanaele(rgb: (1, 1, 1), layout: "RGBW"), [0, 0, 0, 255])
    }

    func testAdresseUndAnzahl() {
        var l = Konfiguration.Licht()
        l.layout = "RGB"
        l.adresse = 3
        l.anzahl = 2
        let d = LichtMotor.dmx(rgb: (1, 0, 0), licht: l)
        XCTAssertEqual(Array(d[0..<9]), [0, 0, 255, 0, 0, 255, 0, 0, 0])
    }

    func testAdresseAmEndeLaeuftNichtUeber() {
        var l = Konfiguration.Licht()
        l.layout = "RGB"
        l.adresse = 511
        l.anzahl = 3
        XCTAssertEqual(LichtMotor.dmx(rgb: (1, 1, 1), licht: l).count, 512)
    }

    func testSzenen() {
        var l = Konfiguration.Licht()
        l.farbe = "#ff0000"
        l.szene = "aus"
        XCTAssertEqual(LichtMotor.farbe(zeit: 1, licht: l, frische: 0, blitzRest: 0).0, 0)
        l.szene = "farbe"
        l.hell = 50
        XCTAssertEqual(LichtMotor.farbe(zeit: 1, licht: l, frische: 0, blitzRest: 0).0, 0.5, accuracy: 0.001)
        // Der Blitz hebt auch ein ausgeschaltetes Licht an
        l.szene = "aus"
        XCTAssertEqual(LichtMotor.farbe(zeit: 1, licht: l, frische: 0, blitzRest: 1).1, 1, accuracy: 0.001)
        l.druckBlitz = false
        XCTAssertEqual(LichtMotor.farbe(zeit: 1, licht: l, frische: 0, blitzRest: 1).1, 0, accuracy: 0.001)
    }
}

final class KonfigurationTests: XCTestCase {
    func testTeilaenderungBehaeltDenRest() throws {
        var basis = Konfiguration()
        basis.licht.adresse = 42
        let k = try Konfiguration.aus(json: ["licht": ["hell": 30], "namen": ["2": "Fenster"]], basis: basis)
        XCTAssertEqual(k.licht.adresse, 42)
        XCTAssertEqual(k.licht.hell, 30)
        XCTAssertEqual(k.name(fuer: 2), "Fenster")
    }

    func testAlteDateiBekommtStandardwerte() throws {
        let k = try Konfiguration.aus(json: ["druck": ["format": "A3"]])
        XCTAssertEqual(k.druck.format, "A3")
        XCTAssertTrue(k.druck.live)
    }

    func testFalscheWerteWerdenAbgelehnt() {
        XCTAssertThrowsError(try Konfiguration.aus(json: ["bildschirm": ["modus": "kaputt"]]))
        XCTAssertThrowsError(try Konfiguration.aus(json: ["licht": ["ziel": "keine.adresse"]]))
        XCTAssertThrowsError(try Konfiguration.aus(json: ["licht": ["farbe": "#zzzzzz"]]))
        XCTAssertThrowsError(try Konfiguration.aus(json: ["druck": ["format": "A0"]]))
        XCTAssertThrowsError(try Konfiguration.aus(json: ["licht": ["adresse": "viel"]]))
    }

    func testGrenzenWerdenEingehalten() throws {
        let k = try Konfiguration.aus(json: ["licht": ["adresse": 9999, "hell": -5], "druck": ["kopien": 0], "ausstellung": ["qualitaet": 2.0]])
        XCTAssertEqual(k.licht.adresse, 512)
        XCTAssertEqual(k.licht.hell, 0)
        XCTAssertEqual(k.druck.kopien, 1)
        XCTAssertEqual(k.ausstellung.qualitaet, 0.95)
    }

    func testEingangOhneEintragIstDieNummer() {
        var k = Konfiguration()
        XCTAssertEqual(k.eingang(fuer: 3), 3)
        k.eingaenge["3"] = 1
        XCTAssertEqual(k.eingang(fuer: 3), 1)
    }
}

final class BildschirmTests: XCTestCase {
    func testReihe() {
        XCTAssertEqual(Regie.waehle(modus: "reihe", online: [1, 2, 4], bediente: [], aktuell: nil), 1)
        XCTAssertEqual(Regie.waehle(modus: "reihe", online: [1, 2, 4], bediente: [], aktuell: 2), 4)
        XCTAssertEqual(Regie.waehle(modus: "reihe", online: [1, 2, 4], bediente: [], aktuell: 4), 1)
        // Station 3 ist weg: es geht bei der nächsten weiter
        XCTAssertEqual(Regie.waehle(modus: "reihe", online: [1, 4], bediente: [], aktuell: 2), 4)
    }

    func testZufallNimmtNichtDieselbe() {
        for _ in 0..<100 {
            XCTAssertNotEqual(Regie.waehle(modus: "zufall", online: [1, 2, 3], bediente: [], aktuell: 2), 2)
        }
        XCTAssertEqual(Regie.waehle(modus: "zufall", online: [2], bediente: [], aktuell: 2), 2)
    }

    func testAktivitaet() {
        // Nur eine bedient wird: sie bleibt
        XCTAssertEqual(Regie.waehle(modus: "aktivitaet", online: [1, 2, 3], bediente: [2], aktuell: 2), 2)
        XCTAssertEqual(Regie.waehle(modus: "aktivitaet", online: [1, 2, 3], bediente: [2], aktuell: 1), 2)
        // Mehrere: es wird gewechselt
        XCTAssertEqual(Regie.waehle(modus: "aktivitaet", online: [1, 2, 3], bediente: [2, 3], aktuell: 2), 3)
        // Keiner: zufällig, aber nicht dieselbe
        for _ in 0..<50 {
            XCTAssertNotEqual(Regie.waehle(modus: "aktivitaet", online: [1, 2], bediente: [], aktuell: 1), 1)
        }
    }
}

final class DruckTests: XCTestCase {
    func testOptionenLesen() {
        let o = Druckserver.optionen("device-uri=usb://Brother/MFC?serial=1 printer-info='Mein Drucker' printer-is-shared=false printer-state=3 printer-state-reasons=offline-report leer")
        XCTAssertEqual(o["device-uri"], "usb://Brother/MFC?serial=1")
        XCTAssertEqual(o["printer-info"], "Mein Drucker")
        XCTAssertEqual(o["printer-is-shared"], "false")
        XCTAssertEqual(o["printer-state-reasons"], "offline-report")
        XCTAssertEqual(o["leer"], "")
    }

    func testAnschluss() {
        XCTAssertEqual(Druckserver.anschluss("usb://Brother/X"), "USB, direkt am Rechner")
        XCTAssertEqual(Druckserver.anschluss("ippusb://Canon"), "USB, direkt am Rechner")
        XCTAssertEqual(Druckserver.anschluss("dnssd://Canon._ipps._tcp"), "Netzwerk")
    }

    func testAuftragsnummer() {
        XCTAssertEqual(Druckserver.auftragsnummer("request id is Canon_TS9500-123 (1 file(s))\n", drucker: "Canon_TS9500"), "Canon_TS9500-123")
        XCTAssertEqual(Druckserver.auftragsnummer("Anfrage-ID ist Canon_TS9500-7 (1 Datei(en))", drucker: "Canon_TS9500"), "Canon_TS9500-7")
        XCTAssertEqual(Druckserver.auftragsnummer("nichts", drucker: "Canon_TS9500"), "")
    }

    func testStandarddrucker() {
        XCTAssertEqual(Druckserver.standardName("system default destination: Canon_2\n"), "Canon_2")
        XCTAssertEqual(Druckserver.standardName("System-Standardzielort: Canon_2\n"), "Canon_2")
        XCTAssertEqual(Druckserver.standardName("no system default destination\n"), "")
    }

    func testZustandsText() {
        XCTAssertEqual(Druckserver.zustandsText(status: "3", gruende: "none", nimmtAn: true), "bereit")
        XCTAssertEqual(Druckserver.zustandsText(status: "4", gruende: "none", nimmtAn: true), "druckt")
        XCTAssertEqual(Druckserver.zustandsText(status: "5", gruende: "media-empty-error", nimmtAn: true), "Papier leer")
        XCTAssertEqual(Druckserver.zustandsText(status: "3", gruende: "none", nimmtAn: false), "nimmt keine Aufträge an")
    }

    @MainActor func testTestseiteIstEinPDF() throws {
        let d = try Druckserver.testPDF(format: "A3", drucker: "Probe")
        XCTAssertTrue(d.starts(with: Data("%PDF-".utf8)))
        let seite = CGPDFDocument(CGDataProvider(data: d as CFData)!)!.page(at: 1)!
        XCTAssertEqual(seite.getBoxRect(.mediaBox).width, 297 * 72 / 25.4, accuracy: 0.5)
    }
}

final class ServerTests: XCTestCase {
    private func anfrage(_ pfad: String, methode: String = "GET") -> Anfrage {
        Anfrage(methode: methode, rohPfad: pfad, pfad: pfad, query: [:], kopf: [:], body: Data(), lokal: false)
    }

    private func seite() throws -> (StatischeSeite, URL) {
        let w = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: w.appendingPathComponent("a"), withIntermediateDirectories: true)
        try Data("start".utf8).write(to: w.appendingPathComponent("index.html"))
        try Data("x".utf8).write(to: w.appendingPathComponent("a/x.js"))
        addTeardownBlock { try? FileManager.default.removeItem(at: w) }
        return (StatischeSeite(wurzel: w, routerRueckfall: true), w)
    }

    func testPfadeNachOben() throws {
        let (s, _) = try seite()
        guard case .leer(403, _) = s.antwort(auf: anfrage("/../geheim")) else { return XCTFail() }
        guard case .leer(403, _) = s.antwort(auf: anfrage("/a/../../geheim")) else { return XCTFail() }
    }

    func testRouterRueckfall() throws {
        let (s, w) = try seite()
        guard case let .datei(u) = s.antwort(auf: anfrage("/irgendeine/seite")) else { return XCTFail() }
        XCTAssertEqual(u.lastPathComponent, "index.html")
        XCTAssertTrue(u.path.hasPrefix(w.path))
        guard case .leer(404, _) = s.antwort(auf: anfrage("/fehlt.js")) else { return XCTFail() }
    }

    func testOrdnerBekommtSchraegstrich() throws {
        let (s, _) = try seite()
        guard case let .leer(301, k) = s.antwort(auf: anfrage("/a")) else { return XCTFail() }
        XCTAssertEqual(k["Location"], "/a/")
    }

    func testPostBeiKopien() throws {
        let (s, _) = try seite()
        guard case .leer(204, _) = s.antwort(auf: anfrage("/irgendwas", methode: "POST")) else { return XCTFail() }
    }

    func testFremdeHerkunft() {
        var a = Anfrage(methode: "POST", rohPfad: "/", pfad: "/", query: [:], kopf: ["origin": "http://boese.example", "host": "10.0.0.1:8431"], body: Data(), lokal: false)
        XCTAssertTrue(a.fremdeHerkunft)
        a = Anfrage(methode: "POST", rohPfad: "/", pfad: "/", query: [:], kopf: ["origin": "http://10.0.0.1:8431", "host": "10.0.0.1:8431"], body: Data(), lokal: false)
        XCTAssertFalse(a.fremdeHerkunft)
        a = Anfrage(methode: "POST", rohPfad: "/", pfad: "/", query: [:], kopf: ["host": "10.0.0.1:8431"], body: Data(), lokal: false)
        XCTAssertFalse(a.fremdeHerkunft)
    }

    func testPaketZumLaptop() throws {
        let p = Paket.bauen(typ: "P", meta: ["ms": 5], daten: Data([1, 2, 3]))
        XCTAssertEqual(p[0], UInt8(ascii: "P"))
        let ml = Int(p[4])
        XCTAssertEqual(String(decoding: p[5..<(5 + ml)], as: UTF8.self), "{\"ms\":5}")
        XCTAssertEqual(Array(p[(5 + ml)..<(9 + ml)]), [0, 0, 0, 3])
        XCTAssertEqual(Array(p[(9 + ml)...]), [1, 2, 3])
    }
}

final class StarterTests: XCTestCase {
    func testStarterEnthaeltAdresse() throws {
        XCTAssertTrue(StationStarter.mac(adresse: "192.168.10.10", station: 2).contains("http://192.168.10.10:8431/?station=2"))
        XCTAssertTrue(StationStarter.windows(adresse: "192.168.10.10", station: 3).contains("http://192.168.10.10:8431/?station=3"))
    }

    func testIPAdressen() throws {
        XCTAssertEqual(try Pruefe.ipAdresse(" 192.168.10.240 "), "192.168.10.240")
        XCTAssertEqual(try Pruefe.ipAdresse(""), "")
        XCTAssertThrowsError(try Pruefe.ipAdresse("300.1.1.1"))
    }
}
