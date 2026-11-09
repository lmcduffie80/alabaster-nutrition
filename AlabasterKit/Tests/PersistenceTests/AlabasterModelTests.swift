import CoreData
import Domain
import Testing
@testable import Persistence

struct AlabasterModelTests {
    let model = AlabasterModel.shared

    @Test func containsMilestoneOneEntities() {
        #expect(Set(model.entities.compactMap(\.name)) == ["Business", "Employee"])
    }

    @Test func businessHasNoWorkplaceLocation() {
        let attributes = model.entitiesByName["Business"]?.attributesByName ?? [:]
        #expect(Set(attributes.keys).isDisjoint(with: ["workplaceLatitude", "workplaceLongitude", "allowedRadiusMeters"]))
    }

    @Test func timeClockSettingsDefaultToTheDraftDefaults() {
        let attributes = model.entitiesByName["Business"]?.attributesByName
        #expect(attributes?["missingClockOutHours"]?.defaultValue as? Double == BusinessDraft.defaultMissingClockOutHours)
        #expect(attributes?["kioskAutoReturnSeconds"]?.defaultValue as? Double == BusinessDraft.defaultKioskAutoReturnSeconds)
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
