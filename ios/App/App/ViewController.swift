import UIKit
import Capacitor

/// CAPBridgeViewController 서브클래스.
/// Capacitor 8+: 인라인 플러그인은 `capacitorPlugins()`(구 API)가 아니라 브리지에 인스턴스로 등록한다.
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(NockIAPPlugin())
    }
}
