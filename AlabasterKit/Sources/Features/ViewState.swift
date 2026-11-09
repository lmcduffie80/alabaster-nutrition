import SwiftUI

/// The `State` property wrapper under another name. The iOS 27 / macOS 27 SDKs shadow it with a `@State`
/// macro whose plugin ships only with Xcode, so `@State` fails to build with the Command Line Tools alone.
/// Replace `@ViewState` with `@State` once builds require Xcode.
typealias ViewState<Value> = SwiftUI.State<Value>
