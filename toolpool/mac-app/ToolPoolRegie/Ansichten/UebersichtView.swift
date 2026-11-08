import SwiftUI

struct UebersichtView: View {
    @EnvironmentObject private var regie: Regie
    private let spalten = [GridItem(.adaptive(minimum: 240, maximum: 420), spacing: 16, alignment: .top)]

    var body: some View {
        VStack(spacing: 0) {
            Kopf(titel: "Übersicht", unterzeile: unterzeile) {
                HStack {
                    Button("Alle zurücksetzen") { regie.befehlAnAlle("reset") }
                    Button("Alle neu laden") { regie.befehlAnAlle("neuladen") }
                }
            }
            StatusLeiste().padding(.horizontal, 24).padding(.bottom, 12)
            Divider()
            ScrollView {
                LazyVGrid(columns: spalten, spacing: 16) {
                    ForEach(regie.stationen) { s in
                        StationKarte(station: s)
                    }
                }
                .padding(24)
            }
        }
    }

    private var unterzeile: String {
        let n = regie.stationen.filter(\.online).count
        return n == 0 ? "Noch keine Station verbunden" : "\(n) von \(regie.stationen.count) Stationen verbunden"
    }
}

private struct StatusLeiste: View {
    @EnvironmentObject private var regie: Regie

    var body: some View {
        HStack(spacing: 12) {
            Kachel(titel: "Bildschirm", wert: bildschirm, zustand: regie.atem.verbunden ? .gut : (regie.konfig.bildschirm.atemAktiv ? .warnung : .aus))
            Kachel(titel: "Licht", wert: LichtView.name(regie.konfig.licht.szene), zustand: regie.konfig.licht.ziel.isEmpty ? .aus : (regie.licht.fehler.isEmpty ? .gut : .warnung))
            Kachel(titel: "Druck", wert: druck, zustand: druckZustand)
            Kachel(titel: "Rechnen", wert: regie.konfig.ausstellung.rechnen == "mini" ? "Mac mini" : "Laptops", zustand: .gut)
        }
    }

    private var bildschirm: String {
        guard regie.atem.verbunden else { return regie.konfig.bildschirm.atemAktiv ? "ATEM wird gesucht" : "ATEM nicht verbunden" }
        return Regie.modusName(regie.konfig.bildschirm.modus).capitalizedErsterBuchstabe
    }

    private var druck: String {
        let offen = regie.druck.auftraege.filter { $0.status.offen }.count
        let basis = regie.konfig.druck.probelauf ? "Probelauf" : (regie.druck.zielDrucker ?? "kein Drucker")
        return offen > 0 ? "\(basis) · \(offen) offen" : "\(basis) · \(regie.druck.heuteGedruckt) heute"
    }

    private var druckZustand: Punkt.Zustand {
        if regie.konfig.druck.probelauf { return .warnung }
        guard let z = regie.druck.zielDrucker, let d = regie.druck.drucker.first(where: { $0.name == z }) else { return .warnung }
        return d.bereit ? .gut : .warnung
    }
}

private struct Kachel: View {
    let titel: String
    let wert: String
    let zustand: Punkt.Zustand

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Punkt(zustand: zustand)
                Text(titel).font(.caption).foregroundStyle(.secondary)
            }
            Text(wert).font(.callout.weight(.medium)).lineLimit(1).truncationMode(.middle)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
    }
}

struct StationKarte: View {
    @EnvironmentObject private var regie: Regie
    let station: StationLage

    private var name: Binding<String> {
        Binding(get: { regie.konfig.name(fuer: station.id) }, set: { regie.konfig.namen[String(station.id)] = $0 })
    }
    private var eingang: Binding<Int> {
        Binding(get: { regie.konfig.eingang(fuer: station.id) }, set: { regie.konfig.eingaenge[String(station.id)] = $0 })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Punkt(zustand: station.online ? .gut : .aus)
                TextField("Station \(station.id)", text: name)
                    .textFieldStyle(.plain)
                    .font(.headline)
                    .accessibilityLabel("Name von Station \(station.id)")
                if station.aufBildschirm {
                    Text("AUF SENDUNG")
                        .font(.caption2.monospaced().weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(Color.sendung, in: RoundedRectangle(cornerRadius: 3))
                }
            }
            bild
            VStack(alignment: .leading, spacing: 2) {
                Text(bedient).font(.caption).foregroundStyle(.secondary)
                if station.online { last } else { Text(" ").font(.caption) }
            }
            Stepper(value: eingang, in: 1...8) {
                Text("ATEM-Eingang \(eingang.wrappedValue)").font(.caption)
            }
            HStack {
                Button("Auf den Bildschirm") {
                    do { try regie.aufBildschirm(station: station.id) } catch { regie.hinweis = error.localizedDescription }
                }
                .disabled(!regie.atem.verbunden)
                Spacer()
                Menu {
                    Button("Zurücksetzen") { regie.befehl("reset", an: station.id) }
                    Button("Neu laden") { regie.befehl("neuladen", an: station.id) }
                    Button("Nummer auf dem Laptop zeigen") { regie.befehl("zeigen", an: station.id) }
                    Divider()
                    Button("Adresse kopieren") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(regie.stationsAdresse(station.id), forType: .string)
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .accessibilityLabel("Weitere Aktionen für Station \(station.id)")
            }
        }
        .padding(12)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(station.aufBildschirm ? Color.sendung : Color.secondary.opacity(0.25), lineWidth: station.aufBildschirm ? 2 : 1)
        }
    }

    @ViewBuilder private var bild: some View {
        ZStack {
            Rectangle().fill(.quaternary.opacity(0.4))
            if station.online, let b = station.bild {
                Image(nsImage: b).resizable().interpolation(.medium).aspectRatio(contentMode: .fit)
            } else {
                VStack(spacing: 4) {
                    Text("Auf dem Laptop öffnen:").font(.caption).foregroundStyle(.secondary)
                    Text(regie.stationsAdresse(station.id))
                        .font(.caption.monospaced())
                        .multilineTextAlignment(.center)
                        .textSelection(.enabled)
                }
                .padding(10)
            }
        }
        .frame(height: 230)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .accessibilityLabel(station.online ? "Plakat von Station \(station.id)" : "Station \(station.id) nicht verbunden")
    }

    private var bedient: String {
        guard station.online else { return "nicht verbunden" }
        guard let r = station.bedientVor else { return "noch nicht bedient" }
        if r < 5 { return "wird gerade bedient" }
        return r < 120 ? "bedient vor \(r) s" : "bedient vor \(r / 60) min"
    }

    private var last: some View {
        let ort = station.rechnetAufMini ? "Mac mini" : "Laptop"
        let langsam = station.ms > 33
        let netz = station.rechnetAufMini && station.kbJeSekunde > 0 ? String(format: " · %.1f MB/s", Double(station.kbJeSekunde) / 1024) : ""
        return Text("\(ort) · \(station.ms) ms · \(station.fps) B/s\(netz)")
            .font(.caption.monospaced())
            .foregroundStyle(langsam ? Color.orange : Color.secondary)
            .help(langsam ? "Ein Bild dauert länger als ein Dreißigstel Sekunde. Die Laststufe senken." : "Wer rechnet, wie lange ein Bild dauert und wie viele Bilder pro Sekunde laufen")
    }
}
