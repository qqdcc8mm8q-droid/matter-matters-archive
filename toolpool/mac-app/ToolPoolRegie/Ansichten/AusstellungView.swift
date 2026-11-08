import SwiftUI

struct AusstellungView: View {
    @EnvironmentObject private var regie: Regie

    var body: some View {
        VStack(spacing: 0) {
            Kopf(titel: "Stationen", unterzeile: "Gilt für alle Laptops und wird sofort übernommen")
            Form {
                Section("Betrieb") {
                    Toggle(isOn: $regie.konfig.ausstellung.museum) {
                        Text("Museumsmodus")
                        Text("Nur der Baukasten im Vollbild. Nach 3 Minuten ohne Bedienung geht jede Station in ihren Startzustand zurück.")
                    }
                    Stepper(value: $regie.konfig.ausstellung.stationen, in: 1...32) {
                        Text("Anzahl Stationen: \(regie.konfig.ausstellung.stationen)")
                    }
                }

                Section("Rechenlast") {
                    Picker(selection: $regie.konfig.ausstellung.rechnen) {
                        Text("Mac mini").tag("mini")
                        Text("Laptops").tag("laptop")
                    } label: {
                        Text("Plakate rechnet")
                        Text(regie.konfig.ausstellung.rechnen == "mini"
                             ? "Die Laptops zeigen nur die Bedienung und die fertigen Bilder. Bricht die Verbindung ab, rechnen sie selbst weiter."
                             : "Jeder Laptop rechnet selbst, der Mac mini liefert nur die Seite aus.")
                    }
                    .pickerStyle(.segmented)
                    Picker(selection: $regie.konfig.ausstellung.leistung) {
                        Text("Normal").tag("normal")
                        Text("Sparsam").tag("sparsam")
                        Text("Minimal").tag("minimal")
                    } label: {
                        Text("Laststufe")
                        Text(stufenText)
                    }
                    .pickerStyle(.segmented)
                    if regie.konfig.ausstellung.rechnen == "mini" {
                        LabeledContent {
                            Slider(value: $regie.konfig.ausstellung.qualitaet, in: 0.4...0.95, step: 0.05)
                        } label: {
                            Text("Bildqualität \(Int((regie.konfig.ausstellung.qualitaet * 100).rounded())) %")
                            Text("Höher sieht besser aus und braucht mehr Netz. Am Kabel unkritisch, im WLAN eher niedrig halten.")
                        }
                    }
                }

                Section("Adressen für die Laptops") {
                    ForEach(1...max(1, regie.konfig.ausstellung.stationen), id: \.self) { i in
                        LabeledContent("Station \(i)") {
                            HStack {
                                Text(regie.stationsAdresse(i)).font(.body.monospaced()).textSelection(.enabled)
                                Button {
                                    NSPasteboard.general.clearContents()
                                    NSPasteboard.general.setString(regie.stationsAdresse(i), forType: .string)
                                } label: {
                                    Image(systemName: "doc.on.doc")
                                }
                                .buttonStyle(.borderless)
                                .accessibilityLabel("Adresse von Station \(i) kopieren")
                            }
                        }
                    }
                    StarterKnopf()
                }
            }
            .formStyle(.grouped)
        }
    }

    private var stufenText: String {
        switch regie.konfig.ausstellung.leistung {
        case "sparsam": return "20 Bilder pro Sekunde, keine Vorschau in den Bausteinen."
        case "minimal": return "12 Bilder pro Sekunde, Plakat in halber Auflösung. Druck und Export bleiben voll."
        default: return "30 Bilder pro Sekunde."
        }
    }
}

/// Speichert für jede Station eine Startdatei, die den Browser im Vollbild öffnet.
struct StarterKnopf: View {
    @EnvironmentObject private var regie: Regie
    @State private var meldung = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button("Startdateien für die Laptops speichern ...") { sichern() }
            Text(meldung.isEmpty ? "Doppelklick auf dem Laptop öffnet die Station im Vollbild. Für Mac (.command) und Windows (.bat)." : meldung)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func sichern() {
        let p = NSOpenPanel()
        p.canChooseDirectories = true
        p.canChooseFiles = false
        p.canCreateDirectories = true
        p.prompt = "Hier speichern"
        p.message = "Ordner für die Startdateien wählen"
        guard p.runModal() == .OK, let ordner = p.url else { return }
        do {
            let ziel = ordner.appendingPathComponent("Tool Pool Stationen", isDirectory: true)
            try StationStarter.schreibe(nach: ziel, adresse: regie.adressen.first?.ip ?? "127.0.0.1", anzahl: regie.konfig.ausstellung.stationen)
            meldung = "Gespeichert in \(ziel.path)"
            NSWorkspace.shared.activateFileViewerSelecting([ziel])
        } catch {
            meldung = "Ging nicht: \(error.localizedDescription)"
        }
    }
}
