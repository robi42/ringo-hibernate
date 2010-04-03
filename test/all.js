// Run w/: $ ringo all

include('ringo/unittest');
var store = require('ringo/storage/hibernate');
var person, Person = store.defineClass('Person');
const FIRST_NAME_1 = 'Hans';
const FIRST_NAME_2 = 'Herbert';
const LAST_NAME = 'Wurst';
const BIRTH_DATE_MILLIS = 123456789000;

exports.testSessionInit = function () {
    assertTrue(store.getSession() instanceof org.hibernate.Session);
};

exports.testPersistCreation = function () {
    person = new Person();
    person.firstName = FIRST_NAME_1;
    person.lastName = LAST_NAME;
    person.birthDate = new Date(BIRTH_DATE_MILLIS);
    person.save();
    person = Person.get(1);
    assertNotNull(person);
    assertEqual(FIRST_NAME_1, person.firstName);
    assertEqual(LAST_NAME, person.lastName);
    assertEqual(BIRTH_DATE_MILLIS, person.birthDate.time);
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
};

exports.testBasicQuerying = function () {
    store.withSession(function (session) {
        assertEqual(1, session.createCriteria('Person').list().size());
    });
    assertEqual(1, Person.all().length);
    assertEqual(LAST_NAME, Person.all()[0].lastName);
};

// TODO: deletion functionality's currently slightly broken.
/*exports.*/var testPersistDeletion = function () {
    person.remove(); // FIXME.
    person = Person.get(1);
    assertNull(person);
    assertEqual(0, Person.all().length);
};

if (require.main == module.id) {
    require('ringo/unittest').run(exports);
}
