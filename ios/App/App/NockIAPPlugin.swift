import Foundation
import Capacitor
import StoreKit

/// Capacitor 8 인라인 플러그인 — StoreKit 2 기반 Apple IAP
/// JS에서 Capacitor.Plugins.NockIAP 로 접근
@objc(NockIAPPlugin)
public class NockIAPPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NockIAPPlugin"
    public let jsName    = "NockIAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts",            returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase",               returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openManageSubscriptions", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - getProducts
    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds") as? [String], !ids.isEmpty else {
            call.reject("productIds required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: Set(ids))
                let result: [[String: Any]] = products.map { p in
                    var m: [String: Any] = [
                        "id":           p.id,
                        "displayName":  p.displayName,
                        "displayPrice": p.displayPrice,
                        "description":  p.description,
                    ]
                    if let sub = p.subscription {
                        m["periodUnit"]  = "\(sub.subscriptionPeriod.unit)"
                        m["periodValue"] = sub.subscriptionPeriod.value
                    }
                    return m
                }
                call.resolve(["products": result])
            } catch {
                call.reject("fetch_failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - purchase
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("product_not_found")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let tx):
                        await tx.finish()
                        call.resolve([
                            "transactionId":         String(tx.id),
                            "originalTransactionId": String(tx.originalID),
                            "jwsToken":              verification.jwsRepresentation,
                            "productId":             tx.productID,
                            "cancelled":             false,
                            "pending":               false,
                        ])
                    case .unverified(_, let err):
                        call.reject("unverified: \(err.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["cancelled": true, "pending": false])
                case .pending:
                    call.resolve(["pending": true, "cancelled": false])
                @unknown default:
                    call.reject("unknown_purchase_result")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // MARK: - restorePurchases
    // 현재 유효한 구독 엔타이틀먼트를 모두 반환 (앱 재설치 등 복구용)
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            var restored: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                guard case .verified(let tx) = result else { continue }
                restored.append([
                    "transactionId":         String(tx.id),
                    "originalTransactionId": String(tx.originalID),
                    "jwsToken":              result.jwsRepresentation,
                    "productId":             tx.productID,
                ])
            }
            call.resolve(["transactions": restored])
        }
    }

    // MARK: - openManageSubscriptions
    // iOS 15+ App Store 구독 관리 화면 (앱 내 직접 구독 취소 불가 → App Store로 안내)
    @objc func openManageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
                call.reject("no_foreground_scene")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
