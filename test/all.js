include('ringo/unittest');
var store = require('ringo/storage/hibernate');

exports.testSomething = function () {
    assertTrue(true);
};

if (require.main == module.id) {
    require('ringo/unittest').run(exports);
}
