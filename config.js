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
    paysharesAddress: "xnnr5zYTKGCSSKXocCCtQedidX4pQFiJaz",
    paysharesSecretKey: "sfgLNYuaKyKxrGoVRqMMHX3pUK7e1ZGMkMeHonbJpnfiFqnthYi",
    paysharesdIp: "test.payshares.org",
    paysharesdRpcPort: 5015,
    paysharesdWebsocketPort: 5016
}
