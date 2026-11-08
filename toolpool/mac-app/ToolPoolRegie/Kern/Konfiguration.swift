import Foundation

/// Alle Einstellungen der Regie. Wird als JSON gespeichert und lässt sich sichern und laden.
struct Konfiguration: Codable, Equatable {
    struct Ausstellung: Codable, Equatable {
        var museum = true
        var rechnen = "mini"        // mini | laptop
        var leistung = "normal"     // normal | sparsam | minimal
        var qualitaet = 0.75        // JPEG-Qualität der Bilder zu den Laptops
        var stationen = 4
        var wachHalten = true
    }
    struct Bildschirm: Codable, Equatable {
        var modus = "aus"           // aus | manuell | reihe | zufall | aktivitaet
        var sekunden = 15
        var uebergang = "cut"       // cut | mix
        var mixBilder = 25
        var atemIP = "192.168.10.240"
        var atemAktiv = false
    }
    struct Licht: Codable, Equatable {
        var ziel = ""
        var universum = 0
        var adresse = 1
        var layout = "RGBW"         // RGB | RGBW | DRGB | DRGBW
        var anzahl = 1
        var szene = "aus"           // aus | farbe | atmen | wechsel | aktivitaet
        var farbe = "#ffffff"
        var hell = 100
        var druckBlitz = true
    }
    struct Druck: Codable, Equatable {
        var live = true
        var drucker = ""            // leer = Standarddrucker des Mac mini
        var format = "A4"           // A4 | A3
        var kopien = 1
        var pauseSekunden = 30      // je Station
        var tageslimit = 0          // 0 = keine Grenze
        var angehalten = false
        var probelauf = false
        var archiv = true
    }

    var ausstellung = Ausstellung()
    var bildschirm = Bildschirm()
    var licht = Licht()
    var druck = Druck()
    var namen: [String: String] = [:]       // Station -> Name
    var eingaenge: [String: Int] = [:]      // Station -> ATEM-Eingang (ohne Eintrag: gleiche Nummer)
    var eingerichtet = false

    static let modi = ["aus", "manuell", "reihe", "zufall", "aktivitaet"]
    static let szenen = ["aus", "farbe", "atmen", "wechsel", "aktivitaet"]
    static let layouts = ["RGB", "RGBW", "DRGB", "DRGBW"]
    static let stufen = ["normal", "sparsam", "minimal"]
    static let formate = ["A4", "A3"]

    func eingang(fuer station: Int) -> Int { eingaenge[String(station)] ?? station }
    func name(fuer station: Int) -> String { namen[String(station)] ?? "" }

    /// Bilder pro Sekunde zu den Laptops je Leistungsstufe.
    var bilderJeSekunde: Double {
        switch ausstellung.leistung {
        case "sparsam": return 20
        case "minimal": return 12
        default: return 30
        }
    }

