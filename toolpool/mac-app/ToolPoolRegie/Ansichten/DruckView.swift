import SwiftUI
import UniformTypeIdentifiers

struct DruckView: View {
    @EnvironmentObject private var regie: Regie
    @ObservedObject var druck: Druckserver
    @State private var ziehtPDF = false

    private var zielInfo: Druckserver.DruckerInfo? {
        guard let z = druck.zielDrucker else { return nil }
        return druck.drucker.first { $0.name == z }
    }

    var body: some View {
        VStack(spacing: 0) {
            Kopf(titel: "Druckserver", unterzeile: "Der Drucker hängt am Mac mini. Alle Stationen drucken über diese Warteschlange.") {
                HStack {
                    Button("Testseite") {
                        do { try druck.testseite() } catch { regie.hinweis = error.localizedDescription }
                    }
                    Button("Archiv öffnen") { NSWorkspace.shared.open(Pfade.archiv) }
                }
            }
            Form {
                Section("Drucker") {
                    Picker("Drucker", selection: $regie.konfig.druck.drucker) {
                        Text("Standarddrucker (\(druck.standard.isEmpty ? "keiner" : druck.standard))").tag("")
                        ForEach(druck.drucker) { d in
                            Text(d.name).tag(d.name)
                        }
                    }
                    if let d = zielInfo {
                        LabeledContent("Anschluss", value: d.anschluss)
                        LabeledContent("Zustand") {
                            HStack(spacing: 6) {
                                Punkt(zustand: d.bereit ? .gut : .warnung)
                                Text(d.zustand)
                            }
                        }
                        if d.angehalten {
                            Button("Drucker fortsetzen") { druck.druckerFortsetzen() }
                        }
                    } else {
                        Label("Am Mac mini ist kein Drucker eingerichtet.", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                    HStack {
                        Button("Drucker hinzufügen ...") { druck.oeffneDruckerEinstellungen() }
                        Button("Neu abfragen") { druck.aktualisiereDrucker() }
                    }
                }

                Section("Regeln") {
                    Toggle(isOn: $regie.konfig.druck.live) {
                        Text("Live-Druck")
                        Text("Knopf „Jetzt drucken“ auf den Stationen.")
                    }
                    Picker("Format", selection: $regie.konfig.druck.format) {
                        ForEach(Konfiguration.formate, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Stepper(value: $regie.konfig.druck.kopien, in: 1...20) {
                        Text("Kopien je Auftrag: \(regie.konfig.druck.kopien)")
                    }
                    Stepper(value: $regie.konfig.druck.pauseSekunden, in: 0...3600, step: 5) {
                        Text("Pause je Station: \(regie.konfig.druck.pauseSekunden) Sekunden")
                    }
                    Stepper(value: $regie.konfig.druck.tageslimit, in: 0...10000, step: 10) {
                        Text(regie.konfig.druck.tageslimit == 0
                             ? "Tageslimit: keines · heute \(druck.heuteGedruckt) gedruckt"
                             : "Tageslimit: \(regie.konfig.druck.tageslimit) · heute \(druck.heuteGedruckt) gedruckt")
                    }
                    Toggle(isOn: $regie.konfig.druck.probelauf) {
                        Text("Probelauf")
                        Text("Nichts geht an den Drucker, die PDFs landen nur im Archiv. Spart beim Testen Papier.")
                    }
                    Toggle(isOn: $regie.konfig.druck.archiv) {
                        Text("PDFs im Archiv behalten")
                        Text("Sonst wird jede Datei nach dem Druck entfernt.")
                    }
                }

                Section("Freigabe im Netz") {
                    LabeledContent {
                        HStack {
                            Button("Freigeben") { druck.setzeFreigabe(an: true) }
                                .disabled(zielInfo?.geteilt == true && druck.freigabeSystem)
                            Button("Beenden") { druck.setzeFreigabe(an: false) }
                                .disabled(zielInfo?.geteilt != true)
                        }
                    } label: {
                        Text(zielInfo?.geteilt == true && druck.freigabeSystem ? "Drucker ist im Netz sichtbar" : "Drucker ist nur für den Mac mini sichtbar")
                        Text("Mit Freigabe können auch andere Programme auf den Laptops direkt hierher drucken, am normalen Druckdialog vorbei an der Warteschlange der App. macOS fragt dafür nach dem Passwort.")
                    }
                    if !druck.freigabeMeldung.isEmpty {
                        Text(druck.freigabeMeldung).font(.callout).foregroundStyle(.secondary)
                    }
                }

                Section {
                    if druck.auftraege.isEmpty {
                        Text("Noch keine Aufträge. PDFs lassen sich auch hierher ziehen.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(druck.auftraege) { a in
                        AuftragZeile(auftrag: a, druck: druck)
                    }
                } header: {
                    HStack {
                        Text("Warteschlange")
                        Spacer()
                        Toggle("Anhalten", isOn: $regie.konfig.druck.angehalten)
                            .toggleStyle(.switch)
                            .controlSize(.mini)
                        Button("Erledigte ausblenden") { druck.fertigeAusblenden() }
                            .buttonStyle(.link)
                            .font(.caption)
                    }
                }
            }
            .formStyle(.grouped)
            .overlay {
                if ziehtPDF {
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color.accentColor, lineWidth: 3)
                        .padding(8)
                        .allowsHitTesting(false)
                }
            }
            .dropDestination(for: URL.self) { urls, _ in
                var ok = false
                for u in urls {
                    do {
                        try druck.annehmen(datei: u)
                        ok = true
                    } catch {
                        regie.hinweis = "\(u.lastPathComponent): \(error.localizedDescription)"
                    }
                }
                return ok
            } isTargeted: { ziehtPDF = $0 }
        }
    }
}

private struct AuftragZeile: View {
    let auftrag: Druckserver.Auftrag
    @ObservedObject var druck: Druckserver

    private var farbe: Color {
        switch auftrag.status {
        case .fehler: return .red
        case .druckt, .rechnet: return .accentColor
        case .fertig: return .green
        default: return .secondary
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Text("\(auftrag.id)").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 28, alignment: .trailing)
            VStack(alignment: .leading, spacing: 1) {
                Text(auftrag.titel)
                HStack(spacing: 6) {
                    Text(auftrag.zeit, style: .time)
                    Text(auftrag.format)
                    if !auftrag.drucker.isEmpty { Text(auftrag.drucker) }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                if !auftrag.meldung.isEmpty {
                    Text(auftrag.meldung).font(.caption).foregroundStyle(auftrag.status == .fehler ? .red : .secondary)
                }
            }
            Spacer()
            Text(auftrag.status.rawValue).font(.callout).foregroundStyle(farbe)
            if auftrag.status.offen {
                Button("Abbrechen") { druck.abbrechen(auftrag.id) }
            } else if auftrag.datei != nil {
                Button("Nochmal") { druck.nochmal(auftrag.id) }
            }
            if auftrag.datei != nil {
                Button {
                    druck.oeffnePDF(auftrag.id)
                } label: {
                    Image(systemName: "doc.text.magnifyingglass")
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("PDF von Auftrag \(auftrag.id) ansehen")
            }
        }
    }
}
