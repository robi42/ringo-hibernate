// Run w/: $ ringo all

include('io');
include('ringo/unittest');
var store = require('ringo/storage/hibernate');
var person, Person = store.defineClass('Person');
const FIRST_NAME_1 = 'Hans';
const FIRST_NAME_2 = 'Herbert';
const LAST_NAME = 'Wurst';

// Setup DB.
var process = java.lang.Runtime.runtime.exec(['mysql', '-u', 'root', '-e',
        'DROP DATABASE IF EXISTS ringotest; CREATE DATABASE ringotest;']);
try {
    process.waitFor();
} finally {
    new TextStream(new Stream(process.inputStream)).copy(system.stdout);
    new TextStream(new Stream(process.errorStream)).copy(system.stderr);
}

exports.testSessionInit = function () {
    assertNotNull(store.getSession());
};

exports.testPersistCreation = function () {
    person = new Person();
    person.firstName = FIRST_NAME_1;
    person.lastName = LAST_NAME;
    person.save();
    person = Person.get(1);
    assertNotNull(person);
    assertEqual(FIRST_NAME_1, person.firstName);
    assertEqual(LAST_NAME, person.lastName);
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
};

exports.testBasicQuerying = function () {
    store.withSession(function (session) {
        assertEqual(1, session.createCriteria('Person').list().size());
    });
    assertEqual(1, Person.all().length);
    assertEqual(LAST_NAME, Person.all()[0].lastName);
};

if (require.main == module.id) {
    require('ringo/unittest').run(exports);
}
