// Run w/: $ ringo all

include('io');
include('ringo/unittest');
var store = require('ringo/storage/hibernate');

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

exports.testBasicQuery = function () {
    store.withSession(function (session) {
        assertEqual(0, session.createCriteria('Person').list().size());
    });
};

if (require.main == module.id) {
    require('ringo/unittest').run(exports);
}
