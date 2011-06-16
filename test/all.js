// Run w/, e.g.: $ ringo test/all

var assert = require('assert'),
    arrays = require('ringo/utils/arrays'),
    {Storable} = require('ringo-storable');
addToClasspath(module.resolve('./config')); // To retrieve and load Hibernate config resources.
var store = require('ringo-hibernate');
// Uncomment following line to test loading mappings from *.hbm.xml instead.
//store.setHbmXmlDir(require('fs').join(module.directory, 'config'));
var personId, person; // Define `Person` model w/ its O/R mapping.
var Person = store.defineEntity('Person', {
    table: 'persons',
    properties: {
        firstName: {type: 'string', nullable: false},
        lastName: {type: 'string', nullable: false},
        birthDate: {type: 'timestamp', nullable: false},
        birthYear: {type: 'integer'},
        ssn: {type: 'string', unique: true},
        vitae: {column: 'resume', type: 'text'}
    }
});
const FIRST_NAME_1 = 'Hans',
    FIRST_NAME_2 = 'Herbert',
    LAST_NAME = 'Wurst',
    BIRTH_DATE_MILLIS = 123456789000,
    BIRTH_YEAR = new Date(BIRTH_DATE_MILLIS).getFullYear(),
    SSN_1 = 'AT-1234291173',
    SSN_2 = 'AT-4321291173',
    SSN_3 = 'AT-1235291173',
    SSN_4 = 'AT-5321291173',
    VITAE = 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, ' +
        'sed diam nonumy eirmod tempor invidunt ut labore et dolore magna ' +
        'aliquyam erat, sed diam voluptua. At vero eos et accusam et justo ' +
        'duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata ' +
        'sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, ' +
        'consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ' +
        'ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero ' +
        'eos et accusam et justo duo dolores et ea rebum. Stet clita kasd ' +
        'gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.';

exports.setUp = function () {
    store.withSession(function (session) { // Clean table.
        session.createQuery('delete from Person').executeUpdate();
    });
    assert.isNull(Person.get(1));
};

exports.testPersistCreation = function () {
    person = createTestPerson();
    person.save();
    person = Person.get(1);
    assertPerson();
    assert.deepEqual(1, person._id);
    assert.deepEqual(['Person', 1], person._key);
    assert.deepEqual(FIRST_NAME_1, person.firstName);
    assert.deepEqual(LAST_NAME, person.lastName);
    assert.deepEqual(new Date(BIRTH_DATE_MILLIS), person.birthDate);
    assert.deepEqual(BIRTH_YEAR, person.birthYear);
    assert.deepEqual(VITAE, person.vitae);
};

exports.testPersistUpdating = function () {
    person = createTestPerson();
    person.save();
    person = Person.all()[0];
    assertPerson();
    personId = person._id;
    person.firstName = FIRST_NAME_2;
    person.save();
    person = Person.get(personId);
    assertPerson();
    assert.deepEqual(FIRST_NAME_2, person.firstName);
    assert.deepEqual(LAST_NAME, person.lastName);
    assert.deepEqual(new Date(BIRTH_DATE_MILLIS), person.birthDate);
    assert.deepEqual(BIRTH_YEAR, person.birthYear);
    assert.deepEqual(VITAE, person.vitae);
};

exports.testPersistDeletion = function () {
    person = createTestPerson();
    person.save();
    person = Person.all()[0];
    assertPerson();
    personId = person._id;
    person.remove();
    person = Person.get(personId);
    assert.isNull(person);
    assert.deepEqual(0, Person.all().length);
};

