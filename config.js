'use strict';

const { diff1 }  = require('./internals/primitives.js');

module.exports.RpcConf = {
    host: '127.0.0.1',
    port: 7332,
    user: 'rpcuser',
    password: 'rpcpassword'
};

module.exports.StratumConf = {
    port: 3334,
    extraNonce1Len: 4,
    shareTarget: diff1 / 16384n
};

// Recipient address
module.exports.Recipient = 'bc1q4lcelq3cwexfydpl5zdlev5e9sfhfl3wansn56';
// Node admin address
module.exports.Admin = 'bc1q4lcelq3cwexfydpl5zdlev5e9sfhfl3wansn56';
// 5% node fee
module.exports.AdminFee = 0.05;
// 2.5% developer donation
module.exports.Donation = 0.025;
