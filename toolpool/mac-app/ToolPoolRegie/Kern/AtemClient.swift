import Foundation
import Network

/// Spricht direkt mit dem ATEM (UDP, Port 9910).
/// Der Ablauf folgt der Bibliothek PyATEMMax, mit der das Projekt atem-steuerung am echten Gerät läuft:
/// Anmeldung, Bestätigen jedes Pakets, Nachfordern verlorener Startpakete, Neuverbindung nach 5 Sekunden Stille.
final class AtemClient {
    struct Zustand: Equatable {
        var ip = ""
        var aktiv = false
        var verbunden = false
        var antwortet = false       // das Gerät hat sich gemeldet, der Abgleich läuft noch
        var modell = ""
        var programm: Int?
        var vorschau: Int?
        var eingaenge: [Int: String] = [:]
        var meldung = ""
    }

    enum Uebergang: Equatable {
        case schnitt
        case blende(bilder: Int)
    }

    /// Wird auf dem Hauptthread aufgerufen.
    var beiAenderung: ((Zustand) -> Void)?

    // Protokollkonstanten
    static let port: UInt16 = 9910
    static let kopfLaenge = 12
    static let befehlsKopfLaenge = 8
    static let maxStartpakete = 500
    private static let zeitlimit: TimeInterval = 5
    private static let takt = 0.05

    struct Flags {
        static let ackRequest: UInt8 = 0x01
        static let hello: UInt8 = 0x02
        static let resend: UInt8 = 0x04
        static let requestNextAfter: UInt8 = 0x08
        static let ack: UInt8 = 0x10
    }

    private let q = DispatchQueue(label: "atem")
    private var fd: Int32 = -1
    private var lesen: DispatchSourceRead?
    private var uhr: DispatchSourceTimer?
    private var z = Zustand()
    private var gemeldet = Zustand()

    // Sitzung
    private var sitzung: UInt16 = 0
    private var zaehler: UInt16 = 0
    private var letzterKontakt = Date()
    private var startpaketeDa = false      // ATEM hat seinen Zustand vollständig geschickt
    private var startpaketeBis = maxStartpakete
    private var fehlt = [Bool](repeating: true, count: maxStartpakete + 1)
    private var wartetAufNachlieferung = false

    // Schnitt bestätigen
    private var sollProgramm: Int?
    private var sollSeit = Date()
    private var sollVersuche = 0

    deinit {
        lesen?.cancel()
        uhr?.cancel()
    }

    // MARK: - Öffentlich

    func verbinde(ip: String) {
        q.async { self.neuVerbinden(ip: ip) }
    }

    func trenne() {
        q.async {
            self.aufraeumen()
            self.z = Zustand()
            self.melden()
        }
    }

    func schalte(eingang: Int, uebergang: Uebergang) {
        q.async {
            guard self.z.verbunden else { return }
            let quelle = UInt16(clamping: eingang)
            switch uebergang {
            case .schnitt:
                self.sendeBefehl("CPgI", Self.quellenDaten(quelle))
                self.sollProgramm = eingang
                self.sollSeit = Date()
                self.sollVersuche = 0
            case .blende(let bilder):
                self.sendeBefehl("CPvI", Self.quellenDaten(quelle))
                self.sendeBefehl("CTTp", [0x01, 0, 0, 0])     // Bit 0: Stil setzen, Stil 0 = Blende
                self.sendeBefehl("CTMx", [0, UInt8(clamping: bilder), 0, 0])
                self.sendeBefehl("DAut", [0, 0, 0, 0])
                self.sollProgramm = nil
            }
        }
    }

    // MARK: - Pakete bauen (auch für die Tests)

    static func quellenDaten(_ quelle: UInt16) -> [UInt8] {
        [0, 0, UInt8(quelle >> 8), UInt8(quelle & 0xFF)]
    }

    static func kopf(flags: UInt8, laenge: Int, sitzung: UInt16, gegenID: UInt16 = 0, eigeneID: UInt16 = 0) -> [UInt8] {
        var b = [UInt8](repeating: 0, count: kopfLaenge)
        let wort = (UInt16(flags) << 11) | (UInt16(laenge) & 0x07FF)
        b[0] = UInt8(wort >> 8)
        b[1] = UInt8(wort & 0xFF)
        b[2] = UInt8(sitzung >> 8)
        b[3] = UInt8(sitzung & 0xFF)
        b[4] = UInt8(gegenID >> 8)
        b[5] = UInt8(gegenID & 0xFF)
        b[10] = UInt8(eigeneID >> 8)
        b[11] = UInt8(eigeneID & 0xFF)
        return b
    }

    static func helloPaket() -> [UInt8] {
        var b = kopf(flags: Flags.hello, laenge: kopfLaenge + befehlsKopfLaenge, sitzung: 0)
        b += [UInt8](repeating: 0, count: befehlsKopfLaenge)
        b[9] = 0x3A
        b[12] = 0x01
        return b
    }

