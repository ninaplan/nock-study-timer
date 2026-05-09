import UIKit
import Capacitor

/// CAPBridgeViewController 서브클래스.
/// capacitorPlugins()를 오버라이드해 인라인 플러그인(NockIAPPlugin)을 등록한다.
class ViewController: CAPBridgeViewController {
    override func capacitorPlugins() -> [Swift.AnyClass] {
        return [NockIAPPlugin.self]
    }
}
