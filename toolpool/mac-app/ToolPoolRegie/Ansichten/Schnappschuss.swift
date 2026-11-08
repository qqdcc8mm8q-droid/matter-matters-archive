#if DEBUG
import AppKit
import SwiftUI

/// Nur in Entwicklungs-Builds: speichert jeden Bereich als Bild, zum Prüfen der Oberfläche ohne Klicken.
@MainActor
enum Schnappschuss {
    static func alle(nach ordner: URL) async {
        try? FileManager.default.createDirectory(at: ordner, withIntermediateDirectories: true)
        try? await Task.sleep(for: .seconds(Double(Start.wert("--warte") ?? "6") ?? 6))
        guard let fenster = NSApp.windows.first(where: { $0.title == "Tool Pool Regie" }), let rahmen = fenster.contentView?.superview else {
            Protokoll.melde("Schnappschuss: kein Fenster", art: .fehler)
            return
        }
        for b in Bereich.allCases {
            NotificationCenter.default.post(name: .zeigeBereich, object: b)
            try? await Task.sleep(for: .seconds(b == .doku ? 3 : 1.5))
            if let rep = rahmen.bitmapImageRepForCachingDisplay(in: rahmen.bounds) {
                rahmen.cacheDisplay(in: rahmen.bounds, to: rep)
                try? rep.representation(using: .png, properties: [:])?.write(to: ordner.appendingPathComponent(b.rawValue + ".png"))
            }
        }
        Protokoll.melde("Schnappschüsse gespeichert")
        try? Data().write(to: ordner.appendingPathComponent("fertig"))
    }
}
#endif
