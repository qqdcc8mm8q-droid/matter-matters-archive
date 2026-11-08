import SwiftUI

enum Bereich: String, CaseIterable, Identifiable {
    case uebersicht, ausstellung, bildschirm, licht, druck, einrichtung, protokoll, doku
    var id: String { rawValue }

    var titel: String {
        switch self {
        case .uebersicht: return "Übersicht"
        case .ausstellung: return "Stationen"
        case .bildschirm: return "Bildschirm"
        case .licht: return "Licht"
        case .druck: return "Druckserver"
        case .einrichtung: return "Einrichtung"
        case .protokoll: return "Protokoll"
        case .doku: return "Dokumentation"
        }
    }

    var symbol: String {
        switch self {
        case .uebersicht: return "square.grid.2x2"
        case .ausstellung: return "laptopcomputer"
        case .bildschirm: return "tv"
        case .licht: return "lightbulb"
        case .druck: return "printer"
        case .einrichtung: return "checklist"
        case .protokoll: return "list.bullet.rectangle"
        case .doku: return "book"
        }
    }
}

struct HauptView: View {
    @EnvironmentObject private var regie: Regie
    @State private var bereich: Bereich?

    init(start: Bereich? = nil) {
        _bereich = State(initialValue: start)
    }

    var body: some View {
        NavigationSplitView {
            List(Bereich.allCases, selection: $bereich) { b in
                HStack {
                    Label(b.titel, systemImage: b.symbol)
                    Spacer()
                    Punkt(zustand: zustand(von: b))
                }
                .tag(b)
            }
            .navigationSplitViewColumnWidth(min: 190, ideal: 210, max: 260)
            .safeAreaInset(edge: .bottom) { ServerZeile().padding(12) }
        } detail: {
            switch bereich ?? .uebersicht {
            case .uebersicht: UebersichtView()
            case .ausstellung: AusstellungView()
            case .bildschirm: BildschirmView()
            case .licht: LichtView()
            case .druck: DruckView(druck: regie.druck)
            case .einrichtung: EinrichtungView()
            case .protokoll: ProtokollView()
            case .doku: DokuView()
            }
        }
        .onAppear {
            if bereich == nil { bereich = regie.konfig.eingerichtet ? .uebersicht : .einrichtung }
        }
        .onReceive(NotificationCenter.default.publisher(for: .zeigeBereich)) { n in
            if let b = n.object as? Bereich { bereich = b }
        }
        .alert("Das ging nicht", isPresented: Binding(get: { !regie.hinweis.isEmpty }, set: { if !$0 { regie.hinweis = "" } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(regie.hinweis)
        }
    }

    private func zustand(von b: Bereich) -> Punkt.Zustand {
        switch b {
        case .uebersicht, .einrichtung, .protokoll, .doku:
            return .keiner
        case .ausstellung:
            return regie.stationen.contains(where: \.online) ? .gut : .aus
        case .bildschirm:
            if !regie.konfig.bildschirm.atemAktiv { return .aus }
            return regie.atem.verbunden ? .gut : .warnung
        case .licht:
            if regie.konfig.licht.ziel.isEmpty { return .aus }
            return regie.licht.fehler.isEmpty ? .gut : .warnung
        case .druck:
            if regie.konfig.druck.probelauf { return .warnung }
            guard let z = regie.druck.zielDrucker, let d = regie.druck.drucker.first(where: { $0.name == z }) else { return .warnung }
            return d.bereit ? .gut : .warnung
        }
    }
}

struct Punkt: View {
    enum Zustand { case gut, warnung, aus, keiner }
    let zustand: Zustand

    var body: some View {
        switch zustand {
        case .keiner:
            EmptyView()
        case .gut:
            Circle().fill(.green).frame(width: 8, height: 8).accessibilityLabel("in Ordnung")
        case .warnung:
            Circle().fill(.orange).frame(width: 8, height: 8).accessibilityLabel("prüfen")
        case .aus:
            Circle().strokeBorder(.secondary, lineWidth: 1).frame(width: 8, height: 8).accessibilityLabel("aus")
        }
    }
}

struct ServerZeile: View {
    @EnvironmentObject private var regie: Regie

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Punkt(zustand: regie.serverLaeuft ? .gut : .warnung)
                Text(regie.serverLaeuft ? "Server läuft" : "Server").font(.caption.weight(.medium))
            }
            if let ip = regie.adressen.first?.ip {
                Text("\(ip):\(String(Regie.PORT))")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            } else {
                Text("kein Netzwerk").font(.caption).foregroundStyle(.orange)
            }
            if !regie.serverLaeuft {
                Text(regie.serverMeldung).font(.caption).foregroundStyle(.orange)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Kopfzeile für alle Bereiche.
struct Kopf<Rechts: View>: View {
    let titel: String
    let unterzeile: String
    @ViewBuilder var rechts: () -> Rechts

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titel).font(.title2.weight(.semibold))
                Text(unterzeile).font(.callout).foregroundStyle(.secondary)
            }
            Spacer()
            rechts()
        }
        .padding(.horizontal, 24)
        .padding(.top, 18)
        .padding(.bottom, 10)
    }
}

