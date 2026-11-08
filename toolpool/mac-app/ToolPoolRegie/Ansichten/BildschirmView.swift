import SwiftUI

struct BildschirmView: View {
    @EnvironmentObject private var regie: Regie

    var body: some View {
        VStack(spacing: 0) {
            Kopf(titel: "Bildschirm", unterzeile: "Was der ATEM auf den großen Bildschirm schaltet")
            Form {
                Section("Betrieb") {
                    Picker("Modus", selection: $regie.konfig.bildschirm.modus) {
                        Text("Aus").tag("aus")
                        Text("Von Hand").tag("manuell")
                        Text("Reihe").tag("reihe")
                        Text("Zufall").tag("zufall")
                        Text("Aktivität").tag("aktivitaet")
                    }
                    .pickerStyle(.segmented)
                    Text(hilfe).font(.callout).foregroundStyle(.secondary)
                    Stepper(value: $regie.konfig.bildschirm.sekunden, in: 3...3600, step: 1) {
                        Text("Wechsel alle \(regie.konfig.bildschirm.sekunden) Sekunden")
                    }
                    Picker("Übergang", selection: $regie.konfig.bildschirm.uebergang) {
                        Text("Schnitt").tag("cut")
                        Text("Blende").tag("mix")
                    }
                    .pickerStyle(.segmented)
                    if regie.konfig.bildschirm.uebergang == "mix" {
                        Stepper(value: $regie.konfig.bildschirm.mixBilder, in: 1...250) {
                            Text("Blende: \(regie.konfig.bildschirm.mixBilder) Bilder")
                        }
                    }
                    if ["reihe", "zufall", "aktivitaet"].contains(regie.konfig.bildschirm.modus), regie.atem.verbunden {
                        Text("Nächster Wechsel in \(regie.naechsterWechsel) s").font(.callout.monospacedDigit())
                    }
                }

                Section("Jetzt auf den Bildschirm") {
                    if regie.stationen.isEmpty {
                        Text("Keine Stationen").foregroundStyle(.secondary)
                    }
                    ForEach(regie.stationen) { s in
                        HStack {
                            Punkt(zustand: s.online ? .gut : .aus)
                            Text(s.name.isEmpty ? "Station \(s.id)" : s.name)
                            Text("Eingang \(s.eingang)").font(.caption).foregroundStyle(.secondary)
                            if let n = regie.atem.eingaenge[s.eingang], !n.isEmpty {
                                Text(n).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if s.aufBildschirm {
                                Text("AUF SENDUNG").font(.caption2.monospaced().weight(.semibold)).foregroundStyle(Color.sendung)
                            }
                            Button("Schalten") {
                                do { try regie.aufBildschirm(station: s.id) } catch { regie.hinweis = error.localizedDescription }
                            }
                            .disabled(!regie.atem.verbunden)
                        }
                    }
                }

                Section("ATEM") {
                    AdressFeld(titel: "IP-Adresse", platzhalter: "192.168.10.240", wert: regie.konfig.bildschirm.atemIP) { neu in
                        regie.konfig.bildschirm.atemIP = try Pruefe.ipAdresse(neu)
                    }
                    HStack {
                        Button(regie.konfig.bildschirm.atemAktiv ? "Neu verbinden" : "Verbinden") {
                            do { try regie.verbindeATEM(ip: regie.konfig.bildschirm.atemIP) } catch { regie.hinweis = error.localizedDescription }
                        }
                        if regie.konfig.bildschirm.atemAktiv {
                            Button("Trennen") { regie.trenneATEM() }
                        }
                        Spacer()
                        Punkt(zustand: regie.atem.verbunden ? .gut : (regie.konfig.bildschirm.atemAktiv ? .warnung : .aus))
                        Text(atemText).font(.callout)
                    }
                    if !regie.atem.meldung.isEmpty {
                        Text(regie.atem.meldung).font(.callout).foregroundStyle(.orange)
                    }
                    Text("Die Werksadresse des ATEM ist 192.168.10.240. Sie steht in ATEM Software Control unter Einstellungen.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
        }
    }

    private var hilfe: String {
        switch regie.konfig.bildschirm.modus {
        case "manuell": return "Du schaltest selbst. Nichts wechselt von allein."
        case "reihe": return "Die verbundenen Stationen nacheinander."
        case "zufall": return "Zufällig unter den verbundenen Stationen."
        case "aktivitaet": return "Stationen, an denen gerade jemand arbeitet, kommen zuerst. Sonst zufällig."
        default: return "Die App schaltet nicht. Der ATEM bleibt, wie er ist."
        }
    }

    private var atemText: String {
        if regie.atem.verbunden {
            let m = regie.atem.modell.isEmpty ? "ATEM" : regie.atem.modell
            return regie.atem.programm.map { "\(m) · Eingang \($0) läuft" } ?? m
        }
        if regie.atem.antwortet { return "Gleicht ab ..." }
        return regie.konfig.bildschirm.atemAktiv ? "Suche ATEM ..." : "Nicht verbunden"
    }
}
