import AppKit
import SwiftUI

@main
struct ToolPoolRegieApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var regie = Regie.shared

    var body: some Scene {
        Window("Tool Pool Regie", id: "haupt") {
            HauptView()
                .environmentObject(regie)
                .frame(minWidth: 1000, minHeight: 640)
        }
        .defaultSize(width: 1320, height: 880)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandGroup(replacing: .help) {
                Button("Dokumentation") {
                    NotificationCenter.default.post(name: .zeigeBereich, object: Bereich.doku)
                }
            }
        }

        MenuBarExtra {
            MenuLeiste().environmentObject(regie)
        } label: {
            Image(systemName: "puzzlepiece.fill")
                .accessibilityLabel("Tool Pool Regie")
        }
    }
}

extension Notification.Name {
    static let zeigeBereich = Notification.Name("zeigeBereich")
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Bei Unit-Tests läuft die App nur als Hülle: kein Server, keine Verbindungen
        guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else { return }
        MainActor.assumeIsolated {
            Regie.shared.starten()
        }
        #if DEBUG
        if let ordner = Start.wert("--schnappschuss") {
            Task { @MainActor in await Schnappschuss.alle(nach: URL(fileURLWithPath: ordner, isDirectory: true)) }
        }
        #endif
    }

    /// Die App läuft weiter, wenn das Fenster zu ist. Sie bleibt über das Symbol in der Menüleiste erreichbar.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else { return .terminateNow }
        return MainActor.assumeIsolated {
            let regie = Regie.shared
            let verbunden = regie.stationen.filter(\.online).count
            if verbunden > 0, !Start.an("--ohne-nachfrage") {
                let a = NSAlert()
                a.messageText = "Tool Pool Regie beenden?"
                a.informativeText = "\(verbunden) \(verbunden == 1 ? "Station ist" : "Stationen sind") verbunden. Beim Beenden stoppen Server, Druck, Bildwechsel und Licht."
                a.addButton(withTitle: "Abbrechen")
                a.addButton(withTitle: "Beenden")
                if a.runModal() == .alertFirstButtonReturn { return .terminateCancel }
            }
            regie.beenden()
            return .terminateNow
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { true }

    /// PDF auf das App-Symbol ziehen: geht in die Warteschlange.
    func application(_ application: NSApplication, open urls: [URL]) {
        MainActor.assumeIsolated {
            for u in urls where u.pathExtension.lowercased() == "pdf" {
                do {
                    try Regie.shared.druck.annehmen(datei: u)
                } catch {
                    Protokoll.melde("\(u.lastPathComponent): \(error.localizedDescription)", art: .fehler)
                }
            }
        }
    }
}