exports.testBasicQuerying = function () {
    person = createTestPerson();
    person.save();
    person = createTestPerson();
    person.firstName = FIRST_NAME_2;
    person.ssn = SSN_2;
    person.save();
    assert.isTrue(Person.all()[0] instanceof Storable &&
            Person.all()[0] instanceof Person);
    assert.deepEqual(2, Person.all().length);
    assert.deepEqual(LAST_NAME, Person.all()[0].lastName);
    store.withSession(function (session) {
        var hibernateQuery = session.createQuery('select p from Person p');
        var wrappedList = store.wrap(hibernateQuery.list());
        var wrappedListItem = store.wrap(hibernateQuery.list().get(1));
        assert.deepEqual(2, hibernateQuery.list().size());
        assert.deepEqual(2, wrappedList.length);
        assert.isTrue(wrappedList[0] instanceof Storable &&
                wrappedList[0] instanceof Person);
        assert.deepEqual(LAST_NAME, wrappedList[0].lastName);
        assert.isTrue(wrappedListItem instanceof Storable &&
                wrappedListItem instanceof Person);
        assert.deepEqual(FIRST_NAME_2, wrappedListItem.firstName);
        assert.deepEqual(2, session.createCriteria('Person').list().size());
    });
    var testQuery = Person.query().equals('lastName', LAST_NAME);
    assert.deepEqual(2, testQuery.select().length);
    var queriedPerson = Person.query().equals('firstName', FIRST_NAME_1).
            select()[0];
    assert.isTrue(queriedPerson instanceof Storable &&
            queriedPerson instanceof Person);
    assert.deepEqual(1, Person.query().equals('firstName', FIRST_NAME_1).select().
            length);
    assert.deepEqual(FIRST_NAME_1, Person.query().equals('firstName', FIRST_NAME_1).
            select('firstName')[0]);
    assert.deepEqual(2, Person.query().equals('lastName', LAST_NAME).select().
            length);
    assert.deepEqual(SSN_2, Person.query().equals('lastName', LAST_NAME).
            equals('firstName', FIRST_NAME_2).select('ssn')[0]);
    testGreaterLessQuerying();
    testOrderByQuerying();
    testSliceQuerying();
};

function testGreaterLessQuerying() {
    assert.deepEqual(2, Person.query().greater('birthYear', BIRTH_YEAR - 1).select().
            length);
    assert.deepEqual(0, Person.query().greater('birthYear', BIRTH_YEAR + 1).select().
            length);
    assert.deepEqual(2, Person.query().less('birthYear', BIRTH_YEAR + 1).select().
            length);
    assert.deepEqual(0, Person.query().less('birthYear', BIRTH_YEAR - 1).select().
            length);
    assert.deepEqual(2, Person.query().greaterEquals('birthYear', BIRTH_YEAR).
            select().length);
    assert.deepEqual(2, Person.query().greaterEquals('birthYear', BIRTH_YEAR - 1).
            select().length);
    assert.deepEqual(0, Person.query().greaterEquals('birthYear', BIRTH_YEAR + 1).
            select().length);
    assert.deepEqual(2, Person.query().lessEquals('birthYear', BIRTH_YEAR).select().
            length);
    assert.deepEqual(2, Person.query().lessEquals('birthYear', BIRTH_YEAR + 1).
            select().length);
    assert.deepEqual(0, Person.query().lessEquals('birthYear', BIRTH_YEAR - 1).
            select().length);
    assert.deepEqual(2, Person.query().greater('birthDate', new Date(
            BIRTH_DATE_MILLIS - 1000)).select().length);
    assert.deepEqual(0, Person.query().greater('birthDate', new Date(
            BIRTH_DATE_MILLIS)).select().length);
    assert.deepEqual(2, Person.query().less('birthDate', new Date(BIRTH_DATE_MILLIS +
            1000)).select().length);
    assert.deepEqual(0, Person.query().less('birthDate', new Date(BIRTH_DATE_MILLIS)
            ).select().length);
    assert.deepEqual(2, Person.query().greaterEquals('birthDate', new Date(
            BIRTH_DATE_MILLIS)).select().length);
    assert.deepEqual(2, Person.query().greaterEquals('birthDate', new Date(
            BIRTH_DATE_MILLIS - 1000)).select().length);
    assert.deepEqual(0, Person.query().greaterEquals('birthDate', new Date(
            BIRTH_DATE_MILLIS + 1000)).select().length);
    assert.deepEqual(2, Person.query().lessEquals('birthDate', new Date(
            BIRTH_DATE_MILLIS)).select().length);
    assert.deepEqual(2, Person.query().lessEquals('birthDate', new Date(
            BIRTH_DATE_MILLIS + 1000)).select().length);
    assert.deepEqual(0, Person.query().lessEquals('birthDate', new Date(
            BIRTH_DATE_MILLIS - 1000)).select().length);
    assert.deepEqual(LAST_NAME, Person.query().equals('lastName', LAST_NAME).
            greater('birthDate', new Date(BIRTH_DATE_MILLIS - 1000)).
            less('birthYear', BIRTH_YEAR + 1).select('lastName')[0]);
}

