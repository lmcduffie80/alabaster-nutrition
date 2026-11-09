import CoreData

public enum AlabasterModel {
    /// One shared instance: multiple model instances with the same entities confuse Core Data.
    public static let shared: NSManagedObjectModel = makeModel()

    static func makeModel() -> NSManagedObjectModel {
        let business = NSEntityDescription()
        business.name = EntityName.business
        business.managedObjectClassName = NSStringFromClass(NSManagedObject.self)

        let employee = NSEntityDescription()
        employee.name = EntityName.employee
        employee.managedObjectClassName = NSStringFromClass(NSManagedObject.self)

        let employees = NSRelationshipDescription()
        employees.name = "employees"
        employees.destinationEntity = employee
        employees.minCount = 0
        employees.maxCount = 0
        employees.isOptional = true
        employees.deleteRule = .cascadeDeleteRule

        let owningBusiness = NSRelationshipDescription()
        owningBusiness.name = "business"
        owningBusiness.destinationEntity = business
        owningBusiness.minCount = 0
        owningBusiness.maxCount = 1
        owningBusiness.isOptional = true
        owningBusiness.deleteRule = .nullifyDeleteRule

        employees.inverseRelationship = owningBusiness
        owningBusiness.inverseRelationship = employees

        business.properties = [
            attribute("id", .UUIDAttributeType),
            attribute("name", .stringAttributeType),
            attribute("timeZoneIdentifier", .stringAttributeType),
            attribute("payPeriodRule", .stringAttributeType),
            attribute("payPeriodAnchor", .dateAttributeType),
            attribute("workplaceLatitude", .doubleAttributeType, default: NSNumber(value: 0.0)),
            attribute("workplaceLongitude", .doubleAttributeType, default: NSNumber(value: 0.0)),
            attribute("allowedRadiusMeters", .doubleAttributeType, default: NSNumber(value: 150.0)),
            attribute("missingClockOutHours", .doubleAttributeType, default: NSNumber(value: 12.0)),
            attribute("createdAt", .dateAttributeType),
            employees,
        ]

        employee.properties = [
            attribute("id", .UUIDAttributeType),
            attribute("displayName", .stringAttributeType),
            attribute("role", .stringAttributeType, default: "employee"),
            attribute("colorIndex", .integer16AttributeType, default: NSNumber(value: 0)),
            attribute("isActive", .booleanAttributeType, default: NSNumber(value: true)),
            attribute("participantRecordName", .stringAttributeType),
            attribute("createdAt", .dateAttributeType),
            owningBusiness,
        ]

        let model = NSManagedObjectModel()
        model.entities = [business, employee]
        return model
    }

    private static func attribute(_ name: String, _ type: NSAttributeType, default value: Any? = nil) -> NSAttributeDescription {
        let attribute = NSAttributeDescription()
        attribute.name = name
        attribute.attributeType = type
        attribute.isOptional = true
        attribute.defaultValue = value
        return attribute
    }
}
