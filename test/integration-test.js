var Promise     = require("bluebird");
var _           = require("lodash");
var assert      = require('assert');
var sinon       = require('sinon');

var helper      = require("./test-helper");
var Fixtures    = require("./fixtures");

var Payments        = require('../lib/payments');
var PaysharesNetwork  = require('../lib/payshares-network');
var PaysharesStubby   = require('./paysharesd-stubby');
var Database     = require('../lib/database');

var sandbox = sinon.sandbox.create();

describe("signing submitting and confirming", function () {
    // payments instance under test
    var payments;
    // payshares network stubbed implementation
    var stubby;
    // the per test fixtures
    var fixtures = Fixtures.MixedTransactions.fixtures;
    beforeEach(function (done) {
        stubby = new PaysharesStubby();
        var config = _.assign(helper.config, {
            network: stubby,
            logger: helper.logger
        });
        var database = new Database({connection: helper.db, logger: helper.logger});
        config.database = database;
        payments = new Payments(config);
        loadTransactionFixtures(fixtures)
            .then(function () {
                return processPayments(Fixtures.MixedTransactions.processPaymentsRounds, fixtures, stubby, payments);
            })
            .then(function () {
                done();
            });
    });
    afterEach(function (done) {
        sandbox.restore();
        done();
    });
/*
    // For each fixture in the array, generate a describe block, and "it" style tests from the fixture's expecations array.
    _.each(fixtures, function (fixture) {
        describe(fixture.getTitle(), function () {
            _.each(fixture.getExpectations(), function (expectation) {
                generateExpectationTest(fixture, expectation);
            });
        });
    });
*/
});

// loads an array of Transaction objects into the Transaction table
function loadTransactionFixtures(fixtures) {
    var loadTransactionFixture = function (fixture) {
        return helper.db("Transactions").insert(fixture.getRecord());
    };
    return Promise.all(_.map(fixtures, loadTransactionFixture));
}

/**
* Runs processPayments the given number of iterations. Before each iteration, runs the corresponding
* stub functions in the fixtures array.
*/
function processPayments(iterations, fixtures, stubby, payments) {
    var array = [];
    for (var i = iterations - 1; i >=0 ; i--) {
        var fn = function (index) {
            return function () {
                runStubs(fixtures, stubby, index);
                return payments.processPayments.bind(payments)();
            };
        };
        array[i] = fn(i);
    }

    return Promise.each(array, function (fn) {
        return fn();
    });
}

/**
* Generates an "it" style test from the given expectation function, passing it its corresponding db row.
*/
function generateExpectationTest(fixture, expectation) {
    it(expectation.title, function (done) {
        selectRecord(fixture.getRecord().id)
            .then(expectation.expectation)
            .then(function () {
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });
}

/**
* Fetch an individual row from the databse with the given id.
*/
function selectRecord(id) {
    return helper.db("Transactions")
        .where({id: id})
        .select()
        .then(_.first);
}

/**
* Runs the stub function at the given index in the stub array.
*/
function runStubs(fixtures, stubby, index) {
    _.each(fixtures, function (fixture) {
        var fn = fixture.getStubs()[index];
        if (!fn) {
            return;
        }
        fn(stubby);
    });
}