function testOrderByQuerying() {
    assert.deepEqual(2, Person.query().orderBy('ssn').select().length);
    assert.deepEqual(SSN_1, Person.query().orderBy('ssn').select('ssn')[0]);
    assert.deepEqual(2, Person.query().orderBy('-ssn').select().length);
    assert.deepEqual(SSN_2, Person.query().orderBy('-ssn').select('ssn')[0]);
    assert.deepEqual(2, Person.query().equals('lastName', LAST_NAME).
            orderBy('firstName').select().length);
    assert.deepEqual(FIRST_NAME_1, Person.query().equals('lastName', LAST_NAME).
            orderBy('firstName').select('firstName')[0]);
    assert.deepEqual(FIRST_NAME_2, Person.query().equals('lastName', LAST_NAME).
            orderBy('firstName').select('firstName')[1]);
    assert.deepEqual(2, Person.query().equals('lastName', LAST_NAME).
            orderBy('-firstName').select().length);
    assert.deepEqual(FIRST_NAME_2, Person.query().equals('lastName', LAST_NAME).
            orderBy('-firstName').select('firstName')[0]);
    assert.deepEqual(FIRST_NAME_1, Person.query().equals('lastName', LAST_NAME).
            orderBy('-firstName').select('firstName')[1]);
    assert['throws'](function () Person.query().orderBy('foo').select(),
            org.hibernate.QueryException);
    assert['throws'](function () Person.query().orderBy('-foo').select(),
            org.hibernate.QueryException);
}

function testSliceQuerying() {
    person = createTestPerson();
    person.ssn = SSN_3;
    person.save();
    person = createTestPerson();
    person.ssn = SSN_4;
    person.save();
    assert.deepEqual(4, Person.all().length);
    assert.deepEqual(2, Person.query().limit(2).select().length);
    assert.deepEqual(LAST_NAME, Person.query().limit(2).select('lastName')[0]);
    assert.deepEqual(2, Person.query().equals('lastName', LAST_NAME).
            limit(2).select().length);
    assert.deepEqual(FIRST_NAME_1, Person.query().equals('lastName', LAST_NAME).
            limit(2).select('firstName')[0]);
    assert.deepEqual(SSN_2, Person.query().equals('lastName', LAST_NAME).offset(1).
            select('ssn')[0]);
    assert.deepEqual(2, Person.query().equals('lastName', LAST_NAME).offset(1).
            limit(2).select().length);
    assert.deepEqual(SSN_3, arrays.peek(Person.query().equals(
            'lastName', LAST_NAME).offset(1).limit(2).select('ssn')));
    assert.deepEqual(3, Person.query().equals('lastName', LAST_NAME).range(1, 3).
            select().length);
    assert.deepEqual(SSN_4, arrays.peek(Person.query().equals(
            'lastName', LAST_NAME).range(1, 3).select('ssn')));
    assert['throws'](function () Person.query().offset(-1).select()[0]);
    assert.deepEqual(0, Person.query().offset(4).select().length);
    assert.isUndefined(Person.query().offset(4).select()[0]);
    assert.deepEqual(0, Person.query().range(4, 7).select().length);
    assert.isUndefined(Person.query().range(4, 7).select()[0]);
    assert.deepEqual(1, Person.query().range(3, 7).select().length);
    assert.deepEqual(SSN_4, Person.query().range(3, 7).select('ssn')[0]);
}

exports.testPersistInvalidEntity = function () {
    person = createTestPerson();
    person.save();
    person = createTestPerson(); // `ssn` must be unique.
    assert['throws'](function () person.save(), org.hibernate.exception.
            ConstraintViolationException);
    person = createTestPerson();
    person.firstName = 42; // `firstName` must be string.
    assert['throws'](function () person.save(), java.lang.ClassCastException);
    person = createTestPerson();
    person.lastName = new Date(); // `lastName` must be string.
    assert['throws'](function () person.save(), java.lang.ClassCastException);
    person = createTestPerson();
    person.birthDate = null; // `birthDate` mustn't be null.
    assert['throws'](function () person.save(), org.hibernate.
            PropertyValueException);
    assert['throws'](function () (new Person).save(), org.hibernate.
            PropertyValueException); // "Empty" person must fail.
    assert.deepEqual(1, Person.all().length);
};

function createTestPerson() {
    return new Person({firstName: FIRST_NAME_1, lastName: LAST_NAME,
            birthDate: new Date(BIRTH_DATE_MILLIS), birthYear: BIRTH_YEAR,
            ssn: SSN_1, vitae: VITAE});
}

function assertPerson() {
    assert.isNotNull(person);
    assert.isTrue(person instanceof Storable &&
            person instanceof Person);
}

if (require.main == module.id) {
    require('test').run(exports);
}
