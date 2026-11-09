import CoreData
import Testing
@testable import Persistence

struct AlabasterModelTests {
    let model = AlabasterModel.shared

    @Test func containsMilestoneOneEntities() {
        #expect(Set(model.entities.compactMap(\.name)) == ["Business", "Employee"])
    }

    @Test func everyAttributeIsOptionalOrDefaulted() {
        for entity in model.entities {
            for attribute in entity.attributesByName.values {
                #expect(attribute.isOptional || attribute.defaultValue != nil,
                        "\(entity.name ?? "?").\(attribute.name)")
            }
        }
    }

    @Test func noUniquenessConstraints() {
        for entity in model.entities {
            #expect(entity.uniquenessConstraints.isEmpty, "\(entity.name ?? "?")")
        }
    }

    @Test func relationshipsAreOptionalUnorderedWithInverses() {
        for entity in model.entities {
            for relationship in entity.relationshipsByName.values {
                let label = "\(entity.name ?? "?").\(relationship.name)"
                #expect(relationship.isOptional, "\(label) optional")
                #expect(!relationship.isOrdered, "\(label) unordered")
                #expect(relationship.inverseRelationship != nil, "\(label) inverse")
                #expect(relationship.deleteRule != .denyDeleteRule, "\(label) not deny")
                #expect(relationship.inverseRelationship?.inverseRelationship === relationship, "\(label) symmetric inverse")
                #expect(relationship.inverseRelationship?.entity === relationship.destinationEntity, "\(label) inverse on destination")
            }
        }
    }
}
