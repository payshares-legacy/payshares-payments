Stellar Payments (Node)
=====================

### Processing Payments
```js
var StellarPayments = require('stellar-payments').Payments;
var config = {
    stellarAddress: "my-stellar-address",
    stellarSecretKey: "my-stellar-secret-key",
    db: {
        client: "mysql",
        connection: {
            host: "localhost",
            user: "root",
            database: "stellar-payments_test"
        }
    }
}

var payments = new StellarPayments(config);

processPayments();

// calls processPayments every 500 ms
function processPayments() {
    payments.processPayments()
        .then(function () {
            setTimeout(function () {
                processPayments();
            }, 500);
        });
}

```

### Creating Payments

```js
var PaymentsClient = require('stellar-payments').Client;
var config = {
    db: {
        client: "mysql",
        connection: {
            host: "localhost",
            user: "root",
            database: "stellar-payments_test"
        }
    }
}
var payments = new PaymentsClient(config);

// create a payment, amount is in stroops (microstellars)
payments.createNewPayment(STELLAR_ADDRESS, 1000000, "withdrawal");
```