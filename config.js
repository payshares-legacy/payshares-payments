module.exports = {
    db: {
        client   : "mysql",
        connection: {
            //host:"your_host_name",
            //password:"your_password",
            user       : "root",
            database : "payshares-payments_test"
        }
    },
    maxTransactionsInFlight: 10,
    paysharesAddress: "gM3a41VDi7fBj8EZBqnBGkGPGz4idBquro",
    paysharesSecretKey: "s3ghL92vyTCYYMW9HLNSTHnJxtzkx9eSBAiwQFnukHNNLURM3W5",
    paysharesdIp: "test.payshares.org",
    paysharesdRpcPort: 9002,
    paysharesdWebsocketPort: 9001
}
