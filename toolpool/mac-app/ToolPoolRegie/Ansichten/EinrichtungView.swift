import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct EinrichtungView: View {
    @EnvironmentObject private var regie: Regie

    var body: some View {
        VStack(spacing: 0) {
            Kopf(titel: "Einrichtung", unterzeile: "Von oben nach unten durchgehen. Der Punkt zeigt, ob der Schritt erledigt ist.")
            Form {
                Section {
                    Schritt(nummer: 1, titel: "Netzwerk", erledigt: !regie.adressen.isEmpty) {
                        if regie.adressen.isEmpty {
                            Text("Kein Netzwerk. Den Mac mini per Kabel an den Switch hängen.").foregroundStyle(.orange)
                        }
                        ForEach(regie.adressen) { a in
                            LabeledContent(a.schnittstelle, value: a.ip).font(.body.monospaced())
                        }
                        Text("Der Mac mini braucht eine feste Adresse, zum Beispiel 192.168.10.10. Kann der Accesspoint Adressen vergeben (DHCP), dort reservieren. Sonst alle Geräte von Hand einstellen.")
                            .font(.callout).foregroundStyle(.secondary)
                        HStack {
                            Button("Netzwerk-Einstellungen öffnen") {
                                if let u = URL(string: "x-apple.systempreferences:com.apple.Network-Settings.extension") { NSWorkspace.shared.open(u) }
                            }
                            Button("Lokales Netzwerk erlauben ...") {
                                if let u = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork") { NSWorkspace.shared.open(u) }
                            }
                        }
                        if regie.firewallAn == true {
                            Label("Die Firewall ist an. Beim ersten Start „Eingehende Verbindungen erlauben“ wählen.", systemImage: "shield")
                                .font(.callout)
                        }
                    }
                }
                Section {
                    Schritt(nummer: 2, titel: "Drucker", erledigt: druckerBereit) {
                        Text(druckerText)
                        HStack {
                            Button("Drucker hinzufügen ...") { regie.druck.oeffneDruckerEinstellungen() }
                            Button("Testseite drucken") {
                                do { try regie.druck.testseite() } catch { regie.hinweis = error.localizedDescription }
                            }
                        }
                        Text("Drucker per USB an den Mac mini hängen und in den Systemeinstellungen einmal hinzufügen.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                }
                Section {
                    Schritt(nummer: 3, titel: "ATEM", erledigt: regie.atem.verbunden) {
                        AdressFeld(titel: "IP-Adresse", platzhalter: "192.168.10.240", wert: regie.konfig.bildschirm.atemIP) { neu in
                            regie.konfig.bildschirm.atemIP = try Pruefe.ipAdresse(neu)
                        }
                        HStack {
                            Button("Verbinden") {
                                do { try regie.verbindeATEM(ip: regie.konfig.bildschirm.atemIP) } catch { regie.hinweis = error.localizedDescription }
                            }
                            Text(regie.atem.verbunden ? "Verbunden: \(regie.atem.modell)" : (regie.konfig.bildschirm.atemAktiv ? "Suche ..." : "Nicht verbunden"))
                                .font(.callout).foregroundStyle(.secondary)
                        }
                        if !regie.atem.meldung.isEmpty {
                            Text(regie.atem.meldung).font(.callout).foregroundStyle(.orange)
                        }
                    }
                }
                Section {
                    Schritt(nummer: 4, titel: "Licht", erledigt: !regie.konfig.licht.ziel.isEmpty && regie.licht.fehler.isEmpty) {
                        AdressFeld(titel: "Ziel-Adresse", platzhalter: "Adresse von PowerBox oder DataLink", wert: regie.konfig.licht.ziel) { neu in
                            regie.konfig.licht.ziel = try Pruefe.ipAdresse(neu)
                        }
                        Text("Weitere Einstellungen stehen im Bereich Licht. Ob es stimmt, zeigt nur das Licht selbst: Szene auf Farbe stellen und hinschauen.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                }
                Section {
                    Schritt(nummer: 5, titel: "Laptops", erledigt: regie.stationen.contains(where: \.online)) {
                        Text("\(regie.stationen.filter(\.online).count) von \(regie.konfig.ausstellung.stationen) verbunden")
                        StarterKnopf()
                        Text("Startdateien auf die Laptops kopieren und einmal öffnen. Die Nummer der Station sollte zum HDMI-Eingang am ATEM passen. Google Chrome auf den Laptops wird empfohlen.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                }
                Section {
                    Schritt(nummer: 6, titel: "Dauerbetrieb", erledigt: regie.autostart && regie.konfig.ausstellung.wachHalten) {
                        Toggle("Beim Anmelden automatisch starten", isOn: Binding(get: { regie.autostart }, set: { regie.setzeAutostart($0) }))
                        if !regie.autostartMeldung.isEmpty {
                            Text(regie.autostartMeldung).font(.callout).foregroundStyle(.orange)
                        }
                        Toggle("Mac mini und Bildschirm wach halten", isOn: $regie.konfig.ausstellung.wachHalten)
                        Text("Damit nach einem Stromausfall alles von allein startet: In den Systemeinstellungen die automatische Anmeldung und unter Energie den Start nach Stromausfall einschalten.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                }
                Section("Einstellungen sichern") {
                    HStack {
                        Button("Sichern ...") { sichern() }
                        Button("Laden ...") { laden() }
                    }
                    Text("Eine Datei mit allen Einstellungen. Praktisch, wenn der Mac mini getauscht wird.")
                        .font(.callout).foregroundStyle(.secondary)
                    Toggle("Einrichtung abgeschlossen: beim Start die Übersicht zeigen", isOn: $regie.konfig.eingerichtet)
                }
            }
            .formStyle(.grouped)
        }
    }

    private var druckerBereit: Bool {
        guard let z = regie.druck.zielDrucker, let d = regie.druck.drucker.first(where: { $0.name == z }) else { return false }
        return d.bereit
    }

    private var druckerText: String {
        guard let z = regie.druck.zielDrucker, let d = regie.druck.drucker.first(where: { $0.name == z }) else {
            return "Noch kein Drucker eingerichtet."
        }
        return "\(z) · \(d.anschluss) · \(d.zustand)"
    }

    private func sichern() {
        let p = NSSavePanel()
        p.nameFieldStringValue = "Tool Pool Regie Einstellungen.json"
        p.allowedContentTypes = [.json]
        guard p.runModal() == .OK, let u = p.url else { return }
        do { try regie.konfigurationSichern(nach: u) } catch { regie.hinweis = error.localizedDescription }
    }

    private func laden() {
        let p = NSOpenPanel()
        p.allowedContentTypes = [.json]
        guard p.runModal() == .OK, let u = p.url else { return }
        do { try regie.konfigurationLaden(von: u) } catch { regie.hinweis = error.localizedDescription }
    }
}

private struct Schritt<Inhalt: View>: View {
    let nummer: Int
    let titel: String
    let erledigt: Bool
    @ViewBuilder var inhalt: () -> Inhalt

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: erledigt ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(erledigt ? .green : .secondary)
                    .accessibilityLabel(erledigt ? "erledigt" : "offen")
                Text("\(nummer). \(titel)").font(.headline)
            }
            inhalt()
        }
        .padding(.vertical, 2)
    }
}

struct ProtokollView: View {
    @ObservedObject private var protokoll = Protokoll.shared

    var body: some View {
        VStack(spacing: 0) {
            Kopf(titel: "Protokoll", unterzeile: "Was in der Ausstellung passiert ist") {
                Button("Datei zeigen") { NSWorkspace.shared.activateFileViewerSelecting([Pfade.protokoll]) }
            }
            List(protokoll.eintraege) { e in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(e.zeit, format: .dateTime.hour().minute().second())
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Text(e.text)
                        .foregroundStyle(e.art == .fehler ? Color.red : e.art == .warnung ? Color.orange : Color.primary)
                        .textSelection(.enabled)
                }
            }
            .overlay {
                if protokoll.eintraege.isEmpty {
                    Text("Noch nichts passiert").foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct DokuView: View {
    var body: some View {
        WebAnsicht(url: URL(string: "http://127.0.0.1:\(Regie.PORT)/doku.html")!)
    }
}

private struct WebAnsicht: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> WKWebView {
        let w = WKWebView(frame: .zero)
        w.load(URLRequest(url: url))
        return w
    }
    func updateNSView(_ v: WKWebView, context: Context) {}
}
