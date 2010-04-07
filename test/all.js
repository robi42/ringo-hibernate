// Run w/: $ ringo all

include('ringo/unittest');
var store = require('ringo/storage/hibernate');
var person, Person = store.defineClass('Person',
        {firstName: {type: 'string',    nullable: false},
         lastName:  {type: 'string',    nullable: false},
         birthDate: {type: 'timestamp', nullable: false},
         vitae:     {column: 'resume',  type: 'text', unique: true}});
const FIRST_NAME_1 = 'Hans';
const FIRST_NAME_2 = 'Herbert';
const LAST_NAME = 'Wurst';
const BIRTH_DATE_MILLIS = 123456789000;
const VITAE = 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, ' +
        'sed diam nonumy eirmod tempor invidunt ut labore et dolore magna ' +
        'aliquyam erat, sed diam voluptua. At vero eos et accusam et justo ' +
        'duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata ' +
        'sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, ' +
        'consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ' +
        'ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero ' +
        'eos et accusam et justo duo dolores et ea rebum. Stet clita kasd ' +
        'gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.'

exports.testSessionInit = function () {
    assertTrue(store.getSession() instanceof org.hibernate.Session);
};

exports.testPersistCreation = function () {
    person = createTestPerson();
    person.save();
    person = Person.get(1);
    assertNotNull(person);
    assertEqual(FIRST_NAME_1, person.firstName);
    assertEqual(LAST_NAME, person.lastName);
    assertEqual(BIRTH_DATE_MILLIS, person.birthDate.time);
    assertEqual(VITAE, person.vitae);
};

exports.testPersistUpdating = function () {
    person = Person.all()[0];
    assertNotNull(person);
    person.firstName = FIRST_NAME_2;
    person.save();
    person = Person.get(1);
    assertNotNull(person);
    assertEqual(FIRST_NAME_2, person.firstName);
    assertEqual(LAST_NAME, person.lastName);
    assertEqual(BIRTH_DATE_MILLIS, person.birthDate.time);
    assertEqual(VITAE, person.vitae);
};

exports.testBasicQuerying = function () {
    store.withSession(function (session) {
        assertEqual(1, session.createCriteria('Person').list().size());
    });
    assertEqual(1, Person.all().length);
    assertEqual(LAST_NAME, Person.all()[0].lastName);
};

exports.testPersistDeletion = function () {
    person.remove();
    person = Person.get(1);
    assertNull(person);
    assertEqual(0, Person.all().length);
};

exports.testPersistInvalidEntity = function () {
    person = createTestPerson();
    person.save();
    person = createTestPerson(); // `vitae/resume` must be unique.
    assertThrows(function () person.save(), org.hibernate.exception.
            ConstraintViolationException);
    person = createTestPerson();
    person.firstName = 42; // `firstName` must be string.
    assertThrows(function () person.save(), java.lang.ClassCastException);
    person = createTestPerson();
    person.lastName = new Date(); // `lastName` must be string.
    assertThrows(function () person.save(), java.lang.ClassCastException);
    person = createTestPerson();
    person.birthDate = null; // `birthDate` mustn't be null.
    assertThrows(function () person.save(), org.hibernate.
            PropertyValueException);
    assertThrows(function () (new Person).save(), org.hibernate.
            PropertyValueException); // "Empty" person must fail.
};

function createTestPerson() {
    return new Person({firstName: FIRST_NAME_1, lastName: LAST_NAME,
            birthDate: new Date(BIRTH_DATE_MILLIS), vitae: VITAE});
}

if (require.main == module.id) {
    require('ringo/unittest').run(exports);
}