    /// Prüft alle Werte: Grenzen werden eingehalten, Unbekanntes wird abgelehnt.
    func geprueft() throws -> Konfiguration {
        var k = self
        func wahl(_ wert: String, _ erlaubt: [String], _ was: String) throws {
            if !erlaubt.contains(wert) { throw RegieFehler("Unbekannt bei \(was): \(wert)") }
        }
        try wahl(k.ausstellung.rechnen, ["mini", "laptop"], "Rechnen")
        try wahl(k.ausstellung.leistung, Self.stufen, "Leistung")
        try wahl(k.bildschirm.modus, Self.modi, "Bildschirm")
        try wahl(k.bildschirm.uebergang, ["cut", "mix"], "Übergang")
        try wahl(k.licht.layout, Self.layouts, "DMX-Belegung")
        try wahl(k.licht.szene, Self.szenen, "Licht")
        try wahl(k.druck.format, Self.formate, "Format")
        k.ausstellung.qualitaet = min(0.95, max(0.3, k.ausstellung.qualitaet))
        k.ausstellung.stationen = min(32, max(1, k.ausstellung.stationen))
        k.bildschirm.sekunden = min(3600, max(3, k.bildschirm.sekunden))
        k.bildschirm.mixBilder = min(250, max(1, k.bildschirm.mixBilder))
        k.bildschirm.atemIP = try Pruefe.ipAdresse(k.bildschirm.atemIP)
        k.licht.ziel = try Pruefe.ipAdresse(k.licht.ziel)
        k.licht.universum = min(32767, max(0, k.licht.universum))
        k.licht.adresse = min(512, max(1, k.licht.adresse))
        k.licht.anzahl = min(100, max(1, k.licht.anzahl))
        k.licht.hell = min(100, max(0, k.licht.hell))
        if !Self.istFarbe(k.licht.farbe) { throw RegieFehler("Ungültige Farbe") }
        k.licht.farbe = k.licht.farbe.lowercased()
        k.druck.kopien = min(20, max(1, k.druck.kopien))
        k.druck.pauseSekunden = min(3600, max(0, k.druck.pauseSekunden))
        k.druck.tageslimit = min(10000, max(0, k.druck.tageslimit))
        k.druck.drucker = String(k.druck.drucker.prefix(200))
        k.eingaenge = k.eingaenge.mapValues { min(8, max(1, $0)) }
        k.namen = k.namen.mapValues { String($0.prefix(30)) }
        return k
    }

    static func istFarbe(_ t: String) -> Bool {
        t.count == 7 && t.first == "#" && t.dropFirst().allSatisfy(\.isHexDigit)
    }

    // MARK: - Laden, Speichern, Teiländerung

    /// Setzt ein JSON-Objekt über die Standardwerte. Fehlende Felder bekommen so ihren Standard,
    /// auch wenn eine Datei aus einer älteren Version stammt.
    static func aus(json: [String: Any], basis: Konfiguration = Konfiguration()) throws -> Konfiguration {
        let basisDaten = try JSONEncoder().encode(basis)
        guard let basisDict = try JSONSerialization.jsonObject(with: basisDaten) as? [String: Any] else {
            throw RegieFehler("Einstellungen sind beschädigt")
        }
        let zusammen = mische(basisDict, json)
        let daten = try JSONSerialization.data(withJSONObject: zusammen)
        do {
            return try JSONDecoder().decode(Konfiguration.self, from: daten).geprueft()
        } catch let f as RegieFehler {
            throw f
        } catch {
            throw RegieFehler("Einstellungen passen nicht: \(error.localizedDescription)")
        }
    }

    /// Bekannte Bereiche werden tief zusammengeführt, unbekannte Felder fallen weg.
    /// Namen und Eingänge haben keine festen Felder: Dort gilt jeder Eintrag.
    private static func mische(_ a: [String: Any], _ b: [String: Any]) -> [String: Any] {
        var r = a
        for (k, v) in b {
            if k == "namen" || k == "eingaenge", let va = a[k] as? [String: Any], let vb = v as? [String: Any] {
                r[k] = va.merging(vb) { _, neu in neu }
            } else if let va = a[k] as? [String: Any], let vb = v as? [String: Any] {
                r[k] = mische(va, vb)
            } else if a[k] != nil {
                r[k] = v
            }
        }
        return r
    }

    static func laden(von url: URL) -> Konfiguration {
        guard let d = try? Data(contentsOf: url) else { return Konfiguration() }
        do {
            guard let j = try JSONSerialization.jsonObject(with: d) as? [String: Any] else { return Konfiguration() }
            return try aus(json: j)
        } catch {
            Protokoll.melde("Einstellungen konnten nicht gelesen werden, Standardwerte gelten: \(error.localizedDescription)", art: .warnung)
            return Konfiguration()
        }
    }

    func speichern(nach url: URL) throws {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        try e.encode(self).write(to: url, options: .atomic)
    }
}