    static func helloAck(sitzung: UInt16) -> [UInt8] {
        var b = kopf(flags: Flags.ack, laenge: kopfLaenge, sitzung: sitzung)
        b[9] = 0x03
        return b
    }

    static func befehlsPaket(name: String, daten: [UInt8], sitzung: UInt16, eigeneID: UInt16) -> [UInt8] {
        let befehlsLaenge = befehlsKopfLaenge + daten.count
        var b = kopf(flags: Flags.ackRequest, laenge: kopfLaenge + befehlsLaenge, sitzung: sitzung, eigeneID: eigeneID)
        b += [UInt8(befehlsLaenge >> 8), UInt8(befehlsLaenge & 0xFF), 0, 0]
        b += Array(name.utf8.prefix(4))
        b += daten
        return b
    }

    // MARK: - Verbindung

    private func aufraeumen() {
        lesen?.cancel()
        lesen = nil
        uhr?.cancel()
        uhr = nil
        // Der Socket wird im cancelHandler von `lesen` geschlossen
        fd = -1
    }

    private func neuVerbinden(ip: String) {
        aufraeumen()
        z = Zustand()
        z.ip = ip
        z.aktiv = true
        let s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard s >= 0 else {
            z.meldung = "Netzwerk nicht verfügbar"
            melden()
            return
        }
        _ = fcntl(s, F_SETFL, fcntl(s, F_GETFL) | O_NONBLOCK)
        var adr = sockaddr_in()
        adr.sin_family = sa_family_t(AF_INET)
        adr.sin_port = Self.port.bigEndian
        guard inet_pton(AF_INET, ip, &adr.sin_addr) == 1 else {
            Darwin.close(s)
            z.meldung = "Das ist keine gültige Adresse"
            melden()
            return
        }
        let verbunden = withUnsafePointer(to: &adr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(s, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        if verbunden != 0 {
            z.meldung = "Keine Verbindung ins Netz: \(String(cString: strerror(errno)))"
        }
        fd = s
        let leser = DispatchSource.makeReadSource(fileDescriptor: s, queue: q)
        leser.setEventHandler { [weak self] in self?.empfange() }
        leser.setCancelHandler { Darwin.close(s) }
        leser.resume()
        lesen = leser
        let u = DispatchSource.makeTimerSource(queue: q)
        u.schedule(deadline: .now() + Self.takt, repeating: Self.takt)
        u.setEventHandler { [weak self] in self?.tick() }
        u.resume()
        uhr = u
        anmelden()
        melden()
    }

    private func anmelden() {
        sitzung = 0
        zaehler = 0
        startpaketeDa = false
        startpaketeBis = Self.maxStartpakete
        fehlt = [Bool](repeating: true, count: Self.maxStartpakete + 1)
        wartetAufNachlieferung = false
        letzterKontakt = Date()
        z.verbunden = false
        z.antwortet = false
        z.programm = nil
        z.vorschau = nil
        sende(Self.helloPaket())
    }

    private func sende(_ b: [UInt8]) {
        guard fd >= 0 else { return }
        let n = b.withUnsafeBytes { Darwin.send(fd, $0.baseAddress, $0.count, 0) }
        if n < 0, errno != EAGAIN, errno != ECONNREFUSED {
            let text = errno == EHOSTUNREACH || errno == ENETUNREACH || errno == ENETDOWN
                ? "Gerät nicht erreichbar. Netzwerk und Freigabe „Lokales Netzwerk“ prüfen."
                : "Senden geht nicht: \(String(cString: strerror(errno)))"
            if z.meldung != text {
                z.meldung = text
                melden()
            }
        }
    }

    private func sendeBefehl(_ name: String, _ daten: [UInt8]) {
        zaehler &+= 1
        sende(Self.befehlsPaket(name: name, daten: daten, sitzung: sitzung, eigeneID: zaehler))
    }

    private func tick() {
        // Startpakete vollständig? Sonst das erste fehlende nachfordern.
        if !z.verbunden, startpaketeDa, !wartetAufNachlieferung {
            var fehlend: Int?
            if startpaketeBis > 1 {
                for i in 1..<startpaketeBis where i <= Self.maxStartpakete && fehlt[i] {
                    fehlend = i
                    break
                }
            }
            if let i = fehlend {
                var b = Self.kopf(flags: Flags.requestNextAfter, laenge: Self.kopfLaenge, sitzung: sitzung)
                let vor = UInt16(i - 1)
                b[6] = UInt8(vor >> 8)
                b[7] = UInt8(vor & 0xFF)
                b[8] = 0x01
                sende(b)
                wartetAufNachlieferung = true
            } else {
                z.verbunden = true
                z.meldung = ""
                melden()
            }
        }
        // Ein Schnitt, der nicht ankam, wird wiederholt
        if let soll = sollProgramm, z.verbunden {
            if z.programm == soll {
                sollProgramm = nil
            } else if Date().timeIntervalSince(sollSeit) > 0.5 {
                if sollVersuche < 2 {
                    sollVersuche += 1
                    sollSeit = Date()
                    sendeBefehl("CPgI", Self.quellenDaten(UInt16(clamping: soll)))
                } else {
                    sollProgramm = nil
                    z.meldung = "ATEM hat den Schnitt nicht bestätigt"
                    melden()
                }
            }
        }
        if Date().timeIntervalSince(letzterKontakt) > Self.zeitlimit {
            let warVerbunden = z.verbunden
            if warVerbunden { z.meldung = "Verbindung verloren, verbinde neu" }
            anmelden()
            melden()
            if warVerbunden { Protokoll.melde("ATEM: Verbindung verloren", art: .warnung) }
        }
    }

    private func empfange() {
        guard fd >= 0 else { return }
        var puffer = [UInt8](repeating: 0, count: 10240)
        while true {
            let n = puffer.withUnsafeMutableBytes { recv(fd, $0.baseAddress, $0.count, 0) }
            if n <= 0 { break }
            verarbeite(Array(puffer[0..<n]))
        }
        melden()
    }

    private static func u16(_ b: [UInt8], _ i: Int) -> Int { (Int(b[i]) << 8) | Int(b[i + 1]) }

    private func verarbeite(_ b: [UInt8]) {
        guard b.count >= Self.kopfLaenge else { return }
        let paketSitzung = UInt16(Self.u16(b, 2))
        if sitzung == 0, paketSitzung != 0 {
            sitzung = paketSitzung
        } else if paketSitzung != sitzung {
            return   // Paket einer anderen Sitzung
        }
        let flags = b[0] >> 3
        let id = Self.u16(b, 10)
        if id < Self.maxStartpakete { fehlt[id] = false }
        let laenge = Self.u16(b, 0) & 0x07FF
        guard b.count >= laenge else { return }

        letzterKontakt = Date()
        wartetAufNachlieferung = false

        if flags & Flags.hello != 0 {
            let belegung = b.count > 12 ? b[12] : 0
            if belegung == 3 {
                z.meldung = "ATEM ist voll: zu viele Programme verbunden"
            } else {
                z.antwortet = true
                if !z.verbunden { z.meldung = "" }
                sende(Self.helloAck(sitzung: sitzung))
            }
        }
        if !startpaketeDa, laenge == Self.kopfLaenge, id > 1 {
            startpaketeDa = true
            startpaketeBis = id
        }
        if flags & Flags.ackRequest != 0, z.verbunden || flags & Flags.resend == 0 {
            sende(Self.kopf(flags: Flags.ack, laenge: Self.kopfLaenge, sitzung: sitzung, gegenID: UInt16(id)))
        } else if startpaketeDa, flags & Flags.requestNextAfter != 0, z.verbunden {
            // Der ATEM vermisst ein Paket von uns: leeres Paket schicken, damit er nicht hängen bleibt
            var a = Self.kopf(flags: Flags.ack, laenge: Self.kopfLaenge, sitzung: sitzung)
            a[0] = Flags.ackRequest << 3
            a[10] = b[6]
            a[11] = b[7]
            sende(a)
        }
        if laenge > Self.kopfLaenge, flags & Flags.hello == 0 {
            liesBefehle(b)
        }
    }

    private func liesBefehle(_ b: [UInt8]) {
        var i = Self.kopfLaenge
        while i + Self.befehlsKopfLaenge <= b.count {
            let l = Self.u16(b, i)
            guard l > Self.befehlsKopfLaenge, i + l <= b.count else { return }
            let name = String(decoding: b[(i + 4)..<(i + 8)], as: UTF8.self)
            let d = Array(b[(i + 8)..<(i + l)])
            switch name {
            case "_pin":
                z.modell = Self.text(d, von: 0, laenge: 44)
            case "PrgI" where d.count >= 4 && d[0] == 0:
                z.programm = Self.u16(d, 2)
            case "PrvI" where d.count >= 4 && d[0] == 0:
                z.vorschau = Self.u16(d, 2)
            case "InPr" where d.count >= 31:
                // Nur die echten Eingänge (Anschlussart 0 = extern)
                if d[30] == 0 {
                    z.eingaenge[Self.u16(d, 0)] = Self.text(d, von: 2, laenge: 20)
                }
            case "InCm":
                // Ende der Startdaten. Neuere Modelle schicken dafür keine leeren Pakete mehr.
                if !startpaketeDa {
                    startpaketeDa = true
                    startpaketeBis = Self.u16(b, 10)
                }
            default:
                break
            }
            i += l
        }
    }

    private static func text(_ d: [UInt8], von: Int, laenge: Int) -> String {
        let ende = min(von + laenge, d.count)
        guard von < ende else { return "" }
        let stueck = d[von..<ende].prefix { $0 != 0 }
        return String(decoding: stueck, as: UTF8.self).trimmingCharacters(in: .whitespaces)
    }

    private func melden() {
        guard z != gemeldet else { return }
        gemeldet = z
        let kopie = z
        DispatchQueue.main.async { [weak self] in self?.beiAenderung?(kopie) }
    }
}
