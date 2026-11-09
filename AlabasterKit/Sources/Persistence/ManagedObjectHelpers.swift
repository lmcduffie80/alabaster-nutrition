import CoreData
import Domain
import Foundation

public enum EntityName {
    public static let business = "Business"
    public static let employee = "Employee"
}

public extension NSManagedObjectContext {
    func fetchBusinessObject() throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: EntityName.business)
        request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: true)]
        request.fetchLimit = 1
        return try fetch(request).first
    }

    func fetchEmployeeObjects() throws -> [NSManagedObject] {
        let request = NSFetchRequest<NSManagedObject>(entityName: EntityName.employee)
        request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: true)]
        return try fetch(request)
    }
}

enum Mapping {
    static func business(from object: NSManagedObject) -> Business {
        Business(
            id: object.value(forKey: "id") as? UUID ?? UUID(),
            name: object.value(forKey: "name") as? String ?? "",
            timeZoneIdentifier: object.value(forKey: "timeZoneIdentifier") as? String ?? TimeZone.current.identifier,
            payPeriodRule: (object.value(forKey: "payPeriodRule") as? String).flatMap(PayPeriodRule.init(rawValue:)) ?? .weekly,
            payPeriodAnchor: object.value(forKey: "payPeriodAnchor") as? Date ?? Date(timeIntervalSince1970: 0),
            missingClockOutHours: (object.value(forKey: "missingClockOutHours") as? NSNumber)?.doubleValue ?? 12,
            kioskAutoReturnSeconds: (object.value(forKey: "kioskAutoReturnSeconds") as? NSNumber)?.intValue ?? 10
        )
    }

    static func employee(from object: NSManagedObject) -> Employee {
        Employee(
            id: object.value(forKey: "id") as? UUID ?? UUID(),
            displayName: object.value(forKey: "displayName") as? String ?? "",
            role: (object.value(forKey: "role") as? String).flatMap(EmployeeRole.init(rawValue:)) ?? .employee,
            colorIndex: (object.value(forKey: "colorIndex") as? NSNumber)?.intValue ?? 0,
            isActive: (object.value(forKey: "isActive") as? NSNumber)?.boolValue ?? true,
            participantRecordName: object.value(forKey: "participantRecordName") as? String
        )
    }
}
