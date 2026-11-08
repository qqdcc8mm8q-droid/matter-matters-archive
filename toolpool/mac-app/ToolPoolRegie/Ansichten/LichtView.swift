import SwiftUI

struct LichtView: View {
    @EnvironmentObject private var regie: Regie

    static func name(_ s: String) -> String {
        switch s {
        case "farbe": return "Farbe"
        case "atmen": return "Atmen"
        case "wechsel": return "Farbwechsel"
        case "aktivitaet": return "Aktivität"
        default: return "Aus"
        }
    }

    private var farbe: Binding<Color> {
        Binding(
            get: {
                let c = LichtMotor.hexFarbe(regie.konfig.licht.farbe)
                return Color(red: c.0, green: c.1, blue: c.2)
            },
            set: { neu in
                guard let c = NSColor(neu).usingColorSpace(.sRGB) else { return }
                let w = { (x: CGFloat) in Int((x * 255).rounded()) }
                regie.konfig.licht.farbe = String(format: "#%02x%02x%02x", w(c.redComponent), w(c.greenComponent), w(c.blueComponent))
            })
    }

    private var hell: Binding<Double> {
        Binding(get: { Double(regie.konfig.licht.hell) }, set: { regie.konfig.licht.hell = Int($0) })
    }

    var body: some View {
        VStack(spacing: 0) {
            Kopf(titel: "Licht", unterzeile: "Astera Titan Tube über Art-Net") {
                HStack(spacing: 8) {
                    Text("Sendet gerade").font(.caption).foregroundStyle(.secondary)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(red: Double(regie.licht.rot) / 255, green: Double(regie.licht.gruen) / 255, blue: Double(regie.licht.blau) / 255))
                        .frame(width: 44, height: 22)
                        .overlay { RoundedRectangle(cornerRadius: 4).strokeBorder(.secondary.opacity(0.4)) }
                        .accessibilityLabel("Aktuelle Lichtfarbe")
                }
            }
            Form {
                Section("Szene") {
                    Picker("Szene", selection: $regie.konfig.licht.szene) {
                        ForEach(Konfiguration.szenen, id: \.self) { Text(Self.name($0)).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Text(hilfe).font(.callout).foregroundStyle(.secondary)
                    ColorPicker("Farbe", selection: farbe, supportsOpacity: false)
                    LabeledContent("Helligkeit \(regie.konfig.licht.hell) %") {
                        Slider(value: hell, in: 0...100, step: 1)
                    }
                    Toggle("Blitz bei jedem Druck", isOn: $regie.konfig.licht.druckBlitz)
                }

                Section("Art-Net") {
                    AdressFeld(titel: "Ziel-Adresse", platzhalter: "Adresse von PowerBox oder DataLink", wert: regie.konfig.licht.ziel) { neu in
                        regie.konfig.licht.ziel = try Pruefe.ipAdresse(neu)
                    }
                    Stepper(value: $regie.konfig.licht.universum, in: 0...32767) {
                        Text("Universum \(regie.konfig.licht.universum)")
                    }
                    Stepper(value: $regie.konfig.licht.adresse, in: 1...512) {
                        Text("DMX-Adresse \(regie.konfig.licht.adresse)")
                    }
                    Picker("Belegung", selection: $regie.konfig.licht.layout) {
                        ForEach(Konfiguration.layouts, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Stepper(value: $regie.konfig.licht.anzahl, in: 1...100) {
                        Text("Tubes hintereinander: \(regie.konfig.licht.anzahl)")
                    }
                    if !regie.licht.fehler.isEmpty {
                        Text(regie.licht.fehler).font(.callout).foregroundStyle(.orange)
                    } else if !regie.konfig.licht.ziel.isEmpty {
                        Text("\(regie.licht.pakete) Pakete gesendet. Art-Net meldet nichts zurück, ob die Box sie erhält, zeigt nur das Licht selbst.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text("Belegung, Adresse und Universum müssen zum DMX-Profil an der Titan passen. Das Universum zählt hier ab 0. Zählt die Box ab 1, hier 1 weniger einstellen.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
        }
    }

    private var hilfe: String {
        switch regie.konfig.licht.szene {
        case "farbe": return "Gleichmäßig in der gewählten Farbe."
        case "atmen": return "Wird langsam heller und dunkler, in 6 Sekunden."
        case "wechsel": return "Läuft in einer Minute einmal durch alle Farben."
        case "aktivitaet": return "Wird heller, wenn jemand eine Station bedient, und klingt dann ab."
        default: return "Licht aus."
        }
    }
}
