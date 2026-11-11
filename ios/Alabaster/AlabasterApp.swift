import SwiftUI

@main
struct AlabasterApp: App {
    var body: some Scene {
        WindowGroup {
            ShellView()
        }
    }
}

struct ShellView: View {
    @State private var offline = false
    @State private var retry = 0

    var body: some View {
        ZStack {
            Color("Paper").ignoresSafeArea()
            WebShell(offline: $offline, retry: retry)
                .ignoresSafeArea(.container, edges: .bottom)
            if offline {
                OfflineView { retry += 1 }
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: offline)
        .task(id: offline) {
            while offline, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                if offline { retry += 1 }
            }
        }
    }
}

struct OfflineView: View {
    let tryAgain: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image("LaunchMark")
                .resizable()
                .scaledToFit()
                .frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            Text("No connection")
                .font(.title2.weight(.semibold))
            Text("Retrying…")
                .foregroundStyle(.secondary)
            Button("Try again", action: tryAgain)
                .buttonStyle(.borderedProminent)
                .tint(Color("Delft"))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("Paper"))
    }
}