extension Kopf where Rechts == EmptyView {
    init(titel: String, unterzeile: String) {
        self.init(titel: titel, unterzeile: unterzeile) { EmptyView() }
    }
}

/// Ein Feld für IP-Adressen: wird erst beim Bestätigen übernommen und geprüft.
struct AdressFeld: View {
    let titel: String
    let platzhalter: String
    let wert: String
    let uebernehmen: (String) throws -> Void
    @State private var text = ""
    @State private var fehler = ""
    @FocusState private var fokus: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabeledContent(titel) {
                TextField(titel, text: $text, prompt: Text(platzhalter))
                    .labelsHidden()
                    .multilineTextAlignment(.trailing)
                    .font(.body.monospaced())
                    .focused($fokus)
                    .onSubmit(anwenden)
            }
            .onChange(of: fokus) { _, f in if !f { anwenden() } }
            .onChange(of: wert) { _, w in if !fokus { text = w } }
            .onAppear { text = wert }
            if !fehler.isEmpty {
                Text(fehler).font(.caption).foregroundStyle(.red)
            }
        }
    }

    private func anwenden() {
        do {
            if text != wert { try uebernehmen(text) }
            fehler = ""
        } catch {
            fehler = error.localizedDescription
        }
    }
}

struct MenuLeiste: View {
    @EnvironmentObject private var regie: Regie
    @Environment(\.openWindow) private var fenster

    var body: some View {
        let online = regie.stationen.filter(\.online).count
        Text(regie.serverLaeuft ? "Server läuft · \(online) \(online == 1 ? "Station" : "Stationen")" : "Server läuft nicht")
        if regie.atem.verbunden {
            Text("ATEM verbunden")
        }
        Divider()
        Picker("Bildschirm", selection: $regie.konfig.bildschirm.modus) {
            ForEach(Konfiguration.modi, id: \.self) { Text(Regie.modusName($0).capitalizedErsterBuchstabe).tag($0) }
        }
        Picker("Licht", selection: $regie.konfig.licht.szene) {
            ForEach(Konfiguration.szenen, id: \.self) { Text(LichtView.name($0)).tag($0) }
        }
        Toggle("Live-Druck", isOn: $regie.konfig.druck.live)
        Toggle("Warteschlange anhalten", isOn: $regie.konfig.druck.angehalten)
        Button("Alle Stationen zurücksetzen") { regie.befehlAnAlle("reset") }
        Divider()
        Button("Fenster öffnen") {
            NSApp.activate(ignoringOtherApps: true)
            fenster(id: "haupt")
        }
        Button("Beenden") { NSApp.terminate(nil) }
    }
}

extension Color {
    /// Tool-Pool-Orange. Markiert, was gerade auf dem großen Bildschirm läuft.
    static let sendung = Color(red: 1, green: 0.353, blue: 0.122)
}

extension String {
    var capitalizedErsterBuchstabe: String { prefix(1).uppercased() + dropFirst() }
}
